module FlowRuntime
  # Dados que um fluxo coleta numa conversa. Os campos são cadastrados no fluxo (`FlowVersion#fields`), e os valores
  # ficam em `Chat#flow_data`, separados por fluxo e fora de `custom_attributes` (campos do contato).
  #
  # A escrita é um `$set` atômico por chave, escopado pela organização: sem read-modify-write do documento e sem busca
  # de conversa só pelo id.
  class ChatData
    KEY_FORMAT = /\A[a-z][a-z0-9_]{0,63}\z/
    MAX_STRING_LENGTH = 2_000

    def self.valid_key?(key)
      KEY_FORMAT.match?(key.to_s)
    end

    # Valores já gravados, restritos aos campos cadastrados na versão em uso. Lê do documento já carregado.
    def self.stored_values(chat, flow, version)
      return {} if chat.nil?

      stored = chat.flow_data.to_h[flow.id.to_s].to_h
      stored.slice(*version.field_keys)
    end

    def initialize(execution)
      @execution = execution
    end

    def persist(values)
      updates = declared(values)
      return false if updates.empty? || execution.playground? || execution.chat_id.blank?

      prefix = "flow_data.#{execution.flow_id}"
      set = updates.transform_keys { |key| "#{prefix}.#{key}" }
      set["#{prefix}._updated_at"] = Time.current.iso8601

      Chat.where(organization_id: execution.organization_id.to_s, id: execution.chat_id).update_all("$set" => set)
      true
    end

    private

    attr_reader :execution

    def declared(values)
      keys = execution.flow_version.field_keys
      values.to_h.stringify_keys.each_with_object({}) do |(key, value), result|
        next unless keys.include?(key)
        next if value.nil? # "não encontrado" não apaga o que já foi coletado

        result[key] = value.is_a?(String) ? value.first(MAX_STRING_LENGTH) : value
      end
    end
  end
end
