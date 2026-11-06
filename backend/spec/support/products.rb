# Atalhos das specs do catálogo: a chave da OpenAI, a API de embeddings e a planilha.
module ProductsSpecHelpers
  EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings".freeze

  # O catálogo muda de comportamento com a chave, e o `.env` de quem roda a suíte pode
  # tê-la. Por isso nenhuma spec que dependa disso confia no ambiente.
  def with_openai_key(key)
    original = ENV["OPENAI_API_KEY"]
    ENV["OPENAI_API_KEY"] = key
    yield
  ensure
    ENV["OPENAI_API_KEY"] = original
  end

  # Vetor de 512 posições com a direção concentrada em `axis`: basta para o cosseno
  # distinguir um item do outro, sem depender de modelo nenhum.
  def embedding_vector(axis = 0)
    Array.new(Products::Embedder::DIMENSIONS, 0.0).tap { |vector| vector[axis] = 1.0 }
  end

  # Responde qualquer lote com um vetor por entrada, como a API de verdade.
  def stub_openai_embeddings(axis: 0)
    stub_request(:post, EMBEDDINGS_URL).to_return do |request|
      inputs = Array(JSON.parse(request.body)["input"])
      body = {
        data: inputs.each_with_index.map { |_, index| { index: index, embedding: embedding_vector(axis) } }
      }
      { status: 200, body: body.to_json, headers: { "Content-Type" => "application/json" } }
    end
  end

  def csv_tempfile(content, name = "catalogo.csv")
    Tempfile.new([ File.basename(name, ".*"), File.extname(name) ], binmode: true).tap do |file|
      file.write(content.b)
      file.flush
      file.rewind
      (@csv_tempfiles ||= []) << file
    end
  end

  def csv_upload(content, name = "catalogo.csv", type = "text/csv")
    Rack::Test::UploadedFile.new(csv_tempfile(content, name).path, type, original_filename: name)
  end

  # Importação pronta para o job: arquivo anexado e mapeamento escolhido.
  def create_import(organization, content, mapping:, options: {}, **attributes)
    import = Products::Import.new(
      { organization: organization, status: "ready", filename: "catalogo.csv", delimiter: ",",
        mapping: mapping, options: options }.merge(attributes)
    )
    import.file.attach(io: StringIO.new(content), filename: "catalogo.csv", content_type: "text/csv")
    import.save!
    import
  end
end

RSpec.configure do |config|
  config.include ProductsSpecHelpers
  config.after { Array(@csv_tempfiles).each(&:close!) }
end
