module PlatformTasks
  # O dado do produto que precisa existir em todo ambiente, inclusive em produção, onde
  # `db/seeds.rb` não carrega as sementes de domínio: elas criam pessoas com senha conhecida.
  #
  # Roda a cada boot do container web (`bin/docker-entrypoint`), antes de a porta abrir: é assim
  # que uma versão nova do catálogo chega ao servidor sem ninguém precisar lembrar. Idempotente.
  module_function

  # Igual para toda organização. Sem isto, `GET /tool-catalog` responde vazio em produção.
  # `load` envolto: os arquivos definem constantes de JavaScript e rodam mais de uma vez nas specs.
  def sync_tool_catalog
    Rails.root.glob("db/seeds/tool_catalog/*.rb").sort.each { |file| load file.to_s, true }
  end

  # `Organization` dá os grupos padrão ao nascer. As anteriores a eles ficaram sem nenhum, e a
  # tela de pessoas não teria o que oferecer.
  def backfill_access_roles
    Organization.where.missing(:access_roles).find_each { |organization| AccessRole.seed_defaults_for(organization) }
  end

  # O código veio de outro produto, a AIVA, e o provedor de WhatsApp Web se chamava `aiva_api`. O
  # nome virou `vekoo_api`, e o único lugar do banco que guardava o velho é `provider_api` dos
  # conectores (Mongo): o Postgres não tinha nenhum. Direto na coleção, sem validação nem callback
  # (o `before_update` do conector fala com o provedor). Idempotente. Devolve quantos mudaram.
  RENAMED_PROVIDERS = { "aiva_api" => "vekoo_api" }.freeze

  def rename_aiva
    RENAMED_PROVIDERS.sum do |old, new|
      Connector::Base.collection.update_many({ provider_api: old }, { "$set" => { provider_api: new } }).modified_count
    end
  end
end

namespace :platform do
  desc "Sincroniza o dado do produto: catálogo de ferramentas e grupos padrão das organizações antigas"
  task sync: :environment do
    PlatformTasks.sync_tool_catalog
    PlatformTasks.backfill_access_roles
  end

  desc "Troca o nome velho do provedor de WhatsApp Web (aiva_api) pelo novo (vekoo_api) nos conectores"
  task rename_aiva: :environment do
    puts "Conectores com o provedor renomeado: #{PlatformTasks.rename_aiva}"
    if PlatformTasks::RENAMED_PROVIDERS.key?(ENV["WHATSAPP_WEB_DEFAULT_PROVIDER"])
      warn "WHATSAPP_WEB_DEFAULT_PROVIDER ainda tem o nome velho: troque por #{PlatformTasks::RENAMED_PROVIDERS[ENV["WHATSAPP_WEB_DEFAULT_PROVIDER"]]}."
    end
  end
end
