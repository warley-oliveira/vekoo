require "rails_helper"

# Retomada depois de queda de worker.
RSpec.describe Outreach::Reconciler do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:campaign) { create(:outreach_campaign, :running, organization: organization, connector_ids: [ connector.id.to_s ]) }
  let(:recipient) { create(:outreach_recipient, campaign: campaign) }

  def reconcile
    described_class.new(campaign.reload).call
  end

  describe "encadeamento que parou" do
    it "retoma o lote atrasado, com um job" do
      batch = build_batch(campaign, [ recipient ], connector: connector, status_cd: "processing", next_send_at: 20.minutes.ago, scheduled_at: 1.hour.ago)

      reconcile

      expect(enqueued_steps.size).to eq(1)
      expect(enqueued_steps.first["arguments"]).to eq([ campaign.id.to_s, organization.id, batch.id.to_s, campaign.run_token ])
      expect(batch.reload.next_send_at).to be_within(5.seconds).of(Time.current)
    end

    it "retoma quem o lançamento nem chegou a enfileirar" do
      build_batch(campaign, [ recipient ], connector: connector, status_cd: "scheduled", next_send_at: 20.minutes.ago)

      reconcile

      expect(enqueued_steps.size).to eq(1)
    end

    it "só o primeiro lote do canal: o resto vem em sequência" do
      batch = build_batch(campaign, [ recipient ], connector: connector, next_send_at: 20.minutes.ago)
      create(:outreach_batch, campaign: campaign, connector_id: connector.id.to_s, channel_key: batch.channel_key, sequence: 1, created_at: 1.hour.ago)

      reconcile

      expect(enqueued_steps.size).to eq(1)
      expect(enqueued_steps.first["arguments"]).to include(batch.id.to_s)
    end

    it "um job por canal parado" do
      build_batch(campaign, [ recipient ], connector: connector, next_send_at: 20.minutes.ago)
      other = create(:connector_whatsapp_web, organization: organization)
      build_batch(campaign, [ create(:outreach_recipient, campaign: campaign) ], connector: other, next_send_at: 20.minutes.ago)

      reconcile

      expect(enqueued_steps.size).to eq(2)
    end

    it "lote que só falta chegar a hora fica como está" do
      build_batch(campaign, [ recipient ], connector: connector, next_send_at: 5.minutes.ago)

      reconcile

      expect(enqueued_steps).to be_empty
    end

    it "lote adiado para a janela de amanhã fica como está" do
      build_batch(campaign, [ recipient ], connector: connector, next_send_at: 1.day.from_now)

      reconcile

      expect(enqueued_steps).to be_empty
    end

    it "um lote sem horário nenhum usa a data de criação" do
      build_batch(campaign, [ recipient ], connector: connector, next_send_at: nil, created_at: 1.hour.ago)

      reconcile

      expect(enqueued_steps.size).to eq(1)
    end

    # Quando o job antigo só estava atrasado na fila: os dois rodam, e só um envia.
    it "retomar um encadeamento vivo não duplica envio" do
      stub_channel_working(connector)
      batch = build_batch(campaign, [ recipient, create(:outreach_recipient, campaign: campaign) ], connector: connector, next_send_at: 20.minutes.ago)

      reconcile
      run_step(batch)
      run_step(batch)

      expect(a_request(:post, evolution_text_url(connector))).to have_been_made.once
    end
  end

  describe "canal que voltou" do
    let!(:batch) do
      build_batch(campaign, [ recipient ], connector: connector, status_cd: "failed", failure_reason: "connector_inactive", next_send_at: 1.hour.ago)
    end

    before do
      other = create(:connector_whatsapp_web, organization: organization)
      build_batch(campaign, [ create(:outreach_recipient, campaign: campaign) ], connector: other, next_send_at: 1.minute.from_now)
    end

    it "volta a enviar, avisando na atividade" do
      reconcile

      expect(batch.reload).to have_attributes(status_cd: "scheduled", failure_reason: nil)
      expect(enqueued_steps.size).to eq(1)
      expect(campaign.activity_logs.where(action: "channel_resumed").count).to eq(1)
    end

    it "reativa também os lotes seguintes do canal" do
      following = create(:outreach_batch, campaign: campaign, connector_id: connector.id.to_s, channel_key: batch.channel_key, sequence: 1, status_cd: "failed", failure_reason: "connector_inactive")

      reconcile

      expect(following.reload.status_cd).to eq("scheduled")
      expect(enqueued_steps.size).to eq(1)
    end

    it "se continua fora do ar, fica como está" do
      connector.set(status_cd: "closed")

      reconcile

      expect(batch.reload.status_cd).to eq("failed")
      expect(enqueued_steps).to be_empty
    end
  end

  describe "campanha sem nada em andamento" do
    it "sem ninguém pendente, conclui: caiu entre o último envio e a conclusão" do
      create(:outreach_recipient, campaign: campaign, status_cd: "sent")

      reconcile

      expect(campaign.reload.status_cd).to eq("completed")
    end

    it "com pendentes fora de qualquer lote, monta de novo: caiu antes de montar" do
      recipient

      reconcile

      expect(campaign.batches.executable.count).to eq(1)
      expect(enqueued_steps.size).to eq(1)
    end

    it "com pendentes e nenhum canal de pé, pausa" do
      recipient
      connector.set(status_cd: "closed")

      reconcile

      expect(campaign.reload).to have_attributes(status_cd: "paused", pause_reason: "no_active_connectors")
    end

    it "com alguém no meio do envio, espera" do
      create(:outreach_recipient, campaign: campaign, status_cd: "sending")

      reconcile

      expect(campaign.reload.status_cd).to eq("running")
    end
  end

  # A requisição de lançar pode estar montando os lotes neste instante.
  it "não mexe em campanha que acabou de ser montada" do
    recipient
    campaign.set(planned_at: 1.minute.ago)

    reconcile

    expect(campaign.batches.count).to eq(0)
    expect(enqueued_steps).to be_empty
  end
end
