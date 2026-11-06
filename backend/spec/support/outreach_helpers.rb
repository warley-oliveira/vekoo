# Apoio às specs de campanha. A rede é fechada: o provedor é simulado pelo WebMock, e o resto
# (conversa, mensagem, destinatário, lote) roda de verdade contra o Mongo.
module OutreachHelpers
  JSON_HEADERS = { "Content-Type" => "application/json" }.freeze

  def evolution_text_url(connector)
    "http://evolution.test/message/sendText/#{connector.instance_name}"
  end

  def evolution_media_url(connector)
    "http://evolution.test/message/sendMedia/#{connector.instance_name}"
  end

  def evolution_numbers_url(connector)
    "http://evolution.test/chat/whatsappNumbers/#{connector.instance_name}"
  end

  # Todo número consultado existe, na forma pedida. Passe `only:` para dizer quais formas existem.
  def stub_number_check(connector, only: nil)
    stub_request(:post, evolution_numbers_url(connector)).to_return do |request|
      numbers = JSON.parse(request.body).fetch("numbers").map { |jid| BrPhoneVariants.digits_of(jid) }
      answers = numbers.map do |number|
        { exists: only.nil? || Array(only).include?(number), jid: "#{number}@s.whatsapp.net", number: number }
      end

      { status: 200, body: answers.to_json, headers: JSON_HEADERS }
    end
  end

  # O canal aceita tudo, com um id novo por envio.
  def stub_text_accepted(connector)
    sequence = 0
    stub_request(:post, evolution_text_url(connector)).to_return do
      sequence += 1
      { status: 201, body: { key: { id: "EVO-#{sequence}" } }.to_json, headers: JSON_HEADERS }
    end
  end

  def stub_channel_working(connector)
    stub_number_check(connector)
    stub_text_accepted(connector)
  end

  # Lote de destinatários já pronto para o passo de envio.
  def build_batch(campaign, recipients, connector:, phone_number_id: nil, **attributes)
    create(
      :outreach_batch,
      campaign: campaign,
      connector_id: connector.id.to_s,
      phone_number_id: phone_number_id,
      channel_key: "#{connector.id}:#{phone_number_id}",
      sequence: 0,
      recipient_ids: recipients.map(&:id),
      next_send_at: Time.current,
      **attributes
    )
  end

  # Um destinatário tomado, como o passo entrega ao serviço de envio.
  def claimed(recipient, connector: nil)
    Outreach::Recipient.where(_id: recipient.id).find_one_and_update(
      { "$set" => { status_cd: "sending", claim_token: SecureRandom.hex(4), claimed_at: Time.current, connector_id: connector&.id&.to_s } },
      return_document: :after
    )
  end

  def run_step(batch, token: batch.campaign.run_token)
    Outreach::BatchExecutionService.new(
      campaign_id: batch.campaign_id.to_s,
      organization_id: batch.campaign.organization_id,
      batch_id: batch.id.to_s,
      run_token: token
    ).call
  end

  def enqueued_steps
    enqueued_jobs.select { |job| job["job_class"] == "Outreach::BatchJob" }
  end
end

RSpec.configure do |config|
  config.include OutreachHelpers
  config.include ActiveJob::TestHelper
  config.include ActiveSupport::Testing::TimeHelpers
end
