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
      # O onboarding por conversa é a outra porta para este documento: a tela
      # precisa saber em que tema a pessoa parou e se já dá para publicar a v1.
      onboarding: OnboardingSerializer.state(brand_core),
      completeness: completeness.as_json,
      readyForGeneration: contract[:ready],
      generationBlockers: contract[:blockers],
      # Marca publicada antes do campo de estilo: o estilo que a busca de
      # referências deduziu, para a pessoa confirmar ou trocar.
      styleSuggestion: brand_core.archetype_suggestion,
      hasUnpublishedChanges: brand_core.unpublished_changes?,
      unpublishedChangeCount: brand_core.unpublished_changes.size,
      assets: BrandAssetSerializer.many(brand_core.assets.ordered),
      # As logos (grupos de `assets`), com a principal **do rascunho** marcada.
      logos: BrandLogoSerializer.many(brand_core.logos, primary: brand_core.primary_logo),
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
      # O ponto do seletor: a única cor da marca no chrome da plataforma.
      accentColor: brand_core.accent_color,
      percent: completeness.percent,
      minimumMet: completeness.minimum_met?,
      readyForGeneration: brand_core.generation_contract[:ready],
      visitedSteps: brand_core.visited_steps,
      lastStep: brand_core.last_step,
      # O seletor e a raiz usam isto para mandar marca nova (e marca em
      # andamento) ao onboarding — que retoma sozinho de onde parou.
      onboardingDone: brand_core.onboarding_done?,
      onboardingPending: brand_core.onboarding_pending?,
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
