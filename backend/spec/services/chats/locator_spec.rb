require "rails_helper"

RSpec.describe Chats::Locator do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }

  def chat_with(external_id, **attributes)
    create(:chat, connector: connector, external_id: external_id, **attributes)
  end

  describe ".find" do
    it "acha pela forma exata" do
      chat = chat_with("5531971810932")

      expect(described_class.find(connector: connector, phone: "5531971810932")).to eq(chat)
    end

    # A Meta devolve `553171810932`, a base guarda `5531971810932`.
    it "acha sem o 9º dígito a conversa gravada com ele" do
      chat = chat_with("5531971810932")

      expect(described_class.find(connector: connector, phone: "553171810932")).to eq(chat)
    end

    it "acha com o 9º dígito a conversa gravada sem ele" do
      chat = chat_with("553171810932")

      expect(described_class.find(connector: connector, phone: "5531971810932")).to eq(chat)
    end

    it "acha a conversa gravada com o sufixo do JID" do
      chat = chat_with("5531971810932@s.whatsapp.net")

      expect(described_class.find(connector: connector, phone: "5531971810932")).to eq(chat)
    end

    it "aceita o número com o sufixo do JID" do
      chat = chat_with("5531971810932")

      expect(described_class.find(connector: connector, phone: "5531971810932@s.whatsapp.net")).to eq(chat)
    end

    it "aceita o número com máscara" do
      chat = chat_with("5531971810932")

      expect(described_class.find(connector: connector, phone: "+55 (31) 97181-0932")).to eq(chat)
    end

    it "não acha conversa de outro conector, mesmo da organização" do
      chat_with("5531971810932")
      other = create(:connector_whatsapp_cloud, organization: organization)

      expect(described_class.find(connector: other, phone: "5531971810932")).to be_nil
    end

    it "não acha outro número" do
      chat_with("5531971810932")

      expect(described_class.find(connector: connector, phone: "5531900000000")).to be_nil
    end

    it "devolve nil sem número" do
      expect(described_class.find(connector: connector, phone: nil)).to be_nil
      expect(described_class.find(connector: connector, phone: "")).to be_nil
    end

    it "com as duas formas gravadas, vale a conversa em uso" do
      chat_with("553171810932", last_message_at: 2.days.ago)
      recent = chat_with("5531971810932", last_message_at: 1.hour.ago)

      expect(described_class.find(connector: connector, phone: "553171810932")).to eq(recent)
    end

    describe "número de origem da WABA" do
      it "acha a conversa daquele número" do
        chat_with("5531971810932", sender_phone_number_id: 1000)
        own = chat_with("5531971810932", sender_phone_number_id: 2000)

        expect(described_class.find(connector: connector, phone: "5531971810932", sender_phone_number_id: 2000)).to eq(own)
      end

      it "aceita o número de origem como texto" do
        own = chat_with("5531971810932", sender_phone_number_id: 2000)

        expect(described_class.find(connector: connector, phone: "5531971810932", sender_phone_number_id: "2000")).to eq(own)
      end

      it "cai na conversa sem número de origem" do
        legacy = chat_with("5531971810932", sender_phone_number_id: nil)

        expect(described_class.find(connector: connector, phone: "5531971810932", sender_phone_number_id: 2000)).to eq(legacy)
      end

      it "não usa a conversa de outro número de origem" do
        chat_with("5531971810932", sender_phone_number_id: 1000)

        expect(described_class.find(connector: connector, phone: "5531971810932", sender_phone_number_id: 2000)).to be_nil
      end

      it "sem número de origem na busca, qualquer conversa serve" do
        any = chat_with("5531971810932", sender_phone_number_id: 1000)

        expect(described_class.find(connector: connector, phone: "5531971810932")).to eq(any)
      end
    end
  end

  describe ".find_or_create" do
    it "devolve a conversa que já existe, sem criar outra" do
      existing = chat_with("5531971810932")

      expect { expect(described_class.find_or_create(connector: connector, phone: "553171810932")).to eq(existing) }
        .not_to(change { Chat.count })
    end

    it "cria com o número em dígitos, no conector e na organização dele" do
      chat = described_class.find_or_create(connector: connector, phone: "5531971810932@s.whatsapp.net")

      expect(chat).to be_persisted
      expect(chat).to have_attributes(
        connector_id: connector.id,
        organization_id: organization.id,
        external_id: "5531971810932",
        sender_phone_number_id: nil,
        status: "open",
        automation_enabled: true
      )
    end

    it "guarda o número de origem" do
      chat = described_class.find_or_create(connector: connector, phone: "5531971810932", sender_phone_number_id: "2000")

      expect(chat.sender_phone_number_id).to eq(2000)
    end

    it "nasce com a automação conforme a organização" do
      organization.update!(settings: { "default_automation_enabled" => false })

      chat = described_class.find_or_create(connector: create(:connector_whatsapp_cloud, organization: organization.reload), phone: "5531971810932")

      expect(chat.automation_enabled).to be(false)
    end

    it "aplica os atributos, que só valem na criação" do
      chat = described_class.find_or_create(connector: connector, phone: "5531971810932", attributes: { user_name: "Maria", audience_type: "instagram" })

      expect(chat).to have_attributes(user_name: "Maria", audience_type: "instagram")
    end

    it "os atributos não mexem em conversa existente" do
      existing = chat_with("5531971810932", user_name: "Maria")

      described_class.find_or_create(connector: connector, phone: "5531971810932", attributes: { user_name: "Outro Nome" })

      expect(existing.reload.user_name).to eq("Maria")
    end

    it "os atributos podem trocar a automação padrão" do
      chat = described_class.find_or_create(connector: connector, phone: "5531971810932", attributes: { automation_enabled: false })

      expect(chat.automation_enabled).to be(false)
    end

    describe "trava de criação" do
      let(:phone) { "5531971810932" }
      let(:lock_key) { "chats.creation.#{connector.id}.#{phone}." }

      it "solta a trava depois de criar" do
        described_class.find_or_create(connector: connector, phone: phone)

        expect(Rails.cache.exist?(lock_key)).to be(false)
      end

      it "solta a trava mesmo quando a criação quebra" do
        attributes = { status: "invalido" }

        expect { described_class.find_or_create(connector: connector, phone: phone, attributes: attributes) }
          .to raise_error(Mongoid::Errors::Validations)

        expect(Rails.cache.exist?(lock_key)).to be(false)
      end

      # Uma rajada de mensagens do mesmo contato novo: dois webhooks chegando juntos.
      it "quem perde a trava espera a conversa do outro aparecer" do
        Rails.cache.write(lock_key, true)
        locator = described_class.new(connector, phone)
        created_by_other = nil
        allow(described_class).to receive(:sleep) { created_by_other ||= chat_with(phone) }

        expect { expect(locator.find_or_create).to eq(created_by_other) }.to change { Chat.count }.by(1)
      end

      it "se o outro nunca termina, cria mesmo assim" do
        Rails.cache.write(lock_key, true)
        locator = described_class.new(connector, phone)
        allow(described_class).to receive(:sleep)

        chat = locator.find_or_create

        expect(chat).to be_persisted
        expect(described_class).to have_received(:sleep).exactly(described_class::CREATION_WAIT_ATTEMPTS).times
      end

      it "a trava é por conector" do
        other = create(:connector_whatsapp_cloud, organization: organization)
        Rails.cache.write(lock_key, true)

        expect(described_class.find_or_create(connector: other, phone: phone)).to be_persisted
      end

      it "a trava de um número não segura outro" do
        Rails.cache.write(lock_key, true)

        expect(described_class.find_or_create(connector: connector, phone: "5531900000000")).to be_persisted
      end

      it "a trava é por número de origem" do
        Rails.cache.write(lock_key, true)

        expect(described_class.find_or_create(connector: connector, phone: phone, sender_phone_number_id: 2000)).to be_persisted
      end
    end
  end
  # Para quem identifica o contato por outra coisa que não telefone (Messenger, Instagram, @lid).
  describe ".create_once" do
    it "procura de novo dentro da trava antes de criar" do
      calls = 0

      result = described_class.create_once("x", find: -> { :achou }) { calls += 1 }

      expect(result).to eq(:achou)
      expect(calls).to eq(0)
    end

    it "cria quando não há e solta a trava" do
      expect(described_class.create_once("x", find: -> { nil }) { :criou }).to eq(:criou)
      expect(Rails.cache.exist?("chats.creation.x")).to be(false)
    end

    it "quem perde a trava espera o outro terminar, sem criar" do
      Rails.cache.write("chats.creation.x", true)
      finished = false
      allow(described_class).to receive(:sleep) { finished = true }
      created = false

      result = described_class.create_once("x", find: -> { finished ? :do_outro : nil }) { created = true }

      expect(result).to eq(:do_outro)
      expect(created).to be(false)
    end
  end
end
