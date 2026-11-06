# A API do chat: lista, conversa, atribuição e atributos. Mensagens em ChatMessagesController,
# etiquetas em ChatTagsController. Junta `v1/conversations`, `v2/conversations` e
# `platform/conversations` da origem.
#
# Quem vê o quê sai de `chat_list_to` (ver Chat.visible_to): conversa fora disso responde 404,
# inclusive para escrever. Na origem a lista respeitava a regra, e a conversa aberta por id, não.
class ChatsController < PlatformController
  include InboxAccess

  # Os tipos que conversam. Calendário é conector na origem, mas não é canal de atendimento.
  CHAT_CONNECTOR_TYPES = %w[
    Connector::WhatsappWeb Connector::WhatsappCloud Connector::Zapi Connector::InstagramDirect
    Connector::FacebookMessenger Connector::LeadChat Connector::WebWidget
  ].freeze
  # Quem começa conversa pelo número: Instagram, Messenger e widget só respondem.
  PHONE_CONNECTOR_TYPES = %w[Connector::WhatsappWeb Connector::WhatsappCloud Connector::Zapi].freeze

  LOOKUP_LIMIT = 10
  MAX_ATTRIBUTES = 200
  INVALID_ATTRIBUTE_KEY = /[.$]/

  # Chaves dos atributos são dados da pessoa.
  self.opaque_params += %w[attributes]

  # Pipelines e agenda vinculam conversa a um card ou a um evento. É só para escolher.
  require_any_permission :chat, :contacts, :pipelines, :calendar, only: :lookup
  require_permission :chat, except: :lookup

  before_action :set_chat, only: %i[show update destroy update_attributes read suggest_reply]

  # GET /chats e POST /chats/search, para quando os filtros não cabem na URL.
  #
  # Sem `total`: contar a cada página de uma lista que recarrega a todo evento custaria um
  # índice inteiro da organização, e a tela só precisa saber se há mais.
  def index
    page = [ params[:page].to_i, 1 ].max
    size = (params[:per_page].presence || Paginated::DEFAULT_PER_PAGE).to_i.clamp(1, Paginated::MAX_PER_PAGE)
    query = Chats::ListQuery.new(account: current_account, params: params, time_zone: organization_time_zone)

    rows = query.criteria.offset((page - 1) * size).limit(size + 1).to_a
    has_more = rows.size > size
    rows = rows.first(size)
    rows = with_pinned_chat(rows)

    render json: { chats: ChatSerializer.many(rows), meta: { page: page, perPage: size, hasMore: has_more } }
  end

  # GET /chats/lookup?q=: para escolher uma conversa em outra tela. Só o necessário.
  def lookup
    scope = Chat.visible_to(current_account).valid_records
    clause = Chats::SearchTerm.clause(params[:q])
    scope = scope.where("$and" => [ clause ]) if clause

    records = scope.only(:_id, :user_name, :display_name, :external_id, :profile_picture_url)
                   .order_by(last_message_at: :desc)
                   .limit(LOOKUP_LIMIT)

    render json: { chats: records.map { |chat| lookup_entry(chat) } }
  end

  def show
    render json: {
      chat: ChatSerializer.one(@chat),
      attributeList: Chats::Metadata.attribute_list(current_organization),
      connectorProvider: Chats::Metadata.connector_provider(@chat)
    }
  end

  # POST /chats { connectorId, externalId, userName, phoneNumberId? }
  #
  # Já existe conversa com esse número nesse canal: sobe na lista e responde 200. Corpo solto,
  # como em /connectors: é uma ação, com mais campos do que a conversa em si.
  def create
    connector = Connector::Base.scoped(current_organization.id, params[:connector_id])
    return render_error(status: :unprocessable_content, code: "invalidConnector", field: "connectorId") unless connector
    return render_error(status: :unprocessable_content, code: "connectorTypeMismatch", field: "connectorId") unless PHONE_CONNECTOR_TYPES.include?(connector._type)

    phone = params[:external_id].to_s
    return render_error(status: :unprocessable_content, code: "invalidPhone", field: "externalId") if BrPhoneVariants.digits_of(phone).blank?

    sender = connector.is_a?(Connector::WhatsappCloud) ? params[:phone_number_id].presence || connector.phone_number_id : nil

    existing = Chats::Locator.find(connector: connector, phone: phone, sender_phone_number_id: sender)
    if existing
      existing.update(last_message_at: Time.current)
      return render json: { chat: ChatSerializer.one(existing) }
    end

    chat = Chats::Locator.find_or_create(
      connector: connector,
      phone: phone,
      sender_phone_number_id: sender,
      attributes: { user_name: params[:user_name].to_s.presence }
    )

    render json: { chat: ChatSerializer.one(chat) }, status: :created
  end

  # PATCH /chats/:id { chat: { automationEnabled, assignedAccountId, teamId, notes, status, displayName } }
  def update
    attributes = chat_params
    return render_invalid_assignee unless assignee_allowed?(attributes)
    return render_invalid_team unless team_allowed?(attributes)

    @chat.updated_by_account = current_account
    @chat.assign_attributes(attributes.merge(automation_schedule_reset(attributes)))

    if @chat.save
      render json: { chat: ChatSerializer.one(@chat) }
    else
      render_invalid(@chat)
    end
  end

  # Apaga de verdade, com as mensagens e a mídia.
  def destroy
    Chats::Remover.call(@chat)
    head :no_content
  end

  # PUT /chats/:id/attributes { customAttributes: { chave: valor } }. Substitui o mapa inteiro.
  def update_attributes
    attributes = custom_attributes_param
    return render_error(status: :unprocessable_content, code: "invalidAttributes", field: "customAttributes") if attributes.nil?

    @chat.update!(custom_attributes: attributes)

    render json: { customAttributes: @chat.custom_attributes }
  end

  # POST /chats/:id/read: zera as não lidas sem depender de abrir o histórico.
  def read
    @chat.update(unread_messages: 0) if @chat.unread_messages.to_i.positive?

    render json: { chat: ChatSerializer.one(@chat) }
  end

  # GET /chats/self-filter: os canais, para os filtros e o seletor do chat.
  def self_filter
    connectors = Connector::Base.where(organization_id: current_organization.id.to_s, :_type.in => CHAT_CONNECTOR_TYPES)
                                .order_by(created_at: :asc)

    render json: { connectors: ConnectorSerializer.many(connectors) }
  end

  # GET /chats/people: quem pode receber atendimento. Quem está em `setupOnly` configura, mas
  # não atende: não aparece, e atribuir a essa pessoa responde 422.
  def people
    accounts = Chats::Assignment.assignable_accounts(current_organization)
                                .includes(:team_memberships).with_attached_avatar.order(:name, :id)

    render json: { people: accounts.map { |account| PersonSerializer.directory_entry(account) } }
  end

  # GET /chats/teams: departamentos, com `visible` dizendo os que a pessoa enxerga.
  def teams
    mine = current_account.team_ids.to_set
    sees_all = chat_list_level == "all"

    render json: {
      teams: current_organization.teams.order(:name, :id).map do |team|
        { id: team.id, name: team.name, visible: sees_all || mine.include?(team.id) }
      end
    }
  end

  # GET /chats/access: o que `chat_list_to` libera, para a tela montar os filtros.
  def access
    case chat_list_level
    when "assigned"
      render json: { access: "assigned", accountId: current_account.id }
    when "team"
      render json: { access: "team", teamIds: current_account.team_ids }
    else
      render json: { access: "all" }
    end
  end

  # POST /chats/:id/suggest-reply: a resposta que a IA sugere. Não envia nada: a pessoa decide.
  def suggest_reply
    result = Chats::SuggestReply.call(chat: @chat, organization: current_organization)

    render json: { messages: result.messages, credits: result.credits }
  rescue Organization::NoCreditsError
    render_error(status: :unprocessable_content, code: "noCredits")
  rescue Ai::Run::Busy
    render_error(status: :conflict, code: "busy")
  rescue Ai::Chat::MissingKey, Ai::Chat::Failed => e
    Rails.logger.error("[ChatsController#suggest_reply] #{e.class}: #{e.message}")
    render_error(status: :service_unavailable, code: "suggestionFailed")
  end

  private

  def set_chat
    @chat = find_visible_chat(params[:id])
    render_not_found unless @chat
  end

  def chat_params
    params.expect(chat: %i[automation_enabled assigned_account_id team_id notes status display_name]).to_h
  end

  def assignee_allowed?(attributes)
    return true unless attributes.key?("assigned_account_id")

    attributes["assigned_account_id"] = attributes["assigned_account_id"].presence
    assignee = attributes["assigned_account_id"]
    # Tirar a atribuição, e não mudar quem já está: conversa atribuída a quem virou `setupOnly`
    # depois continua podendo ser editada.
    assignee.nil? || assignee == @chat.assigned_account_id || Chats::Assignment.assignable?(current_organization, assignee)
  end

  def team_allowed?(attributes)
    return true unless attributes.key?("team_id")

    attributes["team_id"] = attributes["team_id"].presence
    attributes["team_id"].nil? || Chats::Assignment.valid_team?(current_organization, attributes["team_id"])
  end

  # Mudar a automação à mão invalida o religamento agendado: sem isto, uma pausa decidida pela
  # pessoa desfazia sozinha quando o agendamento de uma pausa anterior chegasse (o token
  # mora em `active_job_id`), e a tela seguia mostrando "volta em X".
  def automation_schedule_reset(attributes)
    return {} unless attributes.key?("automation_enabled")

    { active_job_id: nil, automation_resume_at: nil }
  end

  # Valor de campo é sempre texto no Mongo: é o que as comparações do produto esperam. Mapa de
  # sistema fica como está. Chave com ponto ou `$` não é endereçável depois.
  def custom_attributes_param
    raw = params[:custom_attributes]
    raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
    return nil unless raw.is_a?(Hash)
    return nil if raw.size > MAX_ATTRIBUTES
    return nil if raw.keys.any? { |key| key.to_s.match?(INVALID_ATTRIBUTE_KEY) || key.to_s.blank? }

    raw.to_h.transform_values do |value|
      case value
      when Numeric, TrueClass, FalseClass then value.to_s
      else value
      end
    end
  end

  # `cid`: a conversa aberta por link entra na primeira página, mesmo fora do recorte.
  def with_pinned_chat(rows)
    return rows if params[:cid].blank? || rows.any? { |chat| chat.id.to_s == params[:cid].to_s }

    pinned = find_visible_chat(params[:cid])
    pinned ? rows + [ pinned ] : rows
  end

  def lookup_entry(chat)
    {
      id: chat.id.to_s,
      userName: chat.user_name,
      displayName: chat.display_name,
      externalId: chat.external_id,
      profilePictureUrl: chat.profile_picture_url
    }
  end

  def chat_list_level
    current_account.permission_level(:chat_list_to)
  end

  def render_invalid_assignee
    render_error(status: :unprocessable_content, code: "invalidAssignee", field: "assignedAccountId")
  end

  def render_invalid_team
    render_error(status: :unprocessable_content, code: "invalidTeam", field: "teamId")
  end
end
