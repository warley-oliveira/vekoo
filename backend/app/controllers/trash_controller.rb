# DELETE /trash — esvaziar a lixeira de uma vez.
class TrashController < AuthenticatedController
  def destroy
    deleted = current_organization.carousels.trashed.destroy_all.size
    render json: { deleted: deleted }
  end
end
