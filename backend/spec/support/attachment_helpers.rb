# `Attachment` é do domínio inbox e ainda não existe aqui: `Media::AttachmentLookup` é o ponto
# único que encosta nele. Este dublê segue a interface documentada lá, para exercitar o
# caminho inteiro de quem cita um anexo. Quem precisa faz `include AttachmentHelpers`.
module AttachmentHelpers
  def self.included(group)
    # MessageHandling baixa o anexo para tmp/ e deixa o caminho no DTO.
    group.after { attachment_downloads.each { |path| FileUtils.rm_f(path) } }
  end

  # @return [RSpec::Mocks::Double] o anexo, com um id novo a cada chamada
  def stub_attachment(name: "cardapio", filename: "cardapio.pdf", url: "https://cdn.exemplo.com/cardapio.pdf", blank: false)
    blob = double("Blob", filename: ActiveStorage::Filename.new(filename))
    file = double("Arquivo", blob: blob, blank?: blank, download: "bytes do anexo")
    attachment = double("Attachment", id: "anexo-#{SecureRandom.hex(4)}", name: name, file: file, file_url: url)

    stub_attachment_model if stubbed_attachments.empty?
    stubbed_attachments[attachment.id] = attachment
  end

  def stubbed_attachments
    @stubbed_attachments ||= {}
  end

  def attachment_downloads
    @attachment_downloads ||= []
  end

  private

  def stub_attachment_model
    find_attachment = ->(id:) { stubbed_attachments[id.to_s] }

    scope = double("Attachment da organização")
    allow(scope).to receive(:find_by, &find_attachment)
    allow(scope).to receive(:available) { stubbed_attachments.values }

    model = double("Attachment classe", where: scope, from_file_url: nil)
    allow(model).to receive(:find_by, &find_attachment)
    stub_const("Attachment", model)

    allow(File).to receive(:binwrite).and_wrap_original do |original, path, *rest|
      attachment_downloads << path.to_s
      original.call(path, *rest)
    end
  end
end
