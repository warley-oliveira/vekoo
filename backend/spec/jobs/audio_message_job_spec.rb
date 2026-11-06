require "rails_helper"

# Na origem este job também gerava a resposta do assistente; o que ficou é baixar, guardar,
# transcrever, gravar a mensagem e seguir para `Chats::InboundFlow`. A origem não tinha spec dele.
# O download de cada canal fica em spec/services/inbound/media_download_spec.rb, e a transcrição
# em spec/services/chats/audio_transcriber_spec.rb.
RSpec.describe AudioMessageJob do
  include ActiveJob::TestHelper
  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }
  let(:audio_url) { "https://bucket.exemplo.com/audio.ogg" }
  let(:message_id) { "A1" }
  let(:whisper_url) { "https://api.openai.com/v1/audio/transcriptions" }

  before do
    allow(Flows::InboundDispatcher).to receive(:call)
    stub_env("OPENAI_ACCESS_TOKEN" => nil)
    stub_request(:get, audio_url).to_return(status: 200, body: "bytes-do-audio")
  end

  def run_job(id: message_id, from_me: false, reference: audio_url, organization_id: organization.id, raw: nil, on_chat: chat)
    described_class.perform_now(on_chat.id.to_s, organization_id, reference, id, from_me, "João", raw)
  end

  def stub_whisper(text: "Quero marcar um horário")
    stub_env("OPENAI_ACCESS_TOKEN" => "sk-teste")
    stub_request(:post, whisper_url)
      .with(headers: { "Authorization" => "Bearer sk-teste" })
      .to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { text: text }.to_json)
  end

  def message(id = message_id)
    ChatMessage::Audio.where(chat_id: chat.id, message_id: id).take
  end

  it "roda na fila critical" do
    expect(described_class.new.queue_name).to eq("critical")
  end

  describe "áudio do contato" do
    it "guarda o arquivo e grava a mensagem" do
      run_job

      expect(message).to have_attributes(
        role: "user",
        message_origin: "platform",
        content: "-",
        audio_url: start_with("/rails/active_storage/blobs/proxy/")
      )
      expect(blob_of(message).download).to eq("bytes-do-audio")
    end

    it "dá nome ao arquivo com o telefone e o id" do
      run_job

      expect(blob_of(message).filename.to_s).to eq("5531971810932-A1.ogg")
    end

    it "transcreve e entrega a transcrição aos fluxos" do
      stub_whisper

      run_job

      expect(message.content).to eq("Quero marcar um horário")
      expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat, text: "Quero marcar um horário", event: "first_message", message_id: "A1")
    end

    it "manda para a transcrição o arquivo baixado" do
      whisper = stub_whisper

      run_job

      expect(whisper.with { |request| request.body.include?("bytes-do-audio") && request.body.include?("whisper-1") }).to have_been_requested
    end

    it "sem transcrição, o conteúdo é - e os fluxos recebem texto vazio" do
      run_job

      expect(message.content).to eq("-")
      expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(text: ""))
    end

    it "transcrição que falha não perde a mensagem" do
      stub_env("OPENAI_ACCESS_TOKEN" => "sk-teste")
      stub_request(:post, whisper_url).to_return(status: 500, body: "fora")

      run_job

      expect(message.content).to eq("-")
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end

    it "com a automação desligada, grava sem transcrever e conta como não lida" do
      whisper = stub_whisper
      chat.set(automation_enabled: false)

      run_job

      expect(whisper).not_to have_been_requested
      expect(message.content).to eq("-")
      expect(chat.reload.unread_messages).to eq(1)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "sem crédito na organização, grava sem transcrever" do
      whisper = stub_whisper
      organization.update!(credits_used: organization.credits_total)

      run_job

      expect(whisper).not_to have_been_requested
      expect(message.content).to eq("-")
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end

    it "não debita crédito" do
      stub_whisper

      expect { run_job }.not_to(change { organization.reload.credits_used })
    end

    it "com mensagem anterior, o evento é message_received" do
      create(:chat_text_message, chat: chat)

      run_job

      expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "message_received"))
    end

    it "atualiza a prévia e conta como não lida" do
      stub_whisper

      run_job

      expect(chat.reload).to have_attributes(last_message_type: "audio", last_message_by: "user", last_message_content: "Quero marcar um horário", unread_messages: 1)
    end

    it "transmite para a conversa" do
      expect { run_job }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
    end
  end

  describe "áudio nosso, de outro aparelho" do
    before { chat.set(unread_messages: 3) }

    it "entra como nosso, sem conteúdo" do
      run_job(from_me: true)

      expect(message).to have_attributes(role: "assistant", message_origin: "user", content: "")
      expect(blob_of(message).download).to eq("bytes-do-audio")
    end

    it "não transcreve" do
      whisper = stub_whisper

      run_job(from_me: true)

      expect(whisper).not_to have_been_requested
    end

    it "pausa a automação, zera as não lidas e não chama os fluxos" do
      run_job(from_me: true)

      expect(chat.reload).to have_attributes(automation_enabled: false, unread_messages: 0)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "agenda a volta da automação pelo período da organização" do
      organization.update!(settings: { "automation_pause_period" => "days", "automation_pause_time_to" => 1 })

      expect { run_job(from_me: true) }.to have_enqueued_job(EnableContactJob)
    end

    context "quando o download falha" do
      before { stub_request(:get, audio_url).to_return(status: 500) }

      it "fica o link do provedor, sem nova tentativa" do
        expect { run_job(from_me: true) }.not_to have_enqueued_job(described_class)

        expect(message).to have_attributes(audio_url: audio_url, media_blob_id: nil, role: "assistant")
        expect(notes_of(chat, "error").count).to eq(0)
      end

      it "pausa a automação do mesmo jeito" do
        run_job(from_me: true)

        expect(chat.reload.automation_enabled).to be(false)
      end
    end
  end

  describe "o que não processa" do
    it "sem referência de áudio não faz nada" do
      expect { run_job(reference: nil) }.not_to raise_error

      expect(messages_of(chat).count).to eq(0)
    end

    it "mensagem que já existe não baixa de novo" do
      create(:chat_audio_message, chat: chat, message_id: message_id)

      run_job

      expect(a_request(:get, audio_url)).not_to have_been_made
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "não alcança conversa de outra organização" do
      run_job(organization_id: create(:organization).id)

      expect(a_request(:get, audio_url)).not_to have_been_made
    end

    it "conversa que não existe é ignorada" do
      expect {
        described_class.perform_now(BSON::ObjectId.new.to_s, organization.id, audio_url, message_id)
      }.not_to raise_error

      expect(a_request(:get, audio_url)).not_to have_been_made
    end
  end

  describe "o trecho do webhook" do
    it "usa o mediaUrl de dentro dele" do
      other_url = "https://bucket.exemplo.com/outro.ogg"
      stub_request(:get, other_url).to_return(status: 200, body: "outros-bytes")

      run_job(raw: { key: { id: message_id }, message: { mediaUrl: other_url } }.to_json)

      expect(blob_of(message).download).to eq("outros-bytes")
    end

    it "malformado, a URL recebida faz o papel dele" do
      run_job(raw: "não é json")

      expect(blob_of(message).download).to eq("bytes-do-audio")
    end
  end

  describe "arquivo temporário" do
    it "é apagado depois de guardado" do
      paths = track_downloaded_paths

      run_job

      expect(paths.size).to eq(1)
      expect(File.exist?(paths.first)).to be(false)
    end

    it "é apagado mesmo quando guardar falha" do
      paths = track_downloaded_paths
      allow(Media::Storage).to receive(:store_file).and_raise(StandardError, "disco cheio")

      run_job

      expect(paths.size).to eq(1)
      expect(File.exist?(paths.first)).to be(false)
    end
  end

  describe "falha" do
    def run_with_retries
      perform_enqueued_jobs(only: described_class) do
        described_class.perform_later(chat.id.to_s, organization.id, audio_url, message_id, false, "João")
      end
    end

    context "quando o download falha em todas as tentativas" do
      before { stub_request(:get, audio_url).to_return(status: 500, body: "fora do ar") }

      it "tenta 3 vezes" do
        run_with_retries

        expect(a_request(:get, audio_url)).to have_been_made.times(3)
      end

      it "vira uma nota de erro na conversa, uma só" do
        run_with_retries

        expect(notes_of(chat, "error").pluck(:content)).to eq([ "Chegou uma mídia que não foi possível baixar." ])
      end

      it "não grava mensagem nem chama os fluxos" do
        run_with_retries

        expect(messages_of(chat).count).to eq(0)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "registra o motivo no log" do
        allow(Rails.logger).to receive(:error)

        run_with_retries

        expect(Rails.logger).to have_received(:error).with(a_string_matching(/\[AudioMessageJob\].*chat=#{chat.id}/))
      end
    end

    it "se a segunda tentativa funciona, não fica nota" do
      stub_request(:get, audio_url)
        .to_return(status: 500)
        .then.to_return(status: 200, body: "bytes-do-audio")

      run_with_retries

      expect(message).to be_present
      expect(notes_of(chat, "error").count).to eq(0)
    end

    it "conversa apagada no meio das tentativas não levanta" do
      job = described_class.new(BSON::ObjectId.new.to_s, organization.id, audio_url, message_id)

      expect { job.register_failure(StandardError.new("boom")) }.not_to raise_error
    end
  end
end
