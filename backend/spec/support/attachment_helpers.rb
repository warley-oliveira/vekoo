# `Attachment` é do domínio inbox e ainda não existe aqui: `Media::AttachmentLookup` é o ponto
# único que encosta nele. Este dublê segue a interface documentada lá, para exercitar o
# caminho inteiro de quem cita um anexo. Quem precisa faz `include AttachmentHelpers`.
module AttachmentHelpers
  # @return [RSpec::Mocks::Double] o anexo, com um id novo a cada chamada
  def stub_attachment(name: "cardapio", filename: "cardapio.pdf", url: "https://cdn.exemplo.com/cardapio.pdf", blank: false)
    attachment_id = "anexo-#{SecureRandom.hex(4)}"
    blob = double("Blob", filename: ActiveStorage::Filename.new(filename))
    file = double("Arquivo", blob: blob, blank?: blank, download: "bytes do anexo")
    attachment = double("Attachment", id: attachment_id, name: name, file: file, file_url: url)
    scope = double("Attachment do escopo", available: [ attachment ])
    allow(scope).to receive(:find_by) { |id:| attachment if id.to_s == attachment_id }

    stub_const("Attachment", double("Attachment classe", where: scope, from_file_url: nil))
    allow(::Attachment).to receive(:find_by) { |id:| attachment if id.to_s == attachment_id }
    attachment
  end

  # MessageHandling baixa o anexo para tmp/ e o caminho fica no DTO: as specs limpam o que sobrou.
  def remove_attachment_downloads(*names)
    names.flatten.each do |name|
      Dir.glob(Rails.root.join("tmp", "*-*#{name}*")).each { |path| FileUtils.rm_f(path) }
    end
  end
end
