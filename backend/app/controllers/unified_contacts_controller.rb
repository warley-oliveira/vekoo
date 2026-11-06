# Contatos unificados: uma linha por `external_id`, com uma aba por conversa (cada aba é uma
# conversa de verdade, porque uma conta WABA com vários números tem uma conversa por número).
#
# Sem chave de liga e desliga. Na origem era beta, atrás de `unified_contacts_enabled`, porque
# havia base em produção para proteger de uma lista nova. Aqui não há base, nem caminho pela API
# para ligar `features`: atrás da chave o recurso nasceria morto, e a lista clássica continua em
# /chats para quem preferir.
#
# Otimização vinda da origem: a lista é uma agregação só, projetada, sem carregar documento inteiro.
# Diferente da origem, respeita `chat_list_to`: o `$match` é o seletor de Chat.visible_to, e quem
# só vê parte das conversas de um contato vê só essas abas.
class UnifiedContactsController < PlatformController
  include InboxAccess

  PER_PAGE = 25

  require_permission :chat

  # GET /unified-contacts?page=&q=&status=&filters[...]. `meta.filtered` diz se há filtro ativo.
  def index
    page = (params[:page].presence || 1).to_i.clamp(1, 100_000)
    expression = Chats::Filters.expression(
      Chats::Filters.conditions(params[:filter].presence || params[:filters]),
      time_zone: organization_time_zone
    )

    rows = Chat.collection.aggregate(pipeline(page, expression), allow_disk_use: true).to_a

    render json: {
      contacts: rows.first(PER_PAGE).map { |row| UnifiedContactSerializer.one(row) },
      meta: { page: page, perPage: PER_PAGE, hasMore: rows.size > PER_PAGE, filtered: !expression.nil? }
    }
  end

  # GET /unified-contacts/:external_id/messages?beforeId=&limit=
  #
  # A linha do tempo "Todos", só de leitura: as mensagens de todas as conversas do contato que a
  # pessoa pode ver, cada uma com a conversa e o canal de onde veio.
  def messages
    chats = visible_chats.where(external_id: params[:external_id].to_s)
                         .only(:_id, :connector_id, :sender_phone_number_id).to_a
    return render json: { messages: [], hasMore: false, oldestId: nil } if chats.empty?

    origin = chats.index_by(&:id)
    page = Chats::MessagePage.call(chat_ids: chats.map(&:id), before_id: params[:before_id], limit: params[:limit])

    render json: {
      messages: page.messages.map { |message| with_origin(message, origin[message.chat_id]) },
      hasMore: page.has_more,
      oldestId: page.oldest_id
    }
  rescue Chats::MessagePage::InvalidCursor
    render_error(status: :unprocessable_content, code: "invalidCursor", field: "beforeId")
  end

  private

  def with_origin(message, chat)
    ChatMessageSerializer.one(message).merge(
      connectorId: chat&.connector_id&.to_s,
      senderPhoneNumberId: chat&.sender_phone_number_id&.to_s
    )
  end

  def pipeline(page, expression)
    stages = [
      { "$match" => match_stage },
      # O `matched` de cada conversa, ANTES do $group: quem não casa continua na lista de abas,
      # em cinza. Sem filtro, todas casam.
      { "$addFields" => { "matched" => expression || true } },
      # Antes do $group, para o $first pegar os campos da conversa mais recente.
      { "$sort" => { "last_message_at" => -1, "_id" => -1 } },
      { "$group" => group_stage }
    ]
    # Com filtro ativo, só os contatos com ao menos uma conversa que casa.
    stages << { "$match" => { "match_count" => { "$gt" => 0 } } } if expression
    stages.push(
      { "$sort" => { "last_message_at" => -1, "_id" => 1 } },
      { "$skip" => (page - 1) * PER_PAGE },
      # Um a mais, para saber se há outra página sem contar o total.
      { "$limit" => PER_PAGE + 1 },
      { "$project" => project_stage }
    )
    stages
  end

  # `q` e `status` valem por contato inteiro. Os filtros avançados, por conversa.
  def match_stage
    clauses = [ Chat.visible_to(current_account).valid_records.selector ]
    clauses << { "status" => params[:status].to_s } if Chat::STATUSES.include?(params[:status].to_s)

    search = Chats::SearchTerm.clause(params[:q])
    clauses << search if search

    { "$and" => clauses }
  end

  def group_stage
    {
      "_id" => "$external_id",
      "audience_id" => { "$first" => "$audience_id" },
      "user_name" => { "$first" => "$user_name" },
      "display_name" => { "$first" => "$display_name" },
      "profile_picture_url" => { "$first" => "$profile_picture_url" },
      "last_message_at" => { "$max" => "$last_message_at" },
      "last_message_content" => { "$first" => "$last_message_content" },
      "last_message_by" => { "$first" => "$last_message_by" },
      "last_message_type" => { "$first" => "$last_message_type" },
      "total_unread" => { "$sum" => { "$ifNull" => [ "$unread_messages", 0 ] } },
      "match_count" => { "$sum" => { "$cond" => [ "$matched", 1, 0 ] } },
      "chats" => {
        "$push" => {
          "chat_id" => "$_id",
          "connector_id" => "$connector_id",
          "unread" => { "$ifNull" => [ "$unread_messages", 0 ] },
          "last_message_at" => "$last_message_at",
          "sender_phone_number_id" => "$sender_phone_number_id",
          "audience_type" => "$audience_type",
          "status" => "$status",
          "matched" => "$matched"
        }
      }
    }
  end

  def project_stage
    {
      "_id" => 0,
      "external_id" => "$_id",
      "audience_id" => 1, "user_name" => 1, "display_name" => 1, "profile_picture_url" => 1,
      "last_message_at" => 1, "last_message_content" => 1, "last_message_by" => 1, "last_message_type" => 1,
      "total_unread" => 1, "match_count" => 1, "chats" => 1
    }
  end
end
