# `staff` é da pessoa (`User#staff`): a área /admin (curadoria do banco de referências) e a entrada
# nas organizações internas, pela lista do suporte. Não é papel da organização: nenhuma tela liga ou
# desliga isto.
namespace :staff do
  desc "Dá à pessoa acesso à área /admin (curadoria do banco de referências): bin/rails 'staff:grant[email]'"
  task :grant, [ :email ] => :environment do |_, args|
    user = User.find_by_login(args[:email]) or abort "pessoa #{args[:email]} não encontrada"
    user.update!(staff: true)
    puts "#{user.email}: staff"
  end

  desc "Tira o acesso à área /admin: bin/rails 'staff:revoke[email]'"
  task :revoke, [ :email ] => :environment do |_, args|
    user = User.find_by_login(args[:email]) or abort "pessoa #{args[:email]} não encontrada"
    user.update!(staff: false)
    puts "#{user.email}: sem acesso"
  end

  desc "Lista as pessoas com acesso à área /admin"
  task list: :environment do
    User.where(staff: true).order(:email).each { |user| puts user.email }
  end
end
