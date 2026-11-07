require "rails_helper"

# A mídia recebida de um canal vem com o endereço escrito no corpo do webhook, e quem chama essas rotas
# não precisa de sessão. Baixando sem filtro, bastava forjar um webhook apontando para a rede interna:
# o servidor buscava o endereço e guardava a resposta como mídia da conversa, onde quem forjou lia.
RSpec.describe "SSRF por URL de mídia de provedor", type: :request do
  include ActiveJob::TestHelper

  INTERNAL_URL = "http://169.254.169.254/latest/meta-data/iam/security-credentials/app".freeze

  let(:organization) { create(:organization) }
  let!(:internal) { stub_request(:get, INTERNAL_URL).to_return(status: 200, body: "segredo-da-nuvem") }

  def media_blobs
    ActiveStorage::Blob.all.select { |blob| blob.download.include?("segredo") }
  end

  shared_examples "não busca o endereço interno" do
    it "não faz a requisição, e nada vira mídia" do
      begin
        action
      rescue StandardError
        nil # O motivo é de cada canal. O que importa é o que vem abaixo.
      end

      expect(internal).not_to have_been_requested
      expect(media_blobs).to be_empty
    end
  end

  describe "ponta a ponta: webhook forjado da Z-API direta" do
    let(:connector) { create(:connector_zapi, organization: organization) }

    it "a imagem que aponta para dentro não é baixada" do
      perform_enqueued_jobs do
        post connector.inbound_url(:zapi_message_received, connector.id).delete_prefix(Media::Storage.backend_url),
          params: { messageId: "FORJADA-1", phone: "5531971810932", image: { imageUrl: INTERNAL_URL, mimeType: "image/png" } },
          as: :json
      end

      expect(internal).not_to have_been_requested
      expect(media_blobs).to be_empty
      expect(ChatMessage::Media.where(message_id: "FORJADA-1").exists?).to be(false)
    end
  end

  describe "Connector::Zapi#download_media" do
    let(:action) { create(:connector_zapi, organization: organization).download_media(INTERNAL_URL) }

    it_behaves_like "não busca o endereço interno"
  end

  describe "Evolution: mediaUrl no trecho do webhook" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:action) { connector.retriever_media_message("M1", :image, false, { message: { mediaUrl: INTERNAL_URL } }) }

    it_behaves_like "não busca o endereço interno"
  end

  describe "WhatsApp Web pela Z-API" do
    let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization) }
    let(:action) { connector.retriever_media_message("M1", :image, false, { image: { imageUrl: INTERNAL_URL } }) }

    it_behaves_like "não busca o endereço interno"
  end

  describe "LeadChat: áudio recebido" do
    let(:connector) { create(:connector_lead_chat, organization: organization) }
    let(:action) { connector.retrieve_audio_message(INTERNAL_URL) }

    it_behaves_like "não busca o endereço interno"
  end

  describe "AIVA: mídia a enviar" do
    let(:connector) { create(:connector_whatsapp_web, :aiva, organization: organization) }
    let(:action) { connector.send_media_message("5531971810932", MediaMessageDto.new("image", "x.png", media_url: INTERNAL_URL)) }

    before { stub_request(:post, %r{/message/sendMediaFile/}).to_return(status: 200, body: {}.to_json) }

    it_behaves_like "não busca o endereço interno"
  end

  # A URL do cabeçalho vem de quem cria o modelo, e a resposta sobe para a Meta, onde dá para ver.
  describe "WhatsApp oficial: mídia do cabeçalho do modelo" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:action) { connector.upload_media_for_template(INTERNAL_URL) }

    it_behaves_like "não busca o endereço interno"
  end

  describe "redirecionamento para dentro" do
    let(:connector) { create(:connector_zapi, organization: organization) }

    it "um endereço público não leva o servidor até a rede interna" do
      stub_public_dns("cdn.exemplo.test")
      stub_request(:get, "https://cdn.exemplo.test/foto.png").to_return(status: 302, headers: { "Location" => INTERNAL_URL })

      expect(connector.download_media("https://cdn.exemplo.test/foto.png")).to be_nil
      expect(internal).not_to have_been_requested
    end
  end

  describe "mídia de verdade" do
    let(:connector) { create(:connector_zapi, organization: organization) }

    it "continua sendo baixada" do
      stub_public_dns("cdn.exemplo.test")
      stub_request(:get, "https://cdn.exemplo.test/foto.png").to_return(status: 200, body: "BYTES")

      path = connector.download_media("https://cdn.exemplo.test/foto.png")

      expect(File.binread(path)).to eq("BYTES")
    ensure
      FileUtils.rm_f(path) if path
    end
  end
end
