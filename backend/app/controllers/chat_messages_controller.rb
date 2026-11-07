# As mensagens de uma conversa: histórico por cursor, apagar e reagir por REST, enviar áudio e
# arquivos. Texto e modelo vão por `ChatChannel`, como na origem. Os serviços são os que o núcleo
# já portou (Messages::*, Chats::SendMedia).
class ChatMessagesController < PlatformController
  include InboxAccess

  MAX_BULK_DELETE = 100

  require_permission :chat

  before_action :set_chat
  before_action :set_message, only: :reaction

  # GET /chats/:chat_id/messages?beforeId=&limit=&initial=
  #
  # A primeira página (sem `beforeId`) traz também os metadados da conversa e zera as não lidas de
  # quem é dono dela. `initial=false` deixa só as mensagens, para reler sem marcar como lido.
  def index
    page = Chats::MessagePage.call(chat_ids: [ @chat.id ], before_id: params[:before_id], limit: params[:limit])

    body = {
      messages: ChatMessageSerializer.many(page.messages),
      hasMore: page.has_more,
      oldestId: page.oldest_id
    }
    body.merge!(initial_metadata) if initial_page?

    render json: body
  rescue Chats::MessagePage::InvalidCursor
    render_error(status: :unprocessable_content, code: "invalidCursor", field: "beforeId")
  end

  # POST /chats/:chat_id/messages/bulk-delete { messageIds: [...] }: apaga só daqui, o contato
  # continua vendo. POST, e não DELETE com corpo como na origem: proxies e clientes podem descartar
  # o corpo de um DELETE.
  def bulk_destroy
    ids = Array(params[:message_ids]).map(&:to_s).compact_blank
    return render_error(status: :unprocessable_content, code: "unprocessable", field: "messageIds", message: t("connectors.messages.none_given")) if ids.empty?
    return render_error(status: :unprocessable_content, code: "tooManyMessages", field: "messageIds") if ids.size > MAX_BULK_DELETE

    result = Messages::BulkDeletionService.new(chat: @chat, message_ids: ids).call
    return render_message_refusal(result) unless result.success?

    @chat.refresh_last_message_preview!
    render json: { deletedIds: result.deleted_ids }
  end

  # POST /chats/:chat_id/messages/:id/reaction { emoji }. Emoji vazio remove.
  def reaction
    result = Messages::ReactionService.new(message: @message, emoji: params[:emoji], account: current_account).call
    return render_message_refusal(result) unless result.success?

    render json: { message: ChatMessageSerializer.one(@message) }
  end

  # POST /chats/:chat_id/messages/audio: multipart, campo `audio`. Pausa a automação.
  def audio
    message = Chats::SendAudio.call(chat: @chat, account: current_account, file: params[:audio])

    render json: { message: ChatMessageSerializer.one(message) }, status: :created
  rescue Chats::SendAudio::FileMissing
    render_error(status: :unprocessable_content, code: "fileRequired", field: "audio")
  rescue Chats::SendAudio::FileTooLarge
    render_error(status: :unprocessable_content, code: "fileTooLarge", field: "audio")
  rescue Chats::SendAudio::ConversionFailed
    render_error(status: :unprocessable_content, code: "audioConversionFailed", field: "audio")
  end

  # POST /chats/:chat_id/messages/attachments: multipart, `files[]` ou `file`. Pausa a automação.
  def attachments
    uploads = upload_params
    return render_error(status: :unprocessable_content, code: "fileRequired", field: "files") if uploads.empty?

    result = Chats::SendAttachments.call(chat: @chat, account: current_account, files: uploads)

    if result.failures.empty?
      render json: { messages: ChatMessageSerializer.many(result.messages) }, status: :created
    else
      render_error(
        status: :unprocessable_content,
        code: "attachmentSendFailed",
        field: "files",
        details: { files: result.failures, sentMessageIds: result.messages.map { |message| message.id.to_s } }
      )
    end
  end

  private

  def set_chat
    @chat = find_visible_chat(params[:chat_id])
    render_not_found unless @chat
  end

  def set_message
    @message = ChatMessage::Base.unscoped.where(chat_id: @chat.id, id: params[:id]).take
    render_not_found unless @message
  end

  def upload_params
    Array(params[:files].presence || params[:file]).select { |file| file.respond_to?(:read) }
  end

  def initial_page?
    params[:before_id].blank? && params[:initial].to_s != "false"
  end

  def initial_metadata
    mark_as_read

    {
      assignedAccountId: @chat.assigned_account_id,
      automationEnabled: @chat.automation_enabled,
      tagIds: Array(@chat.chat_tag_ids).map(&:to_s),
      customAttributes: @chat.custom_attributes,
      unreadMessages: @chat.unread_messages,
      attributeList: Chats::Metadata.attribute_list(current_organization),
      connectorProvider: Chats::Metadata.connector_provider(@chat)
    }
  end

  # Quem é dono da conversa, ou qualquer um numa conversa sem dono. Abrir a conversa de outra
  # pessoa não apaga o aviso dela.
  def mark_as_read
    return unless @chat.unread_messages.to_i.positive?
    return unless @chat.assigned_account_id.nil? || @chat.assigned_account_id == current_account.id

    @chat.update(unread_messages: 0)
  end

  # Os serviços já devolvem o motivo traduzido.
  def render_message_refusal(result)
    render_error(status: :unprocessable_content, code: "unprocessable", message: result.errors.first, details: { base: result.errors })
  end
end
