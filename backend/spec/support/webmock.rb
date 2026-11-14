require "webmock/rspec"

# Spec nenhuma fala com provedor de verdade. Sem stub explícito, a chamada falha.
WebMock.disable_net_connect!(allow_localhost: false)

# A chave paga do `.env` de desenvolvimento não vale na suíte: com ela, o código toma outro caminho (embeddings, Whisper) e a
# spec cai no WebMock. Quem precisa de uma chave a declara (`stub_env`, `with_openai_key`).
%w[OPENAI_API_KEY OPENAI_ACCESS_TOKEN ANTHROPIC_API_KEY].each { |name| ENV.delete(name) }

# As peças baixam a fonte da marca do Google Fonts (`BrandFonts`). Na suíte a rede é fechada: por
# padrão a fonte "não está disponível", e o Pango cai na família do sistema, que é o comportamento
# documentado de falha. Global (sobrevive ao `WebMock.reset!`) porque a semente roda num
# `before(:all)`. Quem testa o download stuba `BrandFonts.fetch` (ver brand_fonts_spec.rb).
WebMock.globally_stub_request do |request|
  { status: 503 } if request.uri.host.to_s.match?(/\Afonts\.(googleapis|gstatic)\.com\z/)
end
