module Pipelines
  # Anexos do card. A origem tinha o modelo e o front (`useItemAttachments`), mas nenhuma rota.
  class AttachmentsController < BaseController
    before_action :set_board
    before_action :set_card

    def index
      attachments = @card.attachments.includes(uploaded_by: PersonPayload.preload).with_attached_file.order(:created_at)

      render json: { attachments: AttachmentSerializer.many(attachments), meta: { total: attachments.size } }
    end

    # Multipart solto: `file`.
    def create
      attachment = @card.attachments.new(uploaded_by: current_account)
      attachment.file = params[:file] if params[:file].respond_to?(:read)

      if attachment.save
        render json: AttachmentSerializer.one(attachment), status: :created
      else
        render_invalid(attachment)
      end
    end

    def destroy
      @card.attachments.find(params[:id]).destroy!
      head :no_content
    end
  end
end
