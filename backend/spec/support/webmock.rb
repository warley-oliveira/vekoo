require "webmock/rspec"

# Spec nenhuma fala com provedor de verdade. Sem stub explícito, a chamada falha.
WebMock.disable_net_connect!(allow_localhost: false)
