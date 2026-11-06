require "rails_helper"

RSpec.describe Chats::MessageText do
  def message(kind, content)
    instance_double(ChatMessage::Base, content: content, type_element: kind)
  end

  describe ".for" do
    it "devolve o texto como está" do
      expect(described_class.for(message("text", "Quero a bolsa"))).to eq("Quero a bolsa")
    end

    # O "-" do áudio sem transcrição, entregue cru, fez o copiloto dizer que a pessoa "respondeu só -".
    it "troca o traço do áudio sem transcrição por um rótulo" do
      expect(described_class.for(message("audio", "-"))).to eq("[áudio sem transcrição]")
    end

    it "marca o áudio transcrito" do
      expect(described_class.for(message("audio", "Pode separar"))).to eq("[áudio] Pode separar")
    end

    it "diz que há uma imagem, com ou sem legenda" do
      expect(described_class.for(message("image", ""))).to eq("[imagem sem legenda]")
      expect(described_class.for(message("image", "É essa aqui"))).to eq("[imagem] É essa aqui")
    end

    it "diz que há um arquivo" do
      expect(described_class.for(message("media", nil))).to eq("[arquivo sem legenda]")
      expect(described_class.for(message("media", "Tabela de atacado"))).to eq("[arquivo] Tabela de atacado")
    end

    it "respeita o limite" do
      expect(described_class.for(message("text", "x" * 50), limit: 10)).to eq("x" * 10)
    end

    it "fala o idioma da requisição" do
      I18n.with_locale(:en) do
        expect(described_class.for(message("audio", "-"))).to eq("[audio without transcript]")
      end
    end
  end

  describe ".preview" do
    it "usa o tipo que a conversa guardou" do
      expect(described_class.preview("-", "audio")).to eq("[áudio sem transcrição]")
      expect(described_class.preview("Oi", "text")).to eq("Oi")
    end

    # A conversa que nasceu antes de `last_message_type` existir não sabe o tipo.
    it "não inventa o tipo quando a conversa não sabe" do
      expect(described_class.preview("-", nil)).to eq("[mensagem sem texto]")
      expect(described_class.preview("Oi", nil)).to eq("Oi")
    end

    it "limita a prévia" do
      expect(described_class.preview("x" * 300, "text").size).to eq(200)
    end
  end
end
