module Insights
  # O índice de cada agregação, dito ao Mongo por `hint`.
  #
  # O `explain` com 20 mil conversas mostrou por quê: sem isto, o planejador escolheu
  # `{ organization_id, created_at }` para um filtro em `last_message_at`, e leu a organização inteira, e
  # o `created_at_1` global para `chat_id $in`, que em produção são as mensagens de todo mundo naquele
  # dia. O plano escolhido fica em cache para toda consulta do mesmo formato.
  #
  # O preço: sem `db:mongoid:create_indexes`, a agregação é recusada em vez de varrer. É a falha certa.
  module ChatIndexes
    BY_ACTIVITY = { "organization_id" => 1, "last_message_at" => -1 }.freeze
    BY_CREATION = { "organization_id" => 1, "created_at" => -1 }.freeze
    MESSAGES_BY_CHAT = { "chat_id" => 1, "created_at" => -1, "_id" => -1 }.freeze
    BOOKINGS_BY_START = { "organization_id" => 1, "start" => 1 }.freeze

    module_function

    def for_date_field(field)
      field.to_s == "last_message_at" ? BY_ACTIVITY : BY_CREATION
    end
  end
end
