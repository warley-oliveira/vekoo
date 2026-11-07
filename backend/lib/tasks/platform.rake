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
end

namespace :platform do
  desc "Sincroniza o dado do produto: catálogo de ferramentas e grupos padrão das organizações antigas"
  task sync: :environment do
    PlatformTasks.sync_tool_catalog
    PlatformTasks.backfill_access_roles
  end
end
