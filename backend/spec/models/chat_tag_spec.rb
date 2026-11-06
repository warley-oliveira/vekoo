require "rails_helper"

RSpec.describe ChatTag do
  let(:organization) { create(:organization) }
  let(:organization_id) { organization.id }

  describe "validações" do
    it "exige nome, cor e organização" do
      tag = described_class.new

      expect(tag).not_to be_valid
      expect(tag.errors.attribute_names).to include(:name, :color, :organization_id)
    end
  end

  describe "nome" do
    it "grava em forma de slug" do
      tag = described_class.create!(name: "Cliente Não Pagou", color: "#000000", organization_id: organization_id)

      expect(tag.name).to eq("cliente-nao-pagou")
    end
  end

  describe ".system_tag!" do
    it "cria a etiqueta com cor e descrição do sistema" do
      tag = described_class.system_tag!(:won, organization_id)

      expect(tag).to have_attributes(name: "ganho", color: "#2ecc71", description: "Ganho", organization_id: organization_id)
    end

    it "mantém o nome em slug nas etiquetas com acento" do
      expect(described_class.system_tag!(:no_show, organization_id).name).to eq("nao-compareceu")
    end

    it "não duplica ao chamar de novo" do
      first = described_class.system_tag!(:lost, organization_id)
      second = described_class.system_tag!(:lost, organization_id)

      expect(second.id).to eq(first.id)
      expect(described_class.where(name: "perdido", organization_id: organization_id).count).to eq(1)
    end

    it "reusa a etiqueta manual de mesmo nome sem trocar a cor" do
      manual = described_class.create!(name: "compareceu", color: "#123456", organization_id: organization_id)

      tag = described_class.system_tag!(:show, organization_id)

      expect(tag.id).to eq(manual.id)
      expect(tag.color).to eq("#123456")
    end

    it "é por organização" do
      described_class.system_tag!(:won, organization_id)
      described_class.system_tag!(:won, create(:organization).id)

      expect(described_class.where(name: "ganho").count).to eq(2)
    end

    it "aceita o id da organização em outro tipo" do
      expect(described_class.system_tag!(:won, organization.id.to_s).organization_id).to eq(organization.id.to_s)
    end

    it "levanta para chave desconhecida" do
      expect { described_class.system_tag!(:nope, organization_id) }.to raise_error(KeyError)
    end

    it "cobre a marca de profissional, que não entra em nenhum grupo" do
      expect(described_class.system_tag!(:professional, organization_id).name).to eq("profissional")
      expect(described_class::SYSTEM_TAG_GROUPS.values.flatten).not_to include(:professional)
    end
  end

  describe ".system_tag_names" do
    it "traduz as chaves para os slugs gravados" do
      expect(described_class.system_tag_names(%i[show no_show])).to eq(%w[compareceu nao-compareceu])
    end

    it "devolve vazio sem chaves" do
      expect(described_class.system_tag_names([])).to eq([])
    end

    it "levanta para chave desconhecida" do
      expect { described_class.system_tag_names(%i[nope]) }.to raise_error(KeyError)
    end
  end

  describe "#chats" do
    it "traz as conversas com a etiqueta, sem guardar lista na etiqueta" do
      tag = create(:chat_tag, organization_id: organization_id)
      tagged = create(:chat, organization: organization)
      tagged.add_to_set(chat_tag_ids: tag.id)
      create(:chat, organization: organization)

      expect(tag.chats.to_a).to eq([ tagged ])
    end

    it "não alcança conversa de outra organização" do
      tag = create(:chat_tag, organization_id: organization_id)
      foreign = create(:chat, organization: create(:organization))
      foreign.add_to_set(chat_tag_ids: tag.id)

      expect(tag.chats.to_a).to be_empty
    end
  end

  describe "ao apagar a etiqueta" do
    let(:tag) { create(:chat_tag, organization_id: organization_id) }
    let(:other_tag) { create(:chat_tag, organization_id: organization_id) }

    it "sai de todas as conversas, sem tocar nas outras etiquetas" do
      first = create(:chat, organization: organization)
      second = create(:chat, organization: organization)
      first.add_to_set(chat_tag_ids: [ tag.id, other_tag.id ])
      second.add_to_set(chat_tag_ids: tag.id)

      tag.destroy

      expect(first.reload.chat_tag_ids).to eq([ other_tag.id ])
      expect(second.reload.chat_tag_ids).to eq([])
    end

    it "não mexe em conversa que não tinha a etiqueta" do
      chat = create(:chat, organization: organization)
      chat.add_to_set(chat_tag_ids: other_tag.id)

      tag.destroy

      expect(chat.reload.chat_tag_ids).to eq([ other_tag.id ])
    end

    it "não dispara o evento da lista para cada conversa" do
      chat = create(:chat, organization: organization)
      chat.add_to_set(chat_tag_ids: tag.id)
      stream = ApplicationCable::Channel.organization_stream(organization_id, "chat-list")

      expect { tag.destroy }.not_to have_broadcasted_to(stream)
    end
  end
end
