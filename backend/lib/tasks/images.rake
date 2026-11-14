namespace :images do
  # Gera uma imagem direto no Vertex AI, fora do app (sem marca, sem crédito,
  # sem fila), e salva em disco — para validar credenciais, projeto, região e
  # modelo. Se `global` falhar, tenta `us-central1` e diz qual funcionou.
  #
  #   bin/rails images:smoke
  #   bin/rails images:smoke PROMPT="xícara de café numa mesa de madeira" OUT=tmp/cafe.png
  desc "Gera 1 imagem de teste no Vertex AI e salva em disco"
  task smoke: :environment do
    client = Ai::GeminiImage
    prompt = ENV.fetch("PROMPT", "Uma xícara de café sobre uma mesa de madeira clara, luz natural da manhã, foto realista.")
    out = Rails.root.join(ENV.fetch("OUT", "tmp/images-smoke.png"))

    puts "Vertex pedido:  #{client.vertex? ? 'sim' : 'NÃO (GOOGLE_GENAI_USE_VERTEXAI)'}"
    puts "Projeto:        #{client.project || 'FALTA (GOOGLE_CLOUD_PROJECT)'}"
    puts "Região:         #{client.location}"
    puts "Modelo:         #{client.model}"
    creds = client.credentials
    puts "Credenciais:    #{creds ? creds.class.name.demodulize : 'NÃO ACHEI — rode `gcloud auth application-default login`'}"
    abort "\nFaltou configuração — nada foi chamado." unless client.available?

    locations = [ client.location ]
    locations << "us-central1" if client.location == "global"
    locations.each do |location|
      ENV["GOOGLE_CLOUD_LOCATION"] = location
      print "\nGerando em #{location}… "
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      result = client.new.generate(prompt: prompt, aspect_ratio: "1:1")
      elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started

      FileUtils.mkdir_p(out.dirname)
      File.binwrite(out, result.image.data)
      puts "ok (#{elapsed.round(1)}s)"
      puts "Arquivo:        #{out} (#{result.image.mime_type}, #{(result.image.data.bytesize / 1024.0).round} KB)"
      puts "Modelo usado:   #{result.model}"
      puts "Tokens:         entrada #{result.usage[:input]} · saída #{result.usage[:output]}"
      puts "\nFuncionou só em #{location}: ponha GOOGLE_CLOUD_LOCATION=#{location} no .env." if location != locations.first
      break
    rescue Ai::GeminiImage::Failed, Ai::GeminiImage::Blocked, Ai::GeminiImage::MissingKey => e
      puts "falhou"
      puts "  #{e.class.name.demodulize}: #{e.message}"
      abort "\nNenhuma região funcionou." if location == locations.last
    end
  end
end
