# Apoio às specs de métricas: conversas e mensagens de verdade no Mongo, com data escolhida. As
# agregações são o que se quer testar, então nada de dublê aqui.
module InsightsHelpers
  # Autoria de uma mensagem: `role` sozinho não distingue automação de pessoa, porque o operador
  # também envia com role 'assistant'.
  MESSAGE_KINDS = {
    inbound: { role: "user", message_origin: "platform" },
    automation: { role: "assistant", message_origin: "platform" },
    human: { role: "assistant", message_origin: "frontend", account_id: "conta-7" },
    # O que saiu do próprio celular e voltou pelo webhook.
    phone: { role: "assistant", message_origin: "user" },
    campaign: { role: "assistant", message_origin: "platform", campaign_id: "campanha-1" }
  }.freeze

  def add_message(chat, kind:, at:, **overrides)
    create(:chat_text_message, chat: chat, created_at: at, ignore_events: true, **MESSAGE_KINDS.fetch(kind), **overrides)
  end

  def day_range(day, zone)
    zone.local(day.year, day.month, day.day)...zone.local(day.year, day.month, day.day).advance(days: 1)
  end
end

RSpec.configure do |config|
  config.include InsightsHelpers
end
