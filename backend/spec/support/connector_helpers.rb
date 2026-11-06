# Apoio às specs de conector. Não entra sozinho: quem precisa faz `include ConnectorHelpers`.
module ConnectorHelpers
  # Resposta de provedor para o WebMock, com o cabeçalho que faz o HTTParty ler o JSON.
  def json_reply(payload, status: 200)
    { status: status, body: payload.to_json, headers: { "Content-Type" => "application/json" } }
  end

  def with_env(vars)
    saved = vars.keys.to_h { |key| [ key, ENV[key] ] }
    vars.each { |key, value| ENV[key] = value }
    yield
  ensure
    saved&.each { |key, value| ENV[key] = value }
  end

  # Tudo que foi escrito em `Rails.logger` durante o bloco.
  def captured_log
    io = StringIO.new
    original = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(io)
    yield
    io.string
  ensure
    Rails.logger = original
  end

  # O documento como está no Mongo, sem passar pelos acessores do modelo.
  def stored_document(document)
    document.class.collection.find(_id: document.id).first
  end

  def media_dto(type = "image", name = "foto.jpg", caption: nil, url: "https://cdn.exemplo.com/foto.jpg", attachment: nil, attachment_id: nil)
    MediaMessageDto.new(type, name, attachment, attachment_id, caption, media_url: url)
  end

  # Arquivos que um download deixou em tmp/ não podem sobrar entre exemplos.
  def remove_file(path)
    File.delete(path) if path && File.exist?(path)
  end
end
