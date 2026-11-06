module FlowRuntime
  # Decide se o `ai_assistant` (modo conversa) deve sair por uma das saídas.
  #
  # É uma chamada separada da conversa: o modelo que conversa só conversa, e o juiz, no modelo rápido e com resposta
  # em JSON, avalia as condições "Quando…" contra a conversa depois de cada mensagem nova do contato. Na dúvida, fica.
  # As proteções que não dependem do modelo são aplicadas aqui: mínimo de trocas no bloco e dados obrigatórios da saída.
  class ExitJudge
    STAY = "stay".freeze
    HISTORY_LIMIT = 20
    # O que a API aceita como nome de propriedade.
    PARAM_NAME = /\A[a-zA-Z0-9_.-]{1,64}\z/
    TYPES = %w[string integer number boolean array].freeze

    Decision = Struct.new(:output_id, :reason, :data, :missing, keyword_init: true) do
      def exit?
        output_id.present? && output_id != STAY
      end
    end

    # @param llm [FlowRuntime::Llm]
    def initialize(llm:, outputs:, history:, turns:, min_turns: 1)
      @llm = llm
      @outputs = outputs
      @history = history
      @turns = turns
      @min_turns = [ min_turns.to_i, 1 ].max
    end

    def self.nullable_property(type, description: nil)
      type = TYPES.include?(type.to_s) ? type.to_s : "string"
      property = { "type" => [ type, "null" ] }
      property["items"] = { "type" => "string" } if type == "array"
      property["description"] = description if description.present?
      property
    end

    def call
      return stay(I18n.t("automation.flows.judge.no_outputs")) if outputs.empty?
      return stay(I18n.t("automation.flows.judge.min_turns", count: min_turns)) if turns < min_turns

      verdict = ask_model
      output = outputs.find { |candidate| candidate["id"].to_s == verdict["decision"].to_s }
      return stay(verdict["reason"].presence || I18n.t("automation.flows.judge.no_match")) unless output

      data = verdict["data"].is_a?(Hash) ? verdict["data"].slice(*param_names(output)).compact : {}
      missing = required_names(output).select { |name| data[name].nil? || data[name] == "" }
      if missing.any?
        return Decision.new(output_id: STAY, data: {}, missing: missing,
                            reason: I18n.t("automation.flows.judge.missing_data", label: output["label"], fields: missing.join(", ")))
      end

      Decision.new(output_id: output["id"].to_s, reason: verdict["reason"].to_s, data: data, missing: [])
    end

    # A chamada ao modelo já foi paga por este juiz? Quem conversa depois não paga duas vezes.
    def called_model?
      @called_model == true
    end

    private

    attr_reader :llm, :outputs, :history, :turns, :min_turns

    def stay(reason)
      Decision.new(output_id: STAY, reason: reason, data: {}, missing: [])
    end

    def ask_model
      @called_model = true
      llm.structured(system: prompt, prompt: transcript, schema: schema, size: "fast")
    end

    def schema
      properties = { "decision" => { "type" => "string", "enum" => outputs.map { |output| output["id"].to_s } + [ STAY ] }, "reason" => { "type" => "string" } }
      required = %w[decision reason]

      params = all_params
      if params.any?
        properties["data"] = {
          "type" => "object",
          "additionalProperties" => false,
          "required" => params.keys,
          "properties" => params
        }
        required << "data"
      end

      { "type" => "object", "additionalProperties" => false, "required" => required, "properties" => properties }
    end

    def all_params
      outputs.flat_map { |output| Array(output["parameters"]) }.each_with_object({}) do |param, result|
        name = param["name"].to_s
        next unless name.match?(PARAM_NAME)

        result[name] ||= self.class.nullable_property(param["type"], description: param["description"])
      end
    end

    def prompt
      <<~PROMPT
        Você decide o roteamento de um atendimento. Você NÃO fala com o cliente.

        Leia a conversa inteira e verifique se alguma condição de saída abaixo já foi claramente atendida. A condição pode
        depender do que o cliente disse ou do que a assistente já enviou: siga exatamente o critério descrito em cada saída.
        Se nenhuma estiver claramente atendida, ou se houver dúvida, a decisão é "#{STAY}".

        Saídas:
        #{outputs.map { |output| describe(output) }.join("\n")}

        O motivo é curto e em português. Nos dados, preencha só o que a saída escolhida pede e que foi informado na conversa;
        o resto fica nulo.
      PROMPT
    end

    def describe(output)
      line = "- id: #{output['id']} | quando: #{output['when'].presence || output['label']}"
      params = Array(output["parameters"])
      return line if params.empty?

      fields = params.map do |param|
        "#{param['name']} (#{param['type'] || 'string'}#{', obrigatório' if param['required']}): #{param['description']}"
      end
      "#{line}\n  dados: #{fields.join('; ')}"
    end

    def transcript
      history.last(HISTORY_LIMIT).map do |message|
        who = message[:role].to_s == "assistant" ? "Assistente" : "Cliente"
        "#{who}: #{message[:content]}"
      end.join("\n")
    end

    def param_names(output)
      Array(output["parameters"]).map { |param| param["name"].to_s }
    end

    def required_names(output)
      Array(output["parameters"]).select { |param| param["required"] }.map { |param| param["name"].to_s }
    end
  end
end
