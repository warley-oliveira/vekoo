namespace :staff do
  desc "Dá à conta acesso à área /admin (curadoria do banco de referências): bin/rails 'staff:grant[email]'"
  task :grant, [ :email ] => :environment do |_, args|
    account = Account.find_by!(email: args[:email].to_s.strip.downcase)
    account.update!(staff: true)
    puts "#{account.email}: staff"
  end

  desc "Tira o acesso à área /admin: bin/rails 'staff:revoke[email]'"
  task :revoke, [ :email ] => :environment do |_, args|
    account = Account.find_by!(email: args[:email].to_s.strip.downcase)
    account.update!(staff: false)
    puts "#{account.email}: sem acesso"
  end

  desc "Lista as contas com acesso à área /admin"
  task list: :environment do
    Account.where(staff: true).order(:email).each { |account| puts account.email }
  end
end
