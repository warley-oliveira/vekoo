# O Brandcore como a tela o vê: rascunho completo (seções que faltam já vêm
# com o default), a última publicação, o progresso do formulário, a completude
# e os ativos. Tudo de uma vez porque o formulário é uma tela só — abrir
# qualquer etapa precisa do documento inteiro para o preview lateral.
class BrandCoreSerializer < ApplicationSerializer
  def self.one(brand_core)
    completeness = brand_core.completeness
    contract = brand_core.generation_contract

    {
      id: brand_core.id,
      name: brand_core.name,
      status: brand_core.status,
      document: brand_core.full_document,
      publishedDocument: contract[:document],
      progress: {
        visitedSteps: brand_core.visited_steps,
        lastStep: brand_core.last_step
      },
      completeness: completeness.as_json,
      readyForGeneration: contract[:ready],
      generationBlockers: contract[:blockers],
      hasUnpublishedChanges: brand_core.unpublished_changes?,
      assets: BrandAssetSerializer.many(brand_core.assets.ordered),
      currentVersion: brand_core.current_version,
      publishedAt: epoch_ms(brand_core.published_at),
      updatedAt: epoch_ms(brand_core.updated_at)
    }
  end

  # O resumo para o seletor de marcas e a lista: sem documento, sem ativos.
  def self.summary(brand_core)
    completeness = brand_core.completeness
    {
      id: brand_core.id,
      name: brand_core.name,
      status: brand_core.status,
      percent: completeness.percent,
      minimumMet: completeness.minimum_met?,
      readyForGeneration: brand_core.generation_contract[:ready],
      visitedSteps: brand_core.visited_steps,
      lastStep: brand_core.last_step,
      currentVersion: brand_core.current_version,
      publishedAt: epoch_ms(brand_core.published_at),
      createdAt: epoch_ms(brand_core.created_at),
      updatedAt: epoch_ms(brand_core.updated_at)
    }
  end

  def self.many_summaries(brand_cores)
    brand_cores.map { |brand_core| summary(brand_core) }
  end

  # O que vai pelo ActionCable: só o bastante para a outra aba decidir
  # recarregar — o documento inteiro ela busca pelo SWR, que já sabe fazer.
  def self.event(brand_core, event:, account:, client_id: nil)
    {
      event: event,
      brandCoreId: brand_core.id,
      status: brand_core.status,
      completeness: brand_core.completeness.as_json,
      currentVersion: brand_core.current_version,
      updatedAt: epoch_ms(brand_core.updated_at),
      accountId: account&.id,
      accountName: account&.name,
      clientId: client_id.presence
    }
  end
end
