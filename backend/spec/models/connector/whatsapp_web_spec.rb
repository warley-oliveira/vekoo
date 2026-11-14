require "rails_helper"

# A fachada: escolha do provedor, callbacks, formatação e manutenção. O que cada provedor fala
# com a API dele está em whatsapp_web/providers/.
RSpec.describe Connector::WhatsappWeb do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:evolution) { create(:connector_whatsapp_web, organization: organization, instance_name: "WS-EVO") }
  let(:vekoo) { create(:connector_whatsapp_web, :vekoo, organization: organization, instance_name: "WS-VEKOO") }

  describe "escolha do provedor ao criar" do
    def create_connector(**attributes)
      described_class.create!(organization_id: organization.id, instance_name: "WS-1", **attributes)
    end

    it "fica com o padrão do modelo quando ninguém informa (na origem era vekoo_api; aqui, evolution_api)" do
      expect(create_connector.provider_api).to eq("evolution_api")
    end

    it "respeita o provedor explícito" do
      expect(create_connector(provider_api: "vekoo_api").provider_api).to eq("vekoo_api")
    end

    it "recusa um provedor que não existe" do
      connector = described_class.new(organization_id: organization.id, provider_api: "sumiu")

      expect(connector).not_to be_valid
      expect(connector.errors[:provider_api]).to be_present
    end

    it "lê o padrão do ambiente" do
      with_env("WHATSAPP_WEB_DEFAULT_PROVIDER" => "vekoo_api") do
        expect(create_connector.provider_api).to eq("vekoo_api")
      end
    end
  end

  describe "endereço e chave do provedor" do
    it "preenche base_url pelo provedor, a partir do ambiente" do
      with_env("EVOLUTION_API_URL" => "http://evo.interno", "WHATSAPP_API_URL" => "http://vekoo.interno") do
        expect(described_class.create!(organization_id: organization.id, provider_api: "evolution_api").base_url).to eq("http://evo.interno")
        expect(described_class.create!(organization_id: organization.id, provider_api: "vekoo_api").base_url).to eq("http://vekoo.interno")
      end
    end

    it "não troca uma base_url informada" do
      expect(described_class.create!(organization_id: organization.id, provider_api: "evolution_api", base_url: "http://meu.host").base_url).to eq("http://meu.host")
    end

    it "prefere a chave do conector à global do provedor" do
      with_env("EVOLUTION_API_KEY" => "global-evo") do
        expect(evolution.provider_api_key).to eq("chave-evolution")
        expect(described_class.new(provider_api: "evolution_api").provider_api_key).to eq("global-evo")
      end
    end

    it "usa WHATSAPP_API_KEY nos outros provedores" do
      with_env("WHATSAPP_API_KEY" => "global-vekoo") do
        expect(described_class.new(provider_api: "vekoo_api").provider_api_key).to eq("global-vekoo")
      end
    end

    it "manda a chave nos cabeçalhos de todo pedido" do
      expect(evolution.headers).to eq("Content-Type": "application/json", apikey: "chave-evolution")
    end
  end

  describe "tokens em repouso" do
    let(:connector) do
      create(:connector_whatsapp_web, organization: organization, api_key: "api-key-secreta", instance_api_key: "instancia-secreta")
    end

    it "guarda só o texto cifrado no Mongo" do
      raw = stored_document(connector)

      expect(raw.to_json).not_to include("api-key-secreta", "instancia-secreta")
      expect(raw.keys).to include("api_key_ciphertext", "instance_api_key_ciphertext")
      expect(raw.keys).not_to include("api_key", "instance_api_key")
    end

    it "devolve o valor original ao ler do banco" do
      loaded = Connector::Base.find(connector.id)

      expect(loaded).to have_attributes(api_key: "api-key-secreta", instance_api_key: "instancia-secreta")
    end
  end

  describe "#provider" do
    it "despacha para o módulo do provedor" do
      expect(evolution.provider).to eq(described_class::Providers::EvolutionApi)
      expect(vekoo.provider).to eq(described_class::Providers::VekooApi)
    end

    it "cai na Vekoo quando o provedor gravado não existe mais" do
      expect(described_class.new(provider_api: "sumiu").provider).to eq(described_class::Providers::VekooApi)
    end
  end

  describe "#evolution_provider?" do
    it "reconhece a Evolution" do
      expect(evolution.evolution_provider?).to be(true)
      expect(vekoo.evolution_provider?).to be(false)
    end
  end

  describe "#display_name" do
    it "prefere o nome do perfil" do
      expect(evolution.display_name).to eq("Loja da Ana")
    end

    it "cai no nome da instância" do
      expect(described_class.new(instance_name: "IWA-1").display_name).to eq("IWA-1")
    end

    it "e por fim no prefixo com o id" do
      connector = described_class.new

      expect(connector.display_name).to eq("IWA-#{connector.id}")
    end
  end

  describe "#number_formated" do
    it "devolve nil sem número" do
      expect(described_class.new.number_formated).to be_nil
    end

    it "formata fixo com 12 dígitos" do
      expect(described_class.new(number_id: "551133334444").number_formated).to eq("(11) 3333-4444")
    end

    it "formata celular com 13 dígitos" do
      expect(described_class.new(number_id: "5511999998888").number_formated).to eq("(11) 99999-8888")
    end

    it "devolve como veio o número fora do padrão brasileiro" do
      expect(described_class.new(number_id: "14155552671").number_formated).to eq("14155552671")
    end
  end

  describe "ao virar ativo" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization, instance_name: "WS-EVO", status: :pending, number_id: nil) }

    before do
      stub_request(:get, "http://evolution.test/instance/fetchInstances?instanceName=WS-EVO").to_return(
        json_reply([ { name: "WS-EVO", ownerJid: "5531971810932@s.whatsapp.net", profileName: "Ana", profilePicUrl: "https://x/ana.jpg" } ])
      )
    end

    it "busca o perfil no provedor e grava junto" do
      connector.update!(status: :active)

      expect(connector.reload).to have_attributes(number_id: "5531971810932", profile_name: "Ana", profile_picture_url: "https://x/ana.jpg")
    end

    it "traz as conversas de instâncias antigas do mesmo número" do
      old = create(:connector_whatsapp_web, organization: organization, status: :closed, number_id: "5531971810932")
      chat = create(:chat, connector: old)

      connector.update!(status: :active)

      expect(chat.reload.connector_id).to eq(connector.id)
    end

    it "não consulta o provedor em outras trocas de status" do
      connector.update!(status: :failed)

      expect(a_request(:get, /fetchInstances/)).not_to have_been_made
    end
  end

  describe "#send_text_message desconectado" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization, status: :closed) }

    it "registra not_connected, não chama o provedor e devolve nil" do
      expect(connector.send_text_message("5511999999999", "oi")).to be_nil

      expect(connector.errors[:not_connected]).to include("not connected")
      expect(a_request(:any, /evolution\.test/)).not_to have_been_made
    end
  end

  describe "áudio" do
    around { |example| with_env("BACKEND_URL" => "https://api.vekoo.test") { example.run } }

    let!(:send_audio) do
      stub_request(:post, "http://evolution.test/message/sendWhatsAppAudio/WS-EVO")
        .with(body: hash_including("audio" => "https://api.vekoo.test/rails/active_storage/blobs/proxy/abc/audio.ogg"))
        .to_return(json_reply({ key: { id: "AUD1" } }, status: 201))
    end

    it "#send_audio_message_by_url torna absoluto o caminho guardado na mensagem: é o provedor quem baixa" do
      evolution.send_audio_message_by_url("5531971810932", "/rails/active_storage/blobs/proxy/abc/audio.ogg")

      expect(send_audio).to have_been_requested
    end

    it "#send_audio_message manda a URL do DTO" do
      evolution.send_audio_message("5531971810932", media_dto("audio", "audio.ogg", url: "/rails/active_storage/blobs/proxy/abc/audio.ogg"))

      expect(send_audio).to have_been_requested
    end
  end

  describe "#retriever_media_message_with_payload" do
    it "repassa tipo, base64 e o payload do webhook ao provedor" do
      stub_request(:get, "https://bucket.exemplo.com/foto.jpg").to_return(status: 200, body: "BYTES")

      result = evolution.retriever_media_message_with_payload(
        "MID-1", msg_type: :image, base64: true, payload: { message: { mediaUrl: "https://bucket.exemplo.com/foto.jpg" } }
      )

      expect(result).to eq(Base64.strict_encode64("BYTES"))
    end
  end

  describe "#reload_instance" do
    it "não chama o provedor sem estar ativo" do
      connector = create(:connector_whatsapp_web, :vekoo, organization: organization, status: :inactive)

      expect(connector.reload_instance).to be_nil
      expect(a_request(:any, /vekoo\.test/)).not_to have_been_made
    end
  end

  describe "#logout_instance" do
    it "não chama o provedor sem estar ativo" do
      connector = create(:connector_whatsapp_web, :vekoo, organization: organization, status: :inactive)

      expect(connector.logout_instance).to be_nil
      expect(a_request(:any, /vekoo\.test/)).not_to have_been_made
    end
  end

  describe "#migrate_chats" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization, number_id: "5511999999999") }

    def sibling(status: :inactive, number_id: "5511999999999", owner: organization)
      create(:connector_whatsapp_web, organization: owner, status: status, number_id: number_id)
    end

    it "não faz nada sem número" do
      chat = create(:chat, connector: sibling)
      connector.number_id = nil

      connector.migrate_chats

      expect(chat.reload.connector_id).not_to eq(connector.id)
    end

    it "traz as conversas de instâncias inativas com o mesmo número" do
      chat = create(:chat, connector: sibling)

      connector.migrate_chats

      expect(chat.reload.connector_id).to eq(connector.id)
    end

    it "deixa onde estão as conversas de uma instância ativa" do
      chat = create(:chat, connector: sibling(status: :active))

      connector.migrate_chats

      expect(chat.reload.connector_id).not_to eq(connector.id)
    end

    it "deixa onde estão as conversas de outro número" do
      chat = create(:chat, connector: sibling(number_id: "5511888888888"))

      connector.migrate_chats

      expect(chat.reload.connector_id).not_to eq(connector.id)
    end

    it "nunca cruza organizações, mesmo com o mesmo número" do
      other_organization = create(:organization)
      chat = create(:chat, connector: sibling(owner: other_organization))

      connector.migrate_chats

      expect(chat.reload.connector_id).not_to eq(connector.id)
      expect(chat.reload.organization_id).to eq(other_organization.id)
    end
  end

  describe "#deduplicate_chats" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }

    # É um script de manutenção: narra o que faz no stdout.
    def deduplicate(narration = anything)
      expect { connector.deduplicate_chats }.to output(narration).to_stdout
    end

    it "tira o sufixo do JID de external_id" do
      chat = create(:chat, connector: connector, external_id: "5531971810932@s.whatsapp.net")

      deduplicate(/Found 1 chats with @s.whatsapp.net/)

      expect(chat.reload.external_id).to eq("5531971810932")
    end

    context "com a mesma pessoa em duas conversas" do
      let!(:oldest) do
        create(:chat, connector: connector, external_id: "5531971810932", created_at: 3.days.ago, user_name: "Maria",
                      last_message_at: 3.days.ago, last_message_content: "antiga", status: "closed")
      end
      let!(:newest) do
        create(:chat, connector: connector, external_id: "5531971810932@s.whatsapp.net", created_at: 1.day.ago, user_name: "Maria Souza",
                      last_message_at: 1.hour.ago, last_message_content: "recente", last_message_type: "image", external_lid: "123@lid",
                      profile_picture_url: "https://x/maria.jpg", status: "open")
      end

      it "fica só com a mais antiga e relata o que fez" do
        deduplicate(/Merged 1 duplicate groups, deleted 1 records/)

        expect(Chat.where(connector_id: connector.id).pluck(:id)).to eq([ oldest.id ])
      end

      it "traz para ela os dados mais novos da duplicata" do
        deduplicate

        expect(oldest.reload).to have_attributes(
          user_name: "Maria Souza", last_message_content: "recente", last_message_type: "image",
          external_lid: "123@lid", profile_picture_url: "https://x/maria.jpg", status: "open"
        )
        expect(oldest.reload.last_message_at).to be_within(1.second).of(newest.last_message_at)
      end

      it "move as mensagens em vez de apagá-las" do
        message = create(:chat_text_message, chat: newest, content: "não some")

        deduplicate

        expect(ChatMessage::Base.unscoped.where(chat_id: oldest.id, id: message.id).exists?).to be(true)
      end

      it "junta as etiquetas das duas" do
        tag_a = create(:chat_tag, organization_id: organization.id)
        tag_b = create(:chat_tag, organization_id: organization.id)
        oldest.add_to_set(chat_tag_ids: tag_a.id)
        newest.add_to_set(chat_tag_ids: tag_b.id)

        deduplicate

        expect(oldest.reload.chat_tag_ids).to contain_exactly(tag_a.id, tag_b.id)
      end

      it "não reabre a conversa quando a duplicata está fechada" do
        newest.set(status: "closed")
        oldest.set(status: "open")

        deduplicate

        expect(oldest.reload.status).to eq("open")
      end

      it "não recua last_message_at quando a duplicata é mais antiga" do
        oldest.set(last_message_at: 1.minute.ago)
        expected = oldest.reload.last_message_at
        newest.set(last_message_at: 2.days.ago)

        deduplicate

        expect(oldest.reload.last_message_at).to be_within(1.second).of(expected)
      end
    end

    it "não toca em outro conector da organização" do
      other = create(:chat, connector: create(:connector_whatsapp_web, organization: organization), external_id: "5531971810932@s.whatsapp.net")

      deduplicate

      expect(other.reload.external_id).to eq("5531971810932@s.whatsapp.net")
    end

    it "não junta pessoas diferentes" do
      create(:chat, connector: connector, external_id: "5531971810932")
      create(:chat, connector: connector, external_id: "5531971810933")

      deduplicate(/Found 0 duplicate groups/)

      expect(Chat.where(connector_id: connector.id).count).to eq(2)
    end
  end
end
