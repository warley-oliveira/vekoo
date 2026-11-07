# `reconnect_attempts`, em config/cable.yml, é para o Listener: é ele que escuta e precisa voltar sozinho quando o Redis volta. O
# adaptador passa as mesmas opções ao cliente Redis, e em quem transmite isso seria ruim: cada `broadcast`, numa thread do Puma ou do
# Sidekiq, ficaria dormindo a lista inteira enquanto o Redis estivesse fora, em vez de falhar na hora.
require "action_cable/subscription_adapter/redis"

ActionCable::SubscriptionAdapter::Redis.redis_connector = lambda do |config|
  Redis.new(config.except(:adapter, :channel_prefix, :reconnect_attempts))
end
