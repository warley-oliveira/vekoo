module FlowRuntime
  # Os tetos da execução. `flow_executions.context` é jsonb: cada bloco regrava o valor inteiro, então nada que venha
  # de fora (resposta de HTTP, de script, de IA) entra nele sem corte. O histórico longo mora em `flow_execution_logs`.
  module Limits
    class TooLarge < StandardError; end

    # Um fluxo em círculo sem nenhuma espera mandaria mensagem para sempre.
    MAX_STEPS_PER_RUN = 50
    # O bloco `loop` renova o teto de cima a cada volta. Este é o que sobra para um círculo que passa por um `loop`.
    MAX_STEPS_PER_EXECUTION = 2_000
    MAX_FLOW_DEPTH = 5

    MAX_VARIABLE_BYTES = 64.kilobytes
    MAX_VARIABLES_BYTES = 512.kilobytes
    MAX_LOG_BYTES = 32.kilobytes
    MAX_PLAYGROUND_MESSAGES = 100
    MAX_TOOL_OUTPUT_BYTES = 64.kilobytes

    PREVIEW_CHARS = 2_000

    module_function

    # O valor, se couber; senão, um texto cortado ou um aviso com o começo do JSON.
    def clip(value, max_bytes)
      return value if value.nil? || value == true || value == false || value.is_a?(Numeric)
      return value.bytesize <= max_bytes ? value : value.truncate_bytes(max_bytes) if value.is_a?(String)

      json = value.to_json
      return value if json.bytesize <= max_bytes

      { "_truncated" => true, "_bytes" => json.bytesize, "_preview" => json.truncate_bytes([ PREVIEW_CHARS, max_bytes ].min) }
    end

    def clip_log(value)
      clip(value.to_h.deep_stringify_keys, MAX_LOG_BYTES)
    end

    # @raise [TooLarge] quando o conjunto passa do teto: o fluxo guardou demais
    def bound_variables(variables)
      bounded = variables.to_h.transform_values { |value| clip(value, MAX_VARIABLE_BYTES) }
      raise TooLarge, I18n.t("automation.flows.errors.too_many_variables") if bounded.to_json.bytesize > MAX_VARIABLES_BYTES

      bounded
    end
  end
end
