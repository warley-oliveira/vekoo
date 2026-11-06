require "rails_helper"

# Ponto único que este domínio toca em `Attachment`, do domínio inbox.
RSpec.describe Media::AttachmentLookup do
  include AttachmentHelpers

  context "sem o modelo de anexo" do
    before { hide_const("Attachment") if defined?(::Attachment) }

    it "não está disponível" do
      expect(described_class.available?).to be(false)
    end

    it "nada resolve" do
      expect(described_class.find("anexo-1", organization_id: "org-1")).to be_nil
      expect(described_class.from_file_url("https://cdn.exemplo.com/x.jpg")).to be_nil
      expect(described_class.available_for("org-1")).to eq([])
    end
  end

  context "com o modelo de anexo" do
    let!(:attachment) { stub_attachment }

    it "está disponível" do
      expect(described_class.available?).to be(true)
    end

    it ".find escopa pela organização" do
      expect(described_class.find(attachment.id, organization_id: "org-1")).to eq(attachment)
      expect(::Attachment).to have_received(:where).with(organization_id: "org-1")
    end

    it ".find sem organização busca direto, para o que já vem do próprio registro" do
      expect(described_class.find(attachment.id)).to eq(attachment)
      expect(::Attachment).not_to have_received(:where)
    end

    it ".find sem id devolve nil" do
      expect(described_class.find(nil)).to be_nil
    end

    it ".find de quem não existe devolve nil" do
      expect(described_class.find("nao-existe", organization_id: "org-1")).to be_nil
    end

    it ".from_file_url sem URL devolve nil" do
      expect(described_class.from_file_url("")).to be_nil
    end

    it ".from_file_url repassa a URL" do
      allow(::Attachment).to receive(:from_file_url).with("https://cdn.exemplo.com/x.jpg").and_return(attachment)

      expect(described_class.from_file_url("https://cdn.exemplo.com/x.jpg")).to eq(attachment)
    end

    it ".available_for lista os disponíveis da organização" do
      expect(described_class.available_for("org-1")).to eq([ attachment ])
      expect(::Attachment).to have_received(:where).with(organization_id: "org-1")
    end
  end
end
