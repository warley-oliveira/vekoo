require "rails_helper"

# O retrato do banco de desenvolvimento que `db:seed` aplica: grava, aplica de novo dias depois com as
# datas andando junto, não duplica e não pisa no que já existe com outro id.
RSpec.describe DemoSnapshot do
  include ActiveSupport::Testing::TimeHelpers

  let(:dir) { Pathname(Dir.mktmpdir("snapshot")) }
  let(:account) { create(:account, name: "Marina Duarte") }
  let(:organization) { account.organization }
  let(:booking_start) { Time.zone.parse("2026-11-20 13:00:00") } # 10h em São Paulo

  around do |example|
    described_class.root = dir
    example.run
  ensure
    described_class.root = nil
    FileUtils.rm_rf(dir)
  end

  def snapshot!
    travel_to(Time.zone.parse("2026-11-14 12:00:00")) { described_class.dump! }
  end

  def apply!(after:)
    described_class.load!(now: Time.zone.parse(described_class.manifest["dumpedAt"]) + after)
  end

  it "devolve o que mudou depois do retrato, com as datas andando em dias inteiros" do
    booking = create(:agenda_booking, start: booking_start)
    create(:daily_chat_stat, organization: organization, day: Date.new(2026, 11, 13))
    create(:daily_chat_stat, organization: organization, day: Date.new(2026, 11, 14))
    snapshot!

    account.user.update_columns(name: "Outro nome")
    Agenda::Booking.collection.delete_one(_id: booking.id)

    result = apply!(after: 3.days + 5.hours)

    expect(result[:days]).to eq(3)
    expect(account.user.reload.name).to eq("Marina Duarte")
    restored = Agenda::Booking.collection.find(_id: booking.id).first
    # Três dias depois, a mesma hora de parede.
    expect(restored["start"]).to eq(booking_start + 3.days)
    # Dois dias seguidos que andam para a frente sem um bater no outro (índice único por dia).
    expect(DailyChatStat.where(organization: organization).order(:day).pluck(:day))
      .to eq([ Date.new(2026, 11, 16), Date.new(2026, 11, 17) ])
  end

  it "rodar de novo atualiza em vez de duplicar, e o que nasceu depois do retrato fica" do
    create(:daily_chat_stat, organization: organization, day: Date.new(2026, 11, 13))
    create(:agenda_booking, start: booking_start)
    snapshot!
    later = create(:account, organization: organization, name: "Rafael Nunes")

    apply!(after: 1.day)
    counts = [ User.count, Account.count, DailyChatStat.count, Agenda::Booking.count ]
    apply!(after: 4.days)

    expect([ User.count, Account.count, DailyChatStat.count, Agenda::Booking.count ]).to eq(counts)
    expect(Account.exists?(later.id)).to be(true)
  end

  it "acerta a sequência do número do vínculo, que vira o hashid da URL" do
    account
    snapshot!

    apply!(after: 0.days)
    fresh = create(:account, organization: organization)

    expect(fresh.number).to be > account.reload.number
  end

  it "fica fora do retrato o que é credencial ou rastro" do
    Session.start!(account.user)
    snapshot!

    expect(dir.join("postgres/sessions.json")).not_to exist
    expect(described_class.manifest["postgres"]).to include("users", "accounts")
  end

  it "recusa, sem deixar nada pela metade, o banco que já tem a mesma pessoa com outro id" do
    account
    snapshot!
    email = account.user.email
    Account.where(id: account.id).delete_all
    User.where(id: account.user_id).delete_all
    create(:user, email: email)

    expect { apply!(after: 0.days) }.to raise_error(DemoSnapshot::Conflict, /db:reset/)
    expect(Organization.exists?(organization.id)).to be(true)
  end
end
