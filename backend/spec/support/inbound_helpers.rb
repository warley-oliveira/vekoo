# Atalhos das specs de webhook de entrada (spec/services/inbound, spec/jobs). Inclua no
# `describe` que precisar: `include InboundHelpers`.
module InboundHelpers
  JSON_HEADERS = { "Content-Type" => "application/json" }.freeze

  # O caminho que entregamos ao provedor, com o token do conector (ver `Connector::Base#inbound_url`).
  def inbound_path(connector, route, *args)
    connector.inbound_url(route, *args).delete_prefix(Media::Storage.backend_url)
  end

  # O corpo do jeito que `Inbound::ProcessWebhookJob` entrega aos processadores.
  def webhook_payload(hash)
    JSON.parse(hash.to_json).with_indifferent_access
  end

  def stub_env(values)
    allow(ENV).to receive(:[]).and_call_original
    values.each { |name, value| allow(ENV).to receive(:[]).with(name).and_return(value) }
  end

  # Mídia da WABA em dois saltos: metadados e lookaside.fbsbx.com só atendem com o Bearer, e
  # o lookaside manda para a CDN assinada, que só atende SEM ele. Se o código mandar o
  # cabeçalho errado em qualquer salto, o stub não casa e o WebMock derruba a chamada.
  #
  # @return [Hash] as URLs de cada salto, para conferir com `a_request`
  def stub_waba_media(media_id, body: "bytes-da-midia", mime_type: "image/jpeg", file_size: nil, token: "token-da-meta")
    # Sem versão de propósito: o SDK monta `/<id>` com barra na frente e o Faraday descarta o
    # `/v19.0/` da URL base.
    metadata_url = "https://graph.facebook.com/#{media_id}"
    lookaside_url = "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=#{media_id}"
    cdn_url = "https://scontent.xx.fbcdn.net/v/t62/#{media_id}?oe=assinado"
    bearer = { "Authorization" => "Bearer #{token}" }

    stub_request(:get, metadata_url).with(headers: bearer).to_return(
      status: 200,
      headers: JSON_HEADERS,
      body: {
        id: media_id, messaging_product: "whatsapp", url: lookaside_url, mime_type: mime_type,
        sha256: "abc", file_size: file_size || body.bytesize
      }.to_json
    )
    stub_request(:get, lookaside_url).with(headers: bearer).to_return(status: 302, headers: { "Location" => cdn_url })
    stub_request(:get, cdn_url)
      .with { |request| !request.headers.key?("Authorization") }
      .to_return(status: 200, body: body)

    { metadata: metadata_url, lookaside: lookaside_url, cdn: cdn_url }
  end

  # O ffmpeg é um programa de fora, como o provedor é um serviço de fora: a spec controla o
  # que ele faz pondo outro executável na frente do PATH. Assim a conversão de áudio da WABA
  # dá o mesmo resultado com ou sem ffmpeg na máquina, e sem barulho no terminal.
  #
  # @param success [Boolean] false: sai com erro e não escreve nada
  def with_fake_ffmpeg(success: true)
    Dir.mktmpdir("fake-ffmpeg") do |dir|
      script = File.join(dir, "ffmpeg")
      File.write(script, success ? %(#!/bin/sh\nfor last; do :; done\necho convertido > "$last"\n) : "#!/bin/sh\nexit 1\n")
      File.chmod(0o755, script)

      original_path = ENV["PATH"]
      begin
        ENV["PATH"] = "#{dir}:#{original_path}"
        yield
      ensure
        ENV["PATH"] = original_path
      end
    end
  end

  # Anota os arquivos temporários que o download produziu, para a spec conferir que o job os
  # apagou. Olhar o conteúdo de tmp/ não serve: outras specs podem estar escrevendo lá.
  def track_downloaded_paths
    paths = []
    allow(Inbound::MediaDownload).to receive(:cleanup).and_wrap_original do |original, path|
      paths << path.to_s if path.present?
      original.call(path)
    end
    paths
  end

  def notes_of(chat, type = nil)
    scope = ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "base")
    type ? scope.where(role_base_type: type) : scope
  end

  def messages_of(chat)
    ChatMessage::Base.unscoped.where(chat_id: chat.id, :role.ne => "base")
  end

  def blob_of(message)
    ActiveStorage::Blob.find(message.media_blob_id)
  end
end
