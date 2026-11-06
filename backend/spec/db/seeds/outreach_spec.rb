require "rails_helper"

# Roda a semente de ponta a ponta, em cima da conta de demonstração e dos canais da semente.
RSpec.describe "db/seeds/outreach.rb" do
  let(:owner) { create(:account, email: "marina.duarte@exemplo.com.br", role: "owner", name: "Marina Duarte") }
  let(:organization) { owner.organization }
  let(:campaigns) { organization.campaigns }

  def seed(file = "outreach")
    original = $stdout
    $stdout = StringIO.new
    load Rails.root.join("db/seeds/#{file}.rb")
  ensure
    $stdout = original
  end

  before do
    owner
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    seed("connectors")
    seed
  end

  it "traz uma campanha em cada estado" do
    expect(campaigns.pluck(:status_cd).uniq).to match_array(Outreach::Campaign.statuses)
  end

  it "traz o modo texto e o modo modelo" do
    expect(campaigns.pluck(:campaign_mode_cd).uniq).to contain_exactly("text", "template")
  end

  it "os números de cada campanha batem com os destinatários" do
    campaigns.each do |campaign|
      statuses = campaign.recipients.pluck(:status_cd).tally

      expect(campaign.recipients_count).to eq(statuses.values.sum), campaign.name
      expect(campaign.read_count).to eq(statuses.fetch("read", 0)), campaign.name
      expect(campaign.delivered_count).to eq(statuses.fetch("read", 0) + statuses.fetch("delivered", 0)), campaign.name
      expect(campaign.sent_count).to eq(statuses.slice("read", "delivered", "sent").values.sum), campaign.name
      expect(campaign.failed_count).to eq(statuses.fetch("failed", 0)), campaign.name
    end
  end

  it "traz destinatários em cada situação, menos os que só existem no meio de um envio" do
    expect(Outreach::Recipient.where(:campaign_id.in => campaigns.pluck(:_id)).pluck(:status_cd).uniq)
      .to contain_exactly("pending", "sent", "delivered", "read", "failed", "skipped")
  end

  it "os telefones têm o DDI e não se repetem na campanha" do
    campaigns.each do |campaign|
      phones = campaign.recipients.pluck(:phone)

      expect(phones).to all(match(/\A55\d{10,11}\z/))
      expect(phones.uniq.size).to eq(phones.size)
    end
  end

  it "cada campanha conta a própria história" do
    expect(campaigns.where(status_cd: "draft").first.activity_logs.pluck(:action)).to eq([ "created" ])
    expect(campaigns.where(status_cd: "cancelled").first.activity_logs.pluck(:action)).to contain_exactly("created", "launched", "cancelled")
    expect(campaigns.where(status_cd: "completed", campaign_mode_cd: "text").first.activity_logs.pluck(:action)).to contain_exactly("created", "launched", "completed")
  end

  it "uma das pausadas foi pela própria plataforma" do
    expect(campaigns.where(status_cd: "paused").pluck(:pause_reason)).to contain_exactly(nil, "no_active_connectors")
  end

  it "todas passam nas próprias validações" do
    campaigns.each { |campaign| expect(campaign).to be_valid, "#{campaign.name}: #{campaign.errors.full_messages}" }
  end

  describe "sem disparar nada" do
    it "nenhum job é enfileirado" do
      clear_enqueued_jobs

      seed

      expect(enqueued_jobs).to be_empty
    end

    it "nenhuma chamada de rede" do
      expect(WebMock).not_to have_requested(:any, /.*/)
    end

    # A recuperação roda de 10 em 10 minutos no desenvolvimento.
    it "a recuperação não mexe em nada" do
      before_status = campaigns.pluck(:name, :status_cd).to_h

      Outreach::RecoveryJob.perform_now

      expect(campaigns.pluck(:name, :status_cd).to_h).to eq(before_status)
      expect(enqueued_jobs.select { |job| job["job_class"] == "Outreach::BatchJob" }).to be_empty
    end

    it "a agendada não vence tão cedo" do
      expect(campaigns.where(status_cd: "scheduled").first.scheduled_at).to be > 1.week.from_now
    end
  end

  describe "as buscas de estabelecimentos" do
    let(:extractions) { organization.place_extractions }

    it "traz concluídas e uma que falhou" do
      expect(extractions.pluck(:status).tally).to eq("completed" => 2, "failed" => 1)
    end

    it "os resultados têm telefone e o formato dos que o Apify traz" do
      place = extractions.completed.first.results.first

      expect(place.keys).to include("title", "phone", "phone_unformatted", "address", "category_name", "place_id", "opening_hours")
      expect(place["phone_unformatted"]).to match(/\A55\d+\z/)
    end

    it "conta os resultados certo" do
      extractions.completed.each { |extraction| expect(extraction.results_count).to eq(extraction.results.size) }
    end

    it "aparecem na lista de contatos encontrados" do
      page = Outreach::PlaceContacts.new(organization.id).page(offset: 0, limit: 5)

      expect(page.total).to be > 8
      expect(page.rows.size).to eq(5)
    end
  end

  it "é idempotente" do
    counts = -> { [ campaigns.count, Outreach::Recipient.count, Outreach::Batch.count, Outreach::ActivityLog.count, organization.place_extractions.count ] }

    expect { seed }.not_to(change { counts.call })
  end

  it "não desfaz o que a pessoa fez" do
    campaign = campaigns.where(status_cd: "draft").first
    campaign.set(messages: [ "Texto que a pessoa escreveu" ])

    seed

    expect(campaign.reload.messages).to eq([ "Texto que a pessoa escreveu" ])
  end

  it "rodar de novo mantém o lote da campanha em andamento longe" do
    batch = campaigns.where(status_cd: "running").first.batches.where(status_cd: "processing").first
    batch.set(next_send_at: 1.hour.from_now)

    seed

    expect(batch.reload.next_send_at).to be > 20.days.from_now
  end

  it "sem a conta de demonstração, não faz nada" do
    Outreach::Campaign.delete_all
    owner.update!(email: "outra@exemplo.com.br")

    expect { seed }.not_to(change { Outreach::Campaign.count })
  end
end
