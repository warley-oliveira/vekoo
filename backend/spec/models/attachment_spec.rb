# frozen_string_literal: true

require "rails_helper"

RSpec.describe Attachment, type: :model do
  let(:organization) { create(:organization) }
  let(:attachment) { create(:attachment, organization: organization) }

  describe ".from_file_url" do
    subject(:found) { described_class.from_file_url(url) }

    context "com o caminho guardado na mensagem" do
      let(:url) { attachment.file_url }

      it "acha o anexo" do
        expect(found).to eq(attachment)
      end
    end

    context "com a URL absoluta do Active Storage" do
      let(:url) { "http://localhost:3000/rails/active_storage/blobs/redirect/#{attachment.file.signed_id}/tabela.pdf" }

      it "acha o anexo" do
        expect(found).to eq(attachment)
      end
    end

    context "com a chave do blob na ponta da URL" do
      let(:url) { "https://cdn.exemplo.com/#{attachment.file.key}" }

      it "acha o anexo" do
        expect(found).to eq(attachment)
      end
    end

    context "com uma URL que não é de ninguém" do
      let(:url) { "https://cdn.exemplo.com/nao-existe" }

      it "devolve nil" do
        expect(found).to be_nil
      end
    end

    context "com uma URL malformada" do
      let(:url) { "isto não é uma url" }

      it "devolve nil" do
        expect(found).to be_nil
      end
    end

    context "com assinatura adulterada" do
      let(:url) { "/rails/active_storage/blobs/redirect/adulterada/tabela.pdf" }

      it "devolve nil" do
        expect(found).to be_nil
      end
    end

    context "sem URL" do
      let(:url) { nil }

      it "devolve nil" do
        expect(found).to be_nil
      end
    end
  end

  describe "#media_type" do
    def attachment_named(filename)
      build(:attachment, organization: organization).tap do |record|
        record.file.attach(io: StringIO.new("x"), filename: filename, content_type: "application/octet-stream")
      end
    end

    it "decide pelo nome do arquivo" do
      expect(attachment_named("foto.JPG").media_type).to eq("image")
      expect(attachment_named("video.mp4").media_type).to eq("video")
      expect(attachment_named("audio.ogg").media_type).to eq("audio")
      expect(attachment_named("tabela.pdf").media_type).to eq("document")
    end
  end

  # A interface que o núcleo deixou esperando.
  describe "Media::AttachmentLookup" do
    it "diz que está disponível" do
      expect(Media::AttachmentLookup.available?).to be(true)
    end

    it "acha por id dentro da organização, e não em outra" do
      expect(Media::AttachmentLookup.find(attachment.id, organization_id: organization.id)).to eq(attachment)
      expect(Media::AttachmentLookup.find(attachment.id, organization_id: create(:organization).id)).to be_nil
    end

    it "não estoura com id que não é UUID" do
      expect(Media::AttachmentLookup.find("123", organization_id: organization.id)).to be_nil
    end

    it "acha pela URL" do
      expect(Media::AttachmentLookup.from_file_url(attachment.file_url)).to eq(attachment)
    end

    it "lista só os da galeria da organização" do
      attachment
      create(:attachment, organization: organization, private: true)
      create(:attachment)

      expect(Media::AttachmentLookup.available_for(organization.id)).to contain_exactly(attachment)
    end
  end

  # O caminho inteiro de quem cita um anexo, agora com o modelo de verdade.
  describe "citado em uma mensagem" do
    let(:organization_attachment) { create(:attachment, organization: organization, name: "Tabela de preços") }

    it "vira mídia pelo id, com a URL absoluta para o provedor" do
      parts = MessageHandling.new(organization).perform("attachment_id_#{organization_attachment.id}")

      dto = parts.first
      expect(dto).to be_a(MediaMessageDto)
      expect(dto.media_type).to eq("document")
      expect(dto.attachment_id).to eq(organization_attachment.id)
      expect(dto.stored_url).to eq(organization_attachment.file_url)
      expect(dto.media_url).to start_with("http")
    ensure
      FileUtils.rm_f(parts&.first&.attachment) if parts&.first.respond_to?(:attachment)
    end

    it "não acha anexo de outra organização" do
      foreign = create(:attachment)

      expect {
        MessageHandling.new(organization).perform("attachment_id_#{foreign.id}")
      }.to raise_error(AttachmentNotFoundException)
    end
  end
end
