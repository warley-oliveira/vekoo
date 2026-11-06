require "rails_helper"

RSpec.describe Contact do
  let(:organization) { create(:organization) }

  describe ".from_chat" do
    let(:chat) do
      create(
        :chat,
        organization: organization,
        external_id: "5531971810932@s.whatsapp.net",
        user_name: "Maria Souza",
        profile_picture_url: "https://cdn.exemplo.com/maria.jpg"
      )
    end

    it "vê a conversa como pessoa" do
      expect(described_class.from_chat(chat)).to have_attributes(
        id: "5531971810932@s.whatsapp.net",
        external_id: "5531971810932@s.whatsapp.net",
        name: "Maria Souza",
        phone: "5531971810932",
        profile_picture_url: "https://cdn.exemplo.com/maria.jpg"
      )
    end

    it "prefere o nome que a equipe deu ao que veio do canal" do
      chat.set(display_name: "Maria da Padaria")

      expect(described_class.from_chat(chat).name).to eq("Maria da Padaria")
    end

    it "ignora nome de exibição em branco" do
      chat.set(display_name: "")

      expect(described_class.from_chat(chat).name).to eq("Maria Souza")
    end

    it "não é uma coleção: nada vai para o banco" do
      chat

      expect { described_class.from_chat(chat) }.not_to(change { Mongoid.default_client.database.collection_names.sort })
      expect(described_class).not_to include(Mongoid::Document)
    end
  end

  it "é o que chat.contact devolve" do
    chat = create(:chat, organization: organization, user_name: "João")

    expect(chat.contact.name).to eq("João")
  end
end
