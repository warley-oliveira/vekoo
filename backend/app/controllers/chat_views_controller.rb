# Visões salvas do chat (origem: ChatFilter). Pessoal só a dona enxerga, e para os outros é
# 404, como qualquer coisa que não existe para aquela pessoa. A origem deixava qualquer um da
# organização abrir, alterar e apagar a visão pessoal de outro, sabendo o id.
class ChatViewsController < PlatformController
  include InboxAccess

  MAX_PAYLOAD_BYTES = 64.kilobytes

  # As condições são dados da tela: chaves e valores voltam como foram.
  self.opaque_params += %w[payload]

  require_permission :chat

  before_action :set_chat_view, only: %i[show update destroy]

  def index
    records, meta = paginate(ChatView.visible_to(current_account).order(:name, :id), per_page: Paginated::MAX_PER_PAGE)

    render json: { chatViews: ChatViewSerializer.many(records), meta: meta }
  end

  def show
    render json: { chatView: ChatViewSerializer.one(@chat_view) }
  end

  def create
    attributes = chat_view_attributes
    return if performed?

    chat_view = current_organization.chat_views.new(attributes.merge(account: current_account))

    if chat_view.save
      render json: { chatView: ChatViewSerializer.one(chat_view) }, status: :created
    else
      render_invalid(chat_view)
    end
  end

  # Quem torna pessoal uma visão compartilhada fica com ela: pessoal é sempre de alguém, e a
  # regra de leitura é por dona.
  def update
    attributes = chat_view_attributes
    return if performed?

    attributes = attributes.merge(account: current_account) if ActiveModel::Type::Boolean.new.cast(attributes[:personal])

    if @chat_view.update(attributes)
      render json: { chatView: ChatViewSerializer.one(@chat_view) }
    else
      render_invalid(@chat_view)
    end
  end

  def destroy
    @chat_view.destroy!
    head :no_content
  end

  private

  def set_chat_view
    @chat_view = ChatView.visible_to(current_account).find(params[:id])
  end

  # `expect` não deixa passar um mapa livre, que é o que `payload` é.
  def chat_view_attributes
    envelope = params.require(:chat_view)
    return render_parameter_invalid unless envelope.respond_to?(:permit)

    attributes = envelope.permit(:name, :personal).to_h.symbolize_keys
    return attributes unless envelope.key?(:payload)

    payload = parse_payload(envelope.to_unsafe_h[:payload])
    return render_invalid_payload if payload == :invalid

    attributes.merge(payload: payload)
  end

  # A tela da origem manda um texto em JSON (`JSON.stringify(filters)`); aceitar também a lista
  # pronta evita o passo inútil. O que sai é sempre JSON de verdade.
  def parse_payload(raw)
    payload = raw.is_a?(String) ? JSON.parse(raw) : raw
    return :invalid unless payload.is_a?(Array) || payload.is_a?(Hash)
    return :invalid if payload.to_json.bytesize > MAX_PAYLOAD_BYTES

    payload
  rescue JSON::ParserError
    :invalid
  end

  def render_invalid_payload
    render_error(status: :unprocessable_content, code: "invalidPayload", field: "payload")
  end

  def render_parameter_invalid
    render_error(status: :bad_request, code: "parameterMissing", field: "chatView")
  end
end
