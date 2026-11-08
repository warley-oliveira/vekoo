require "rails_helper"
require Rails.root.join("db/migrate/20261107003801_split_users_from_accounts.rb").to_s

# A migração que separa a pessoa do vínculo, rodada sobre dados no formato de produção: cada conta
# com a sua organização, sessão aberta, pedido de senha, aparelho de push e foto. Volta o banco ao
# formato antigo, grava como a produção tem hoje, e migra de novo.
RSpec.describe SplitUsersFromAccounts do
  let(:connection) { ActiveRecord::Base.connection }
  let(:migration) { described_class.new }
  let(:digest) { BCrypt::Password.create("carrossel123", cost: BCrypt::Engine::MIN_COST) }

  def reset_models
    [ Account, User, Session, PasswordReset, PushDevice, SupportAccess, ActiveStorage::Attachment ].each(&:reset_column_information)
  end

  def run(direction)
    ActiveRecord::Migration.suppress_messages { migration.migrate(direction) }
    reset_models
  end

  def insert(table, row)
    columns = row.keys.join(", ")
    values = row.values.map { |value| connection.quote(value) }.join(", ")
    connection.execute("INSERT INTO #{table} (#{columns}) VALUES (#{values})")
  end

  def legacy_account(email:, name:)
    organization = create(:organization, name: "Organização de #{name}")
    id = SecureRandom.uuid
    insert(:accounts, id: id, organization_id: organization.id, email: email, name: name, password_digest: digest,
      phone: "5511999990000", locale: "pt-BR", role: "owner", created_at: 2.months.ago, updated_at: 1.month.ago)
    [ id, organization ]
  end

  after { reset_models }

  it "transforma cada conta em pessoa + vínculo, sem derrubar sessão, senha, aparelho nem foto" do
    run(:down)

    marina_id, marina_org = legacy_account(email: "marina@exemplo.com.br", name: "Marina Duarte")
    rafael_id, = legacy_account(email: "rafael@exemplo.com.br", name: "Rafael Nunes")
    token = SecureRandom.urlsafe_base64(32)
    insert(:sessions, id: SecureRandom.uuid, account_id: marina_id, token_digest: Session.digest(token),
      expires_at: 10.days.from_now, created_at: Time.current, updated_at: Time.current)
    insert(:password_resets, id: SecureRandom.uuid, account_id: rafael_id, token_digest: "resumo",
      expires_at: 1.hour.from_now, created_at: Time.current, updated_at: Time.current)
    insert(:push_devices, id: SecureRandom.uuid, account_id: marina_id, organization_id: marina_org.id,
      endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh_key: "p", auth_key: "a",
      created_at: Time.current, updated_at: Time.current)
    blob = ActiveStorage::Blob.create!(key: SecureRandom.hex, filename: "foto.jpg", content_type: "image/jpeg",
      byte_size: 1, checksum: "x", service_name: "test")
    insert(:active_storage_attachments, id: SecureRandom.uuid, name: "avatar", record_type: "Account",
      record_id: marina_id, blob_id: blob.id, created_at: Time.current)

    run(:up)

    marina = Account.find(marina_id)
    expect(marina.user_id).to eq(marina_id)
    expect(marina.user).to have_attributes(email: "marina@exemplo.com.br", name: "Marina Duarte", phone: "5511999990000",
      locale: "pt-BR", master: false)
    expect(marina.organization).to eq(marina_org)
    expect(marina.hashid).to be_present
    expect(Account.find_by_hashid_for(marina.user, marina.hashid)).to eq(marina)
    expect(Account.find(rafael_id).number).not_to eq(marina.number)

    expect(Session.authenticate(token)&.user).to eq(marina.user)
    expect(SignIn.new(email: "marina@exemplo.com.br", password: "carrossel123").call).to be_success
    expect(PasswordReset.find_by(token_digest: "resumo").user_id).to eq(rafael_id)
    expect(PushDevice.sole.user_id).to eq(marina_id)
    expect(marina.user.avatar).to be_attached
    expect(marina.avatar.blob).to eq(blob)
    expect(connection.column_exists?(:accounts, :email)).to be(false)
  end

  it "volta ao formato antigo enquanto cada pessoa tiver uma organização só" do
    account = create(:account, name: "Ana Paula", email: "ana@exemplo.com.br")
    session = Session.start!(account.user)

    run(:down)

    row = connection.select_one("SELECT email, name FROM accounts WHERE id = #{connection.quote(account.id)}")
    expect(row).to eq("email" => "ana@exemplo.com.br", "name" => "Ana Paula")
    expect(connection.select_value("SELECT account_id FROM sessions WHERE id = #{connection.quote(session.id)}")).to eq(account.id)

    run(:up)
    expect(Account.find(account.id).user.email).to eq("ana@exemplo.com.br")
  end

  it "recusa voltar quando alguém já está em duas organizações" do
    account = create(:account)
    create(:account, user: account.user, role: "member")

    expect { run(:down) }.to raise_error(ActiveRecord::IrreversibleMigration)
  end
end
