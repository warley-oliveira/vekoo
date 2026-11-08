require "webmock/rspec"

# Spec nenhuma fala com provedor de verdade. Sem stub explícito, a chamada falha.
WebMock.disable_net_connect!(allow_localhost: false)

# A chave paga do `.env` de desenvolvimento não vale na suíte: com ela, o código toma outro caminho (embeddings, Whisper) e a
# spec cai no WebMock. Quem precisa de uma chave a declara (`stub_env`, `with_openai_key`).
%w[OPENAI_API_KEY OPENAI_ACCESS_TOKEN].each { |name| ENV.delete(name) }
