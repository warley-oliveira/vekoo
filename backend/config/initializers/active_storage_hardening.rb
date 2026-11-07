# O que dá para fechar no Active Storage sem subir a versão do Rails. Quem sobe resolve na raiz, e estas
# linhas continuam sem atrapalhar: ver "Dependências" no relatório da revisão de segurança.
#
# 1. CVE-2026-66066 (CVSS 9.5): o libvips escolhe o leitor pelo conteúdo do arquivo, e vários não foram feitos
#    para receber arquivo de fora. Basta anexar para o arquivo ser lido, e o resultado pode ser ler qualquer
#    arquivo do servidor, inclusive o ambiente do processo. Exige libvips 8.13 ou mais novo: a imagem de produção
#    tem, e o Rails corrigido também se recusa a subir sem. Sem ele em produção, é melhor não subir.
begin
  require "nokogiri" # Antes do libvips, que usa a mesma libxml2.
  require "ruby-vips"
rescue LoadError => e
  Rails.logger&.warn("[ActiveStorage] libvips indisponível: #{e.message}")
end

if defined?(Vips)
  if Vips.respond_to?(:block_untrusted)
    Vips.block_untrusted(true)
  elsif Rails.env.production?
    raise "libvips 8.13 ou mais novo é obrigatório: sem ele, os leitores não testados ficam ligados para arquivo enviado por qualquer pessoa"
  end
end

# 2. GHSA-v924-7rp8-4mxh e GHSA-3f4q-8x5m-76v8: anexar um arquivo roda o `ffprobe` nele, e o nome e o tipo
#    declarados escolhem o que ele abre. Uma playlist enviada como áudio lê arquivo do servidor. Nada aqui lê
#    duração nem gera prévia de vídeo: sai enquanto a versão não sobe, e antes de o ffmpeg entrar na imagem.
Rails.application.config.active_storage.analyzers -= [
  ActiveStorage::Analyzer::VideoAnalyzer,
  ActiveStorage::Analyzer::AudioAnalyzer
]
Rails.application.config.active_storage.previewers -= [ ActiveStorage::Previewer::VideoPreviewer ]
