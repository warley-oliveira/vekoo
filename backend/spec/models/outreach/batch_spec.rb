require "rails_helper"

RSpec.describe Outreach::Batch, type: :model do
  let(:campaign) { create(:outreach_campaign, :running) }
  let(:connector_id) { BSON::ObjectId.new.to_s }
  let(:recipients) { create_list(:outreach_recipient, 3, campaign: campaign) }
  let(:batch) do
    create(:outreach_batch, campaign: campaign, connector_id: connector_id, phone_number_id: "55", channel_key: "#{connector_id}:55", recipient_ids: recipients.map(&:id))
  end

  it "exige conector, canal e sequência" do
    expect(build(:outreach_batch, connector_id: nil)).not_to be_valid
    expect(build(:outreach_batch, channel_key: nil)).not_to be_valid
    expect(build(:outreach_batch, sequence: nil)).not_to be_valid
  end

  describe "#take_turn!" do
    let(:now) { Time.current }

    it "toma a vez e empurra a próxima" do
      expect(batch.take_turn!(now: now, next_send_at: now + 30.seconds)).to be(true)
      expect(batch.reload).to have_attributes(status_cd: "processing")
      expect(batch.next_send_at.to_i).to eq((now + 30.seconds).to_i)
    end

    # Origem: 'skips when the batch was already claimed by another worker'.
    it "de dois jobs iguais, só um passa" do
      copy = described_class.find(batch.id)

      expect(batch.take_turn!(now: now, next_send_at: now + 30.seconds)).to be(true)
      expect(copy.take_turn!(now: now, next_send_at: now + 30.seconds)).to be(false)
    end

    it "não passa antes da hora" do
      batch.set(next_send_at: now + 1.minute)

      expect(batch.take_turn!(now: now, next_send_at: now + 2.minutes)).to be(false)
    end

    it "passa depois da hora, retomando um encadeamento que parou" do
      batch.set(next_send_at: now - 1.hour, status_cd: "processing")

      expect(batch.take_turn!(now: now, next_send_at: now + 30.seconds)).to be(true)
    end

    it "não passa em lote terminado" do
      batch.set(status_cd: "completed")

      expect(batch.take_turn!(now: now, next_send_at: now + 30.seconds)).to be(false)
    end

    it "em paralelo, só um vence" do
      copies = Array.new(5) { described_class.find(batch.id) }
      results = copies.map { |copy| Thread.new { copy.take_turn!(now: now, next_send_at: now + 30.seconds) } }.map(&:value)

      expect(results.count(true)).to eq(1)
    end
  end

  describe "#defer_until!" do
    it "adia uma vez: o job duplicado não enfileira de novo" do
      time = 1.day.from_now

      expect(batch.defer_until!(time)).to be(true)
      expect(described_class.find(batch.id).defer_until!(time)).to be(false)
    end

    it "não adia para antes do que já está marcado" do
      batch.set(next_send_at: 2.days.from_now)

      expect(batch.defer_until!(1.day.from_now)).to be(false)
    end
  end

  describe "#claim_next_recipient" do
    it "toma na ordem e grava o canal" do
      taken = batch.claim_next_recipient

      expect(taken.id).to eq(recipients.first.id)
      expect(taken).to have_attributes(status_cd: "sending", connector_id: connector_id, phone_number_id: "55", claim_token: be_present, claimed_at: be_present)
    end

    it "pula quem não está pendente" do
      recipients.first.set(status_cd: "sent")

      expect(batch.claim_next_recipient.id).to eq(recipients.second.id)
    end

    it "sem ninguém pendente, devolve nil" do
      recipients.each { |recipient| recipient.set(status_cd: "failed") }

      expect(batch.claim_next_recipient).to be_nil
    end

    it "só alcança os destinatários do próprio lote" do
      recipients.each { |recipient| recipient.set(status_cd: "sent") }
      create(:outreach_recipient, campaign: campaign)

      expect(batch.claim_next_recipient).to be_nil
    end

    it "só alcança a própria campanha, mesmo com um id trocado" do
      foreign = create(:outreach_recipient)
      batch.set(recipient_ids: [ foreign.id ])

      expect(batch.claim_next_recipient).to be_nil
      expect(foreign.reload.status_cd).to eq("pending")
    end

    # Concorrência entre lotes: dois lotes com o mesmo destinatário, depois de uma retomada.
    it "em execuções paralelas, cada destinatário é tomado uma vez" do
      other = create(:outreach_batch, campaign: campaign, recipient_ids: recipients.map(&:id))

      taken = Array.new(6) { |index| index.even? ? batch : other }
                   .map { |source| Thread.new { source.claim_next_recipient } }
                   .map(&:value)
                   .compact

      expect(taken.map(&:id)).to match_array(recipients.map(&:id))
    end
  end

  describe "#position_of" do
    it "soma o que o canal já teve nos lotes anteriores" do
      batch.set(position_offset: 50)

      expect(batch.position_of(recipients.third)).to eq(52)
    end
  end

  describe "#complete!" do
    it "termina uma vez só" do
      expect(batch.complete!).to be(true)
      expect(described_class.find(batch.id).complete!).to be(false)
      expect(batch.reload).to have_attributes(status_cd: "completed", completed_at: be_present)
    end
  end
end
