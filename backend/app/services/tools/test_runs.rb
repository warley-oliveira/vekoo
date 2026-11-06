module Tools
  # O resultado de "testar função". Roda em job, na fila `scripts`, e não na thread do Puma: um script pode levar 60 s. A
  # tela consulta aqui. Fica só em cache, porque não é histórico de nada.
  module TestRuns
    TTL = 10.minutes
    MAX_BYTES = 256.kilobytes

    module_function

    def start(organization_id, tool_id)
      id = SecureRandom.uuid
      write(organization_id, tool_id, id, "status" => "pending")
      id
    end

    def finish(organization_id, tool_id, id, result)
      write(organization_id, tool_id, id, result)
    end

    # @return [Hash, nil]
    def read(organization_id, tool_id, id)
      Rails.cache.read(key(organization_id, tool_id, id))
    end

    def write(organization_id, tool_id, id, value)
      clipped = value.merge("response" => FlowRuntime::Limits.clip(value["response"], MAX_BYTES)).compact
      Rails.cache.write(key(organization_id, tool_id, id), clipped, expires_in: TTL)
    end
    private_class_method :write

    def key(organization_id, tool_id, id)
      "tools.test-run.#{organization_id}.#{tool_id}.#{id}"
    end
    private_class_method :key
  end
end
