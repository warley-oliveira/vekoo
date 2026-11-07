require "rails_helper"

# Na origem este job também descrevia a imagem por LLM e gerava a resposta do assistente; o que
# ficou é baixar, guardar, gravar a mensagem e seguir para `Chats::InboundFlow`. A origem não
# tinha spec dele. O download de cada canal fica em spec/services/inbound/media_download_spec.rb.
RSpec.describe ImageMessageJob do
  before { stub_every_host_as_public }

  include ActiveJob::TestHelper
  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }
  let(:media_url) { "https://bucket.exemplo.com/arquivo" }
  let(:message_id) { "M1" }
  let(:raw_json) { { key: { id: message_id }, message: { mediaUrl: media_url } }.to_json }

  before do
    allow(Flows::InboundDispatcher).to receive(:call)
    stub_request(:get, media_url).to_return(status: 200, body: "bytes-do-arquivo")
  end

  def run_job(properties = { mimetype: "image", caption: "Olha isso" }, id: message_id, from_me: false, on_chat: chat, organization_id: organization.id, raw: raw_json)
    described_class.perform_now(on_chat.id.to_s, organization_id, media_url, id, from_me, properties.is_a?(String) ? properties : properties.to_json, raw)
  end

  def message(id = message_id)
    ChatMessage::Base.unscoped.where(chat_id: chat.id, message_id: id).take
  end

  it "roda na fila critical" do
    expect(described_class.new.queue_name).to eq("critical")
  end

  describe "imagem ou mídia" do
    [ "image", "image/jpeg" ].each do |mime|
      it "#{mime} vira imagem" do
        run_job({ mimetype: mime })

        expect(message).to be_a(ChatMessage::Image)
      end
    end

    it "aceita o tipo em mime_type, como a WABA manda" do
      run_job({ mime_type: "image/jpeg" })

      expect(message).to be_a(ChatMessage::Image)
    end

    [ "image/png", "image/webp", "application/pdf", "video/mp4", "video" ].each do |mime|
      it "#{mime} vira mídia, com o tipo em media_type" do
        run_job({ mimetype: mime })

        expect(message).to be_a(ChatMessage::Media)
        expect(message.media_type).to eq(mime)
      end
    end

    it "sem tipo nenhum, vira mídia" do
      run_job({})

      expect(message).to be_a(ChatMessage::Media)
    end
  end

  describe "a mensagem" do
    it "imagem guarda o caminho proxy, a legenda e o blob" do
      run_job

      expect(message).to have_attributes(
        role: "user",
        message_origin: "platform",
        content: "Olha isso",
        caption: "Olha isso",
        image_url: start_with("/rails/active_storage/blobs/proxy/")
      )
      expect(blob_of(message).download).to eq("bytes-do-arquivo")
    end

    it "mídia guarda o caminho proxy e só as propriedades que interessam" do
      run_job({
        mimetype: "video/mp4", caption: "Veja", url: "https://cdn/enc", mediaKey: "segredo", seconds: 12, width: 640, height: 480, fileLength: "2048"
      })

      expect(message).to have_attributes(content: "Veja", caption: "Veja", media_url: start_with("/rails/active_storage/blobs/proxy/"))
      expect(message.media_properties).to eq("seconds" => 12, "width" => 640, "height" => 480, "fileLength" => "2048")
    end

    it "sem legenda, o conteúdo fica vazio" do
      run_job({ mimetype: "image" })

      expect(message).to have_attributes(content: "", caption: nil)
    end
  end

  describe "o arquivo guardado" do
    it "usa o nome original" do
      run_job({ mimetype: "application/pdf", fileName: "orçamento final.pdf" })

      expect(blob_of(message).filename.to_s).to eq(ActiveStorage::Filename.new("orçamento final.pdf").to_s)
    end

    it "sem nome, usa o id da mensagem e a extensão pedida" do
      run_job({ mimetype: "video", extension: "mp4" })

      expect(blob_of(message).filename.to_s).to eq("M1.mp4")
    end

    it "sem nome nem extensão pedida, usa a extensão do que foi baixado" do
      run_job({ mimetype: "image" })

      expect(blob_of(message).filename.to_s).to eq("M1.jpg")
    end

    it "sem id de mensagem, inventa um nome" do
      run_job({ mimetype: "image" }, id: nil)

      expect(blob_of(ChatMessage::Image.where(chat_id: chat.id).take).filename.to_s).to match(/\A\h{16}\.jpg\z/)
    end

    it "grava o tipo real que o provedor informou" do
      run_job({ mimetype: "application/pdf", fileName: "a.pdf" })

      expect(blob_of(message).content_type).to eq("application/pdf")
    end

    it "com `image` genérico, identifica o tipo pelo conteúdo" do
      stub_request(:get, media_url).to_return(status: 200, body: file_fixture("foto.png").binread)

      run_job({ mimetype: "image" })

      expect(blob_of(message).content_type).to eq("image/png")
    end
  end

  describe "depois de gravar" do
    it "entrega a legenda aos fluxos como primeira mensagem" do
      run_job

      expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat, text: "Olha isso", event: "first_message", message_id: "M1")
    end

    it "sem legenda, entrega texto vazio" do
      run_job({ mimetype: "image" })

      expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(text: ""))
    end

    it "com mensagem anterior, o evento é message_received" do
      create(:chat_text_message, chat: chat)

      run_job

      expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "message_received"))
    end

    it "nota não conta como mensagem anterior" do
      create(:chat_text_message, chat: chat, role: "base", role_base_type: "instagram-ad-greeting")

      run_job

      expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "first_message"))
    end

    it "atualiza a prévia e conta como não lida" do
      run_job

      expect(chat.reload).to have_attributes(last_message_type: "image", last_message_by: "user", last_message_content: "Olha isso", unread_messages: 1)
    end

    it "com a automação desligada, grava e conta como não lida, sem chamar os fluxos" do
      chat.set(automation_enabled: false)

      run_job

      expect(message).to be_present
      expect(chat.reload.unread_messages).to eq(1)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "transmite para a conversa" do
      expect { run_job }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
    end
  end

  describe "mídia nossa, de outro aparelho" do
    before { chat.set(unread_messages: 3) }

    it "imagem entra como nossa" do
      run_job(from_me: true)

      expect(message).to have_attributes(role: "assistant", message_origin: "user", caption: "Olha isso")
    end

    it "mídia entra como nossa" do
      run_job({ mimetype: "application/pdf", fileName: "a.pdf" }, from_me: true)

      expect(message).to have_attributes(role: "assistant", message_origin: "user", media_type: "application/pdf")
    end

    it "pausa a automação, zera as não lidas e não chama os fluxos" do
      run_job(from_me: true)

      expect(chat.reload).to have_attributes(automation_enabled: false, unread_messages: 0, last_message_by: "assistant")
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "agenda a volta da automação pelo período da organização" do
      organization.update!(settings: { "automation_pause_period" => "minutes", "automation_pause_time_to" => 15 })

      expect { run_job(from_me: true) }.to have_enqueued_job(EnableContactJob)
    end
  end

  describe "o que não processa" do
    it "mensagem que já existe não baixa de novo" do
      create(:chat_image_message, chat: chat, message_id: message_id)

      run_job

      expect(a_request(:get, media_url)).not_to have_been_made
      expect(messages_of(chat).count).to eq(1)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "vale também para mensagem fora do default_scope" do
      create(:chat_image_message, chat: chat, message_id: message_id, active: false)

      run_job

      expect(a_request(:get, media_url)).not_to have_been_made
    end

    it "não alcança conversa de outra organização" do
      run_job(organization_id: create(:organization).id)

      expect(a_request(:get, media_url)).not_to have_been_made
      expect(messages_of(chat).count).to eq(0)
    end

    it "conversa que não existe é ignorada" do
      expect {
        described_class.perform_now(BSON::ObjectId.new.to_s, organization.id, media_url, message_id, false, "{}")
      }.not_to raise_error

      expect(a_request(:get, media_url)).not_to have_been_made
    end
  end

  describe "propriedades malformadas" do
    [ "não é json", "[1, 2]", "" ].each do |json|
      it "#{json.inspect} não impede de gravar" do
        run_job(json)

        expect(message).to be_a(ChatMessage::Media)
        expect(blob_of(message).download).to eq("bytes-do-arquivo")
      end
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
    def run_with_retries(id: message_id)
      perform_enqueued_jobs(only: described_class) do
        described_class.perform_later(chat.id.to_s, organization.id, media_url, id, false, { mimetype: "image" }.to_json, raw_json)
      end
    end

    context "quando o download falha em todas as tentativas" do
      before { stub_request(:get, media_url).to_return(status: 500, body: "fora do ar") }

      it "tenta 3 vezes" do
        run_with_retries

        expect(a_request(:get, media_url)).to have_been_made.times(3)
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

        expect(Rails.logger).to have_received(:error).with(a_string_matching(/\[ImageMessageJob\].*chat=#{chat.id}/))
      end

      it "a nota não vira a última mensagem da lista" do
        chat.set(last_message_content: "anterior")

        run_with_retries

        expect(chat.reload.last_message_content).to eq("anterior")
      end
    end

    it "se a segunda tentativa funciona, não fica nota" do
      stub_request(:get, media_url)
        .to_return(status: 500)
        .then.to_return(status: 200, body: "bytes-do-arquivo")

      run_with_retries

      expect(message).to be_a(ChatMessage::Image)
      expect(notes_of(chat, "error").count).to eq(0)
    end

    it "provedor que devolve caminho nenhum também conta como falha" do
      allow(Inbound::MediaDownload).to receive(:media).and_return(Inbound::MediaDownload::Result.new(path: nil))

      perform_enqueued_jobs(only: described_class) do
        described_class.perform_later(chat.id.to_s, organization.id, media_url, message_id, false, { mimetype: "image" }.to_json)
      end

      expect(notes_of(chat, "error").count).to eq(1)
    end

    it "conversa apagada no meio das tentativas não levanta" do
      stub_request(:get, media_url).to_return(status: 500)

      job = described_class.new(BSON::ObjectId.new.to_s, organization.id, media_url, message_id)

      expect { job.register_failure(StandardError.new("boom")) }.not_to raise_error
    end
  end
end
