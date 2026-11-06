module Products
  # Refaz o índice de busca de itens cujo texto mudou sem o item ser salvo: categoria
  # renomeada ou apagada, campo que deixou de ser pesquisável, reimportação parcial.
  # Sem isto o item seguiria achável pelo nome antigo até alguém abri-lo e salvar.
  class ReindexItemsJob < ApplicationJob
    queue_as :low

    BATCH_SIZE = 500

    def self.enqueue_for(organization_id, item_ids)
      Array(item_ids).each_slice(BATCH_SIZE) { |slice| perform_later(organization_id, slice) }
    end

    # Sem `item_ids`, o catálogo inteiro da organização.
    def perform(organization_id, item_ids = nil)
      scope = Item.for_organization(organization_id)
      scope = scope.where(id: item_ids) if item_ids

      searchable_keys = FieldDefinition.for_organization(organization_id).searchable_only.pluck(:key)

      scope.in_batches(of: BATCH_SIZE) do |batch|
        items = batch.includes(:categories).to_a
        items.each { |item| item.refresh_index_text!(field_definitions: searchable_keys) }
        # O texto do embedding reúne o mesmo conteúdo; quem não mudou não paga (source_hash).
        EmbedItemsJob.enqueue_for(items.map(&:id))
      end
    end
  end
end
