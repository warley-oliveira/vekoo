require "rails_helper"

# Origem: spec/services/campaigns/batch_execution_service_spec.rb. Lá o lote inteiro rodava em um job,
# dormindo entre as mensagens; aqui cada execução é um passo, e o passo seguinte é um job novo.
RSpec.describe Outreach::BatchExecutionService do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:campaign) { create(:outreach_campaign, :running, organization: organization, connector_ids: [ connector.id.to_s ]) }
  let(:recipients) { create_list(:outreach_recipient, 3, campaign: campaign) }
  let(:batch) { build_batch(campaign, recipients, connector: connector) }

  before do
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    stub_channel_working(connector)
  end

  def text_requests
    a_request(:post, evolution_text_url(connector))
  end

  describe "quando o passo não vale mais" do
    # Origem: 'raises while campaign is still draft': lá era uma corrida com o lançamento. Aqui o estado
    # muda antes de o job existir, e um job assim só pode ser sobra.
    it "campanha em rascunho não envia" do
      campaign.set(status_cd: "draft")

      run_step(batch)

      expect(text_requests).not_to have_been_made
    end

    it "campanha pausada não envia" do
      campaign.set(status_cd: "paused")

      run_step(batch)

      expect(text_requests).not_to have_been_made
    end

    it "campanha cancelada não envia" do
      campaign.set(status_cd: "cancelled")

      run_step(batch)

      expect(text_requests).not_to have_been_made
    end

    # O cancelamento por token: pausar e retomar deixa o job antigo na fila, e ele chega aqui.
    it "o token de antes da pausa não vale mais" do
      run_step(batch, token: "token-velho")

      expect(text_requests).not_to have_been_made
      expect(recipients.first.reload.status_cd).to eq("pending")
      expect(enqueued_steps).to be_empty
    end

    it "lote que não existe mais é ignorado" do
      batch.delete

      expect { run_step(batch) }.not_to raise_error
      expect(text_requests).not_to have_been_made
    end

    it "lote já concluído é ignorado" do
      batch.set(status_cd: "completed")

      run_step(batch)

      expect(text_requests).not_to have_been_made
    end

    it "campanha de outra organização não é alcançada" do
      described_class.new(
        campaign_id: campaign.id.to_s,
        organization_id: create(:organization).id,
        batch_id: batch.id.to_s,
        run_token: campaign.run_token
      ).call

      expect(text_requests).not_to have_been_made
    end
  end

  describe "um passo normal" do
    it "envia para um destinatário, só um" do
      run_step(batch)

      expect(text_requests).to have_been_made.once
      expect(recipients.map { |recipient| recipient.reload.status_cd }).to eq(%w[sent pending pending])
    end

    it "agenda o próximo passo depois do intervalo, com um job só" do
      freeze_time do
        campaign.set(buffer_min_seconds: 30, buffer_max_seconds: 30)

        run_step(batch)

        expect(enqueued_steps.size).to eq(1)
        job = enqueued_steps.first
        expect(job["arguments"]).to eq([ campaign.id.to_s, organization.id, batch.id.to_s, campaign.run_token ])
        expect(job["queue_name"]).to eq("campaigns")
        expect(Time.iso8601(job["scheduled_at"])).to eq(30.seconds.from_now)
        expect(batch.reload.next_send_at).to eq(30.seconds.from_now)
      end
    end

    it "o intervalo fica dentro do que a campanha pediu" do
      freeze_time do
        campaign.set(buffer_min_seconds: 10, buffer_max_seconds: 20)

        run_step(batch)

        expect(batch.reload.next_send_at).to be_between(10.seconds.from_now, 20.seconds.from_now)
      end
    end

    it "conta o envio no canal" do
      run_step(batch)

      expect(Outreach::ChannelUsage.used_on(batch.channel_key, Outreach::SendWindow.new(campaign).day_key(Time.current))).to eq(1)
    end

    it "transmite o destinatário e o progresso" do
      stream = CampaignChannel.organization_stream(organization.id, CampaignChannel.stream_for_campaign(campaign.id))

      expect { run_step(batch) }.to have_broadcasted_to(stream).at_least(:twice)
    end

    it "uma falha de transmissão do monitor não atrapalha o envio" do
      stream = CampaignChannel.organization_stream(organization.id, CampaignChannel.stream_for_campaign(campaign.id))
      allow(ActionCable.server).to receive(:broadcast).and_call_original
      allow(ActionCable.server).to receive(:broadcast).with(stream, anything).and_raise(Redis::CannotConnectError)

      expect { run_step(batch) }.not_to raise_error
      expect(recipients.first.reload.status_cd).to eq("sent")
    end
  end

  # Origem: 'skips when the batch was already claimed by another worker'.
  describe "execução duplicada" do
    it "de dois jobs iguais, só um envia, e o encadeamento segue com um job só" do
      run_step(batch)
      run_step(batch)

      expect(text_requests).to have_been_made.once
      expect(enqueued_steps.size).to eq(1)
    end

    it "um job atrasado não fura o intervalo" do
      campaign.set(buffer_min_seconds: 60, buffer_max_seconds: 60)

      run_step(batch)
      travel 30.seconds
      run_step(batch)

      expect(text_requests).to have_been_made.once
    end

    it "depois do intervalo, o passo seguinte envia" do
      campaign.set(buffer_min_seconds: 60, buffer_max_seconds: 60)

      run_step(batch)
      travel 61.seconds
      run_step(batch)

      expect(text_requests).to have_been_made.twice
    end
  end

  # Origem: 'sends only non-terminal recipients and completes the batch'.
  describe "fim do lote" do
    it "envia só para quem não terminou, e conclui o lote e a campanha" do
      recipients.first.set(status_cd: "sent")
      recipients.second.set(status_cd: "failed")

      run_step(batch)

      expect(text_requests).to have_been_made.once
      expect(batch.reload.status_cd).to eq("completed")
      expect(campaign.reload).to have_attributes(status_cd: "completed", completed_at: be_present)
    end

    it "concluiu a campanha, registra uma vez e não agenda mais nada" do
      recipients.each { |recipient| recipient.set(status_cd: "sent") }

      run_step(batch)

      expect(campaign.reload.status_cd).to eq("completed")
      expect(campaign.activity_logs.where(action: "completed").count).to eq(1)
      expect(enqueued_steps).to be_empty
    end

    it "sem ninguém para tomar, devolve a vaga do limite diário" do
      recipients.each { |recipient| recipient.set(status_cd: "sent") }

      run_step(batch)

      expect(Outreach::ChannelUsage.used_on(batch.channel_key, Outreach::SendWindow.new(campaign).day_key(Time.current))).to eq(0)
    end

    # Origem: 'does not complete campaign while there are pending batches'.
    it "não conclui a campanha enquanto outro canal trabalha" do
      other_connector = create(:connector_whatsapp_web, organization: organization)
      other = create(:outreach_recipient, campaign: campaign)
      build_batch(campaign, [ other ], connector: other_connector)
      recipients.each { |recipient| recipient.set(status_cd: "sent") }

      run_step(batch)

      expect(batch.reload.status_cd).to eq("completed")
      expect(campaign.reload.status_cd).to eq("running")
    end

    it "não conclui com alguém no meio do envio" do
      recipients.first.set(status_cd: "sent")
      recipients.second.set(status_cd: "sent")
      recipients.third.set(status_cd: "sending")

      run_step(batch)

      expect(campaign.reload.status_cd).to eq("running")
    end

    it "dois canais terminando juntos concluem uma vez só" do
      second_batch = build_batch(campaign, [], connector: create(:connector_whatsapp_web, organization: organization))
      recipients.each { |recipient| recipient.set(status_cd: "sent") }

      run_step(batch)
      run_step(second_batch)

      expect(campaign.activity_logs.where(action: "completed").count).to eq(1)
    end
  end

  describe "próximo lote do canal" do
    let(:recipients) { create_list(:outreach_recipient, 2, campaign: campaign) }
    let(:batch) { build_batch(campaign, [ recipients.first ], connector: connector) }

    let!(:following) do
      create(:outreach_batch, campaign: campaign, connector_id: connector.id.to_s, channel_key: batch.channel_key, sequence: 1, recipient_ids: [ recipients.second.id ])
    end

    it "ao acabar o lote, o seguinte entra na vez, depois do intervalo" do
      freeze_time do
        campaign.set(buffer_min_seconds: 30, buffer_max_seconds: 30)
        batch.set(next_send_at: Time.current)

        run_step(batch)

        expect(batch.reload.status_cd).to eq("completed")
        expect(following.reload).to have_attributes(status_cd: "scheduled", next_send_at: 30.seconds.from_now, scheduled_at: 30.seconds.from_now)
        expect(enqueued_steps.size).to eq(1)
        expect(enqueued_steps.first["arguments"]).to include(following.id.to_s)
      end
    end

    it "a campanha continua até o último lote" do
      run_step(batch)

      expect(campaign.reload.status_cd).to eq("running")
    end
  end

  describe "janela de envio" do
    # 2026-11-09 é uma segunda-feira, às 22h em São Paulo.
    let(:night) { ActiveSupport::TimeZone["America/Sao_Paulo"].local(2026, 11, 9, 22) }

    before { campaign.set(send_start_hour: 9, send_end_hour: 18) }

    it "fora da janela, não envia e agenda para quando ela abre" do
      travel_to(night) do
        run_step(batch)

        expect(text_requests).not_to have_been_made
        expect(enqueued_steps.size).to eq(1)
        expect(Time.iso8601(enqueued_steps.first["scheduled_at"])).to eq(night.change(hour: 9) + 1.day)
        expect(batch.reload.next_send_at).to eq(night.change(hour: 9) + 1.day)
      end
    end

    it "o job duplicado fora da janela não agenda de novo" do
      travel_to(night) do
        run_step(batch)
        run_step(batch)

        expect(enqueued_steps.size).to eq(1)
      end
    end

    # Retomada depois de queda: a origem dispararia tudo que venceu durante a madrugada.
    it "um worker que volta de madrugada espera a janela" do
      batch.set(status_cd: "processing", next_send_at: night - 6.hours)

      travel_to(night) { run_step(batch) }

      expect(text_requests).not_to have_been_made
    end
  end

  describe "limite diário por canal" do
    before { campaign.set(daily_limit_per_connector: 1) }

    it "atingido, não envia e deixa para o próximo dia" do
      freeze_time do
        run_step(batch)
        batch.set(next_send_at: Time.current)
        clear_enqueued_jobs

        run_step(batch)

        expect(text_requests).to have_been_made.once
        expect(enqueued_steps.size).to eq(1)
        expect(Time.iso8601(enqueued_steps.first["scheduled_at"])).to be > 1.hour.from_now
        expect(recipients.second.reload.status_cd).to eq("pending")
      end
    end

    # A origem zerava a conta ao retomar, e uma campanha pausada no meio do dia passava do limite.
    it "pausar e retomar não zera a conta do dia" do
      run_step(batch)

      Outreach::Lifecycle.new(campaign.reload).pause
      Outreach::Lifecycle.new(campaign.reload).resume

      new_batch = campaign.reload.batches.executable.first
      new_batch.set(next_send_at: Time.current)
      run_step(new_batch)

      expect(text_requests).to have_been_made.once
    end

    it "vale para todas as campanhas do mesmo canal" do
      run_step(batch)

      other_campaign = create(:outreach_campaign, :running, organization: organization, connector_ids: [ connector.id.to_s ], daily_limit_per_connector: 1)
      other_recipient = create(:outreach_recipient, campaign: other_campaign)
      other_batch = build_batch(other_campaign, [ other_recipient ], connector: connector)

      run_step(other_batch)

      expect(text_requests).to have_been_made.once
      expect(other_recipient.reload.status_cd).to eq("pending")
    end

    it "outro canal tem a própria conta" do
      run_step(batch)

      other_connector = create(:connector_whatsapp_web, organization: organization)
      stub_channel_working(other_connector)
      other_recipient = create(:outreach_recipient, campaign: campaign)

      run_step(build_batch(campaign, [ other_recipient ], connector: other_connector))

      expect(other_recipient.reload.status_cd).to eq("sent")
    end
  end

  # Origem: 'marks the batch as failed when integration is missing / inactive'. A origem que estava em
  # uso (SendRecipientService) marcava cada destinatário como falho e queimava a lista.
  describe "canal fora do ar" do
    before { connector.set(status_cd: "closed") }

    it "falha o lote, com o motivo, sem tocar em ninguém" do
      run_step(batch)

      expect(batch.reload).to have_attributes(status_cd: "failed", failure_reason: "connectorInactive")
      expect(recipients.map { |recipient| recipient.reload.status_cd }).to all(eq("pending"))
      expect(campaign.reload.failed_count).to eq(0)
      expect(text_requests).not_to have_been_made
    end

    it "sem canal nenhum, a campanha pausa sozinha e diz o motivo" do
      run_step(batch)

      expect(campaign.reload).to have_attributes(status_cd: "paused", pause_reason: "noActiveConnectors")
      expect(campaign.activity_logs.where(action: "paused").take.metadata).to eq("reason" => "noActiveConnectors")
    end

    it "avisa quem criou a campanha" do
      creator = create(:account, organization: organization)
      campaign.set(created_by_account_id: creator.id)

      run_step(batch)

      notice = AccountNotice.where(account_id: creator.id).take
      expect(notice.title).to include(campaign.name)
      expect(notice.url).to eq("/campaigns/#{campaign.id}")
    end

    it "para também os outros lotes do canal" do
      following = create(:outreach_batch, campaign: campaign, connector_id: connector.id.to_s, channel_key: batch.channel_key, sequence: 1)

      run_step(batch)

      expect(following.reload.status_cd).to eq("failed")
    end

    it "com outro canal de pé, a campanha segue" do
      other_connector = create(:connector_whatsapp_web, organization: organization)
      other_recipient = create(:outreach_recipient, campaign: campaign)
      build_batch(campaign, [ other_recipient ], connector: other_connector)

      run_step(batch)

      expect(batch.reload.status_cd).to eq("failed")
      expect(campaign.reload.status_cd).to eq("running")
      expect(campaign.activity_logs.where(action: "channel_stopped").count).to eq(1)
    end

    it "quando o último canal de pé termina, a campanha pausa em vez de concluir" do
      other_connector = create(:connector_whatsapp_web, organization: organization)
      stub_channel_working(other_connector)
      other_recipient = create(:outreach_recipient, campaign: campaign)
      other_batch = build_batch(campaign, [ other_recipient ], connector: other_connector)

      run_step(batch)
      run_step(other_batch)

      expect(campaign.reload).to have_attributes(status_cd: "paused", pause_reason: "noActiveConnectors")
    end

    it "canal excluído tem o próprio motivo" do
      batch
      connector.delete

      run_step(batch)

      expect(batch.reload.failure_reason).to eq("connectorMissing")
    end

    it "não alcança um canal com o mesmo id em outra organização" do
      batch
      connector.set(status_cd: "active", organization_id: create(:organization).id)

      run_step(batch)

      expect(batch.reload.failure_reason).to eq("connectorMissing")
    end
  end

  # Origem: 'marks a processing batch as failed and reraises unexpected errors'. Aqui o erro de
  # infraestrutura sobe para o job tentar de novo, e o destinatário não se perde: a recuperação resolve.
  describe "erro inesperado" do
    it "sobe para o job" do
      allow(Outreach::SendRecipientService).to receive(:new).and_raise(Mongo::Error::SocketError, "caiu")

      expect { run_step(batch) }.to raise_error(Mongo::Error::SocketError)
    end

    it "a nova tentativa do job não manda duas vezes" do
      allow(Outreach::SendRecipientService).to receive(:new).and_raise(Mongo::Error::SocketError, "caiu")
      expect { run_step(batch) }.to raise_error(Mongo::Error::SocketError)
      allow(Outreach::SendRecipientService).to receive(:new).and_call_original

      batch.set(next_send_at: Time.current)
      run_step(batch)

      expect(recipients.first.reload.status_cd).to eq("sending")
      expect(recipients.second.reload.status_cd).to eq("sent")
      expect(text_requests).to have_been_made.once
    end
  end

  # Uma campanha inteira, passo a passo, como o Sidekiq faria.
  it "do início ao fim, com dois canais" do
    other_connector = create(:connector_whatsapp_web, organization: organization)
    stub_channel_working(other_connector)
    campaign.set(connector_ids: [ connector.id.to_s, other_connector.id.to_s ], status_cd: "draft", batch_size: 2)
    create_list(:outreach_recipient, 5, campaign: campaign)

    Outreach::LaunchService.new(campaign.reload).call

    until enqueued_steps.empty?
      job = enqueued_steps.first
      enqueued_jobs.delete(job)
      travel_to(Time.iso8601(job["scheduled_at"]) + 1.second)
      Outreach::BatchJob.new(*job["arguments"]).perform_now
    end
    travel_back

    expect(campaign.reload).to have_attributes(status_cd: "completed", sent_count: 5, failed_count: 0)
    expect(a_request(:post, evolution_text_url(connector))).to have_been_made.times(3)
    expect(a_request(:post, evolution_text_url(other_connector))).to have_been_made.times(2)
  end
end
