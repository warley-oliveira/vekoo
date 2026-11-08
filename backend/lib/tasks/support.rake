# O suporte do Vekoo (`User#master`) só liga e desliga por aqui, ou pelo console. Nenhuma rota da
# API escreve em `master`.
#
#   bin/rails "support:grant[suporte@vekoo.com.br]"
#   bin/rails "support:revoke[suporte@vekoo.com.br]"
#   bin/rails "support:accesses[20]"          # as últimas entradas, de quem for
#
# Em produção: kamal app exec -r web --reuse "bin/rails 'support:grant[suporte@vekoo.com.br]'"
module SupportTasks
  module_function

  def user!(email)
    abort "Informe o e-mail: bin/rails \"support:grant[email]\"" if email.blank?

    User.find_by_login(email) || abort("Ninguém com o e-mail #{email}. A pessoa precisa ter conta no Vekoo antes.")
  end
end

namespace :support do
  desc "Liga o acesso de suporte (entra em qualquer organização) para o e-mail"
  task :grant, [ :email ] => :environment do |_task, args|
    user = SupportTasks.user!(args[:email])
    user.update!(master: true)
    puts "#{user.email} agora é suporte do Vekoo."
  end

  desc "Desliga o acesso de suporte do e-mail; as abas abertas como suporte caem na hora"
  task :revoke, [ :email ] => :environment do |_task, args|
    user = SupportTasks.user!(args[:email])
    user.update!(master: false)
    puts "#{user.email} deixou de ser suporte do Vekoo."
  end

  desc "Lista as últimas entradas do suporte nas organizações"
  task :accesses, [ :limit ] => :environment do |_task, args|
    SupportAccess.recent.includes(:user, :organization).limit((args[:limit] || 20).to_i).each do |access|
      puts [ access.created_at.iso8601, access.user.email, access.organization.name, access.ip_address ].join("  ")
    end
  end
end
