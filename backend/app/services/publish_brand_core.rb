# Publicar o Brandcore: congela o rascunho como a versão que a geração lê e
# registra no histórico quem publicou, quando e o que mudou.
#
# Só publica com o mínimo obrigatório preenchido — é o portão que impede a
# geração de partir de uma marca pela metade. Publicar sem mudança nenhuma
# não cria versão (idempotente): o histórico é de mudanças, não de cliques.
class PublishBrandCore
  Result = Struct.new(:brand_core, :version, :error, keyword_init: true) do
    def success? = error.nil?
  end

  def initialize(brand_core, account:)
    @brand_core = brand_core
    @account = account
  end

  def call
    completeness = @brand_core.completeness
    return Result.new(error: "brandIncomplete") unless completeness.minimum_met?

    document = @brand_core.full_document
    if @brand_core.published? && BrandCore::Schema.complete(@brand_core.published_document) == document
      return Result.new(brand_core: @brand_core)
    end

    version = nil
    BrandCore.transaction do
      changes = @brand_core.published? ? BrandCore::Diff.call(@brand_core.published_document, document) : []
      version = @brand_core.versions.create!(
        account: @account,
        number: @brand_core.current_version + 1,
        snapshot: document,
        change_list: changes
      )
      @brand_core.update!(
        document: document,
        published_document: document,
        status: "published",
        published_at: Time.current,
        current_version: version.number
      )
    end

    Result.new(brand_core: @brand_core, version: version)
  end
end
