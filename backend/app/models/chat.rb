# A conversa com um contato em um canal (`Connector`). É a origem `Conversation`,
# sem o assistente: quem automatiza aqui é o Fluxo, e o único ponto de entrada dele é
# `Flows::InboundDispatcher` (ver `Chats::InboundFlow`).
#
# Regra de escala (docs/migration/CONVENTIONS.md): nunca buscar só por id. Use
# `Chat.scoped(organization_id, id)` ou escope pelo conector.
class Chat
  include Mongoid::Document
  include Mongoid::Timestamps
  include CsvExportable

  # Cada domínio declara as próprias associações em app/models/concerns/chat_relations/
  # em vez de disputar este arquivo.
  include ChatRelations::Inbox
  include ChatRelations::Pipelines
  include ChatRelations::Agenda
  include ChatRelations::Outreach
  include ChatRelations::Automation

  # Quem fez a alteração, para as notas do histórico dizerem o nome da pessoa.
  attr_accessor :updated_by_account
  # Marcado por quem pausa/religa a automação e já registrou o motivo no chat
  # (ex.: nota `automation-stopped`), para o hook não criar uma segunda nota.
  attr_accessor :automation_toggle_noted
  # Liga-desliga as transmissões (seed, migrações, criação em duas etapas).
  attr_accessor :ignore_events

  STATUSES = %w[open closed].freeze
  # Conversa de teste que não entra nas listas. Veio da origem.
  TEST_EXTERNAL_ID = "9999999999@whatsapp".freeze

  field :organization_id, type: String

  field :automation_enabled, type: Boolean, default: true
  field :status, type: String, default: "open"
  field :user_name, type: String
  field :display_name, type: String

  # Para Facebook e Instagram: o @username do contato naquela rede.
  field :audience_user_name, type: String

  field :external_id, type: String
  field :external_lid, type: String
  # whatsapp_api, import_feature, instagram, facebook, web
  field :audience_type, type: String, default: "whatsapp_api"

  # Token do `EnableContactJob` vigente. O job só religa a automação se o token que
  # recebeu ainda for este: pausar de novo troca o token e o agendamento antigo morre
  # sozinho, sem precisar desagendar nada no Redis.
  field :active_job_id, type: String
  # Quando a automação foi pausada por intervenção humana, o horário em que volta.
  field :automation_resume_at, type: Time
  # Disparo para os fluxos adiado para a próxima janela de atendimento (uma vez só).
  field :scheduled_outside_business_work, type: DateTime

  field :tags, type: Array, default: []
  field :summary, type: String, default: ""
  field :notes, type: String

  field :last_message_at, type: DateTime, default: -> { Time.now }
  field :last_message_type, type: String
  field :last_message_by, type: String
  field :last_message_content, type: String
  field :unread_messages, type: Integer, default: 0

  field :assigned_account_id, type: String
  field :team_id, type: String

  field :profile_picture_url, type: String
  field :origin_phone_number, type: String
  field :contact_origin, type: String
  field :custom_attributes, type: Hash, default: {}
  field :contact_storage, type: Hash, default: {}
  # Dados coletados pelos fluxos nesta conversa: { "<flow_id>" => { "<chave>" => valor } }.
  field :flow_data, type: Hash, default: {}
  field :flow_next_node_id, type: String
  # Posição no funil: { "<funnel_id>" => "<stage_id>" }. Mexida na tela e por bloco de fluxo.
  field :funnel_stages, type: Hash, default: {}

  field :sender_phone_number_id, type: Integer
  field :red_flag_count, type: Integer, default: 0
  field :session_start_at, type: Time

  # LeadChat
  field :external_fields, type: Hash, default: {}
  field :origin_entry_point, type: String

  # Web widget: contexto da página fornecido pelo site onde o chat está instalado
  # (higienizado por Widget::ContextSanitizer). Seções: page, product, visitor, events.
  field :widget_context, type: Hash, default: {}

  validates :organization_id, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :display_name, length: { maximum: 120 }, allow_blank: true

  has_many :chat_messages, class_name: "ChatMessage::Base", inverse_of: :chat, dependent: :destroy

  belongs_to :connector, class_name: "Connector::Base", optional: true
  belongs_to :audience, class_name: "Audience", optional: true

  # De um lado só (a lista mora na conversa). A origem mantinha também
  # `conversation_ids` na etiqueta: um array que cresce sem teto a cada conversa
  # marcada, num documento único. Quem precisa do inverso usa `ChatTag#chats`.
  has_and_belongs_to_many :chat_tags, class_name: "ChatTag", inverse_of: nil

  index({ organization_id: 1 })
  index({ connector_id: 1, external_id: 1 })
  index({ connector_id: 1, external_id: 1, sender_phone_number_id: 1 })
  index({ connector_id: 1, external_lid: 1 })
  # Lista de conversas e contatos unificados: $match(organização) + $sort(última mensagem).
  index({ organization_id: 1, last_message_at: -1 })
  index({ organization_id: 1, external_id: 1, last_message_at: -1 })
  # Dashboards: $match da organização + intervalo de datas.
  index({ organization_id: 1, created_at: -1 })
  # Dashboards: filtros e $lookup por etiqueta (multikey).
  index({ organization_id: 1, chat_tag_ids: 1 })

  scope :valid_records, -> { where.not(external_id: TEST_EXTERNAL_ID) }
  scope :for_organization, ->(organization_id) { where(organization_id: organization_id.to_s) }
  scope :within_range, ->(range) { where(:created_at.gte => range.first, :created_at.lt => range.last) }

  before_create :assign_or_create_audience
  after_create :dispatch_event!

  before_update :log_automation_toggle
  before_update :log_assignment_change
  after_update :dispatch_event!

  # A única forma de carregar uma conversa por id: escopada pela organização.
  def self.scoped(organization_id, id)
    where(organization_id: organization_id.to_s, id: id).take
  end

  def organization
    @organization ||= Organization.find_by(id: organization_id) if organization_id
  end

  # O `Contact` da origem era um stub num banco externo que ninguém mais escreve.
  # Contato aqui é a própria conversa: ver `Contact`.
  def contact
    Contact.from_chat(self)
  end

  def phone_number
    external_id.to_s.split("@").first
  end

  def set_default_session!
    self.session_start_at = chat_messages.unscoped.where(
      role: "user",
      :created_at.gte => 1.day.ago
    ).order_by(created_at: :asc).first&.created_at || created_at
    save!
  end

  def active_session
    return false if session_start_at.blank?

    sao_paulo_zone = ActiveSupport::TimeZone["America/Sao_Paulo"]
    session_time = session_start_at.in_time_zone(sao_paulo_zone)
    current_time = Time.current.in_time_zone(sao_paulo_zone)

    session_time >= current_time - 24.hours
  end
  alias active_session? active_session

  # Sincroniza um grupo mutuamente exclusivo de etiquetas de sistema: garante a
  # tag `keep` e remove as demais do mesmo grupo. `keep` nil apenas remove.
  #
  # Usa operadores atômicos do Mongo ($addToSet / $pullAll) em vez de
  # `chat_tags << tag; save!` para não disparar os callbacks pesados de Chat
  # nem sobrescrever edições concorrentes de etiquetas.
  def sync_system_tags!(group, keep)
    keys = ChatTag::SYSTEM_TAG_GROUPS.fetch(group)
    raise ArgumentError, "invalid tag #{keep.inspect} for group #{group}" unless keep.nil? || keys.include?(keep)
    return if organization_id.blank?

    if keep
      tag = ChatTag.system_tag!(keep, organization_id)
      add_to_set(chat_tag_ids: tag.id) unless chat_tag_ids.include?(tag.id)
    end

    drop_ids = ChatTag
               .where(:name.in => ChatTag.system_tag_names(keys - [ keep ]), organization_id: organization_id)
               .pluck(:id) & chat_tag_ids
    pull_all(chat_tag_ids: drop_ids) if drop_ids.any?
  end

  # Etiqueta (criando se preciso) sem passar pelos callbacks de Chat.
  def add_tag!(name, color: ChatTag::DEFAULT_COLOR)
    tag = ChatTag.find_or_create_by(name: name.to_s.parameterize.dasherize, organization_id: organization_id) do |new_tag|
      new_tag.color = color
    end
    add_to_set(chat_tag_ids: tag.id) unless chat_tag_ids.include?(tag.id)
    tag
  end

  # Registra no chat toda transição de `automation_enabled`: com operador
  # (`updated_by_account`) diz quem foi, nas mudanças do backend a mensagem é genérica.
  # Fica de fora quem marca `automation_toggle_noted`.
  # `update_all` e `set` não passam por callbacks e não geram nota.
  def log_automation_toggle
    already_noted = automation_toggle_noted
    self.automation_toggle_noted = nil
    return if already_noted || !automation_enabled_changed?

    ChatMessage::Text.create(
      role: "base",
      content: automation_toggle_note,
      role_base_type: "automation-toggle-notation",
      chat: self
    )
  end

  def automation_toggle_note
    action = automation_enabled ? "resumed" : "paused"
    if updated_by_account
      I18n.t("connectors.notes.automation_#{action}_by", name: updated_by_account.name)
    else
      I18n.t("connectors.notes.automation_#{action}")
    end
  end

  def dispatch_event!
    return if ignore_events

    broadcast_to_lists(action: :upsert, event: ChatSerializer.one(self))
  end

  # Remove a conversa das listagens conectadas, reusando os mesmos streams do upsert.
  def dispatch_removal!
    return if ignore_events

    broadcast_to_lists(action: :remove, event: { id: id.to_s })
  end

  # O histórico é criado ANTES do envio (status 'pending') para que a tentativa fique visível
  # no chat mesmo quando o conector falha: nesse caso ele é marcado como 'failed' com a causa
  # em status_message, e a exceção segue propagando para o caller decidir sobre retry.
  # Mesmo padrão do envio de template em Chats::SendTemplate.
  def send_text_message(message, sender = nil, attr = {})
    history = ChatMessage::Text.create(
      role: "assistant",
      content: message,
      chat: self,
      sender_name: sender || organization&.name,
      status: "pending",
      **attr
    )

    text_message_id = begin
      connector.send_text_message(phone_number, message, self)
    rescue StandardError => e
      history.update(status: "failed", status_message: e.message)
      raise
    end

    update(
      last_message_at: Time.now,
      last_message_type: "text",
      last_message_by: "assistant",
      last_message_content: message
    )

    history.update(
      message_id: text_message_id,
      status: text_message_id ? "pending" : "failed"
    )
    history
  end

  def send_text_message_without_event(message, sender, update_event, attr = {})
    send_error = nil
    text_message_id = begin
      connector.send_text_message(phone_number, message, self)
    rescue StandardError => e
      Rails.logger.error("Failed to send text message: #{e.message}")
      send_error = e.message
      nil
    end

    new_last_message_at = update_event ? Time.now : Time.now - 6.months
    update(
      last_message_at: new_last_message_at,
      last_message_type: "text",
      last_message_by: "assistant",
      last_message_content: message
    )

    ChatMessage::Text.create(
      role: "assistant",
      content: message,
      chat: self,
      sender_name: sender || organization&.name,
      message_id: text_message_id,
      status: text_message_id ? "pending" : "failed",
      status_message: send_error,
      # Este fluxo gerencia last_message_at propositalmente (pode ser 6 meses atrás para não
      # subir a conversa ao topo); o hook de sync não deve sobrescrever.
      skip_chat_sync: true,
      **attr
    )
    text_message_id
  end

  # Pausa a automação na intervenção humana, pelo período da organização.
  def pause_automation_for_human!
    settings = organization
    disable_automation_to(settings&.automation_pause_period, settings&.automation_pause_time_to)
  end

  # `period`: minutes, hours, days. Qualquer outra coisa (o padrão é `disabled`) pausa
  # sem volta automática: só uma pessoa religa.
  def disable_automation_to(period, time)
    time_in_feature =
      case period.to_s
      when "minutes" then time.to_i.minutes
      when "hours" then time.to_i.hours
      when "days" then time.to_i.days
      end

    token = time_in_feature ? SecureRandom.uuid : nil

    update(
      automation_enabled: false,
      active_job_id: token,
      # Guarda o horário para o painel exibir "automação volta em X".
      automation_resume_at: time_in_feature ? Time.current + time_in_feature : nil
    )

    EnableContactJob.set(wait: time_in_feature).perform_later(id.to_s, organization_id, token) if time_in_feature
  end

  def update_last_message!
    update_last_message
    save
  end

  def update_last_message
    last_message = chat_messages.unscoped
                                .where(:role.in => %w[assistant user])
                                .order_by(created_at: :desc)
                                .first
    return if last_message.nil?

    self.last_message_type = last_message.type_element
    self.last_message_content = last_message.content
    self.last_message_by = last_message.role
  end

  def last_message_nano
    (last_message_at.to_f * 1_000).to_i
  end

  def last_message_from
    simple_time_ago(last_message_at)
  end

  def clear_context!(content = I18n.t("connectors.notes.context_cleared"))
    clear_context(content)
    save
  end

  # Marca o histórico como fora de contexto e religa a automação.
  def clear_context(content = I18n.t("connectors.notes.context_cleared"))
    ChatMessage::Text.create(
      role: "base",
      content: content,
      role_base_type: "context-clear",
      chat: self,
      active: false
    )

    ChatMessage::Base.where(chat_id: id).update_all(active: false)
    self.automation_enabled = true
    self.flow_next_node_id = nil
  end

  def simple_time_ago(from_time)
    # A diferença é fracionária (59.5 caía fora de 0..59 e virava "0m"). Com o relógio do
    # provedor adiantado ela pode ser negativa.
    seconds = [ Time.current - from_time, 0 ].max
    case seconds
    when 0...60
      "#{seconds.to_i}s"
    when 60...3600
      "#{(seconds / 60).to_i}min"
    when 3600...86_400
      "#{(seconds / 3600).to_i}h"
    when 86_400...2_592_000
      "#{(seconds / 86_400).to_i}d"
    else
      months = (Time.current.year * 12 + Time.current.month) - (from_time.year * 12 + from_time.month)
      "#{months}m"
    end
  end

  def abbreviated_name
    return "" if user_name.blank?

    words = user_name.split

    if words.length == 1
      # Uma palavra só: as duas primeiras letras.
      user_name[0..1].upcase
    else
      # Senão, a primeira letra da primeira e da última palavra.
      (words.first[0] + words.last[0]).upcase
    end
  end

  # Mesmas streams de `ChatListChannel`: quem só vê o departamento (ou só o que é seu)
  # recebe por uma stream própria, e quem vê tudo pela principal.
  def list_streams
    streams = [ "chat-list" ]
    streams << "chat-list-unassigned" if assigned_account_id.nil? && team_id.nil?
    streams << "chat-list-team-#{team_id}" if team_id.present?
    streams << "chat-list-account-#{assigned_account_id}" if assigned_account_id.present?
    streams
  end

  private

  def broadcast_to_lists(payload)
    list_streams.each do |name|
      ActionCable.server.broadcast(ApplicationCable::Channel.organization_stream(organization_id, name), payload)
    end
  end

  def assign_or_create_audience
    return if audience_id.present?

    existing = self.class.where(external_id: external_id, organization_id: organization_id).take

    self.audience = existing&.audience || Audience.create(user_name: user_name)
  end

  def log_assignment_change
    return unless assigned_account_id_changed?

    content = assignment_note
    return unless content

    ChatMessage::Text.create(
      role: "base",
      content: content,
      role_base_type: "assigned-user-notation",
      chat: self
    )
  end

  def assignment_note
    assignee = assigned_account_id && Account.find_by(id: assigned_account_id, organization_id: organization_id)
    actor = updated_by_account

    if assignee
      return I18n.t("connectors.notes.assigned_to", name: assignee.name) unless actor&.id

      if actor.id == assigned_account_id
        I18n.t("connectors.notes.assigned_self", name: assignee.name)
      else
        I18n.t("connectors.notes.assigned_by", actor: actor.name, name: assignee.name)
      end
    elsif assigned_account_id.nil? && actor&.id
      previous = assigned_account_id_was && Account.find_by(id: assigned_account_id_was, organization_id: organization_id)
      if previous
        I18n.t("connectors.notes.unassigned_from", actor: actor.name, name: previous.name)
      else
        I18n.t("connectors.notes.unassigned", actor: actor.name)
      end
    end
  end
end
