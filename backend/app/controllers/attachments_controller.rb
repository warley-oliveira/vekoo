# Anexos da organização. Na origem pertenciam a um assistente; aqui, à organização.
#
# Ler e enviar: o composer do chat, as campanhas e os fluxos escolhem anexo daqui, e o chat
# envia arquivo novo na hora. Editar e apagar é de quem configura: um anexo apagado some das
# mensagens rápidas e dos fluxos que o citam.
class AttachmentsController < PlatformController
  include InboxAccess

  SORTABLE = %w[name created_at updated_at].freeze
  DEFAULT_PER_PAGE = 20

  require_any_permission :chat, :core_settings, :flows, :campaigns, only: %i[index show create]
  require_permission :core_settings, only: %i[update destroy]

  before_action :set_attachment, only: %i[show update destroy]

  def index
    records, meta = paginate(sorted(filtered(gallery).of_kinds(requested_kinds)), per_page: DEFAULT_PER_PAGE)

    render json: { attachments: AttachmentSerializer.many(records.with_attached_file), meta: meta }
  end

  def show
    render json: { attachment: AttachmentSerializer.one(@attachment) }
  end

  # Multipart solto: `file`, `name`, `description`.
  def create
    attachment = current_organization.attachments.new(attachment_attributes.merge(private: false))

    if attachment.save
      render json: { attachment: AttachmentSerializer.one(attachment) }, status: :created
    else
      render_invalid(attachment)
    end
  end

  # O arquivo é opcional aqui: sem ele, muda só nome e descrição.
  def update
    if @attachment.update(attachment_attributes)
      render json: { attachment: AttachmentSerializer.one(@attachment) }
    else
      render_invalid(@attachment)
    end
  end

  def destroy
    @attachment.destroy!
    head :no_content
  end

  private

  def gallery
    current_organization.attachments.available
  end

  def set_attachment
    @attachment = current_organization.attachments.find(params[:id])
  end

  def filtered(scope)
    return scope if params[:search].blank?

    pattern = "%#{Attachment.sanitize_sql_like(params[:search].to_s.strip)}%"
    scope
      .left_joins(file_attachment: :blob)
      .where(
        "attachments.name ILIKE :pattern OR attachments.description ILIKE :pattern OR active_storage_blobs.filename ILIKE :pattern",
        pattern: pattern
      )
  end

  # `?kind=image,document`: um ou mais tipos, separados por vírgula.
  def requested_kinds
    params[:kind].to_s.split(",").map(&:strip)
  end

  def sorted(scope)
    column = SORTABLE.include?(params[:sort_by].to_s) ? params[:sort_by].to_s : "created_at"
    direction = params[:sort_order].to_s.casecmp?("asc") ? :asc : :desc

    scope.order(column => direction, id: direction)
  end

  # `file` só vale como arquivo de verdade: um texto qualquer seria lido como id assinado de um
  # blob, e estouraria aqui em vez de virar 422.
  def attachment_attributes
    attributes = params.permit(:name, :description).to_h
    attributes[:file] = params[:file] if params[:file].respond_to?(:read)
    attributes
  end
end
