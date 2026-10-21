module Agent
  # A decisão do agente, conferida contra a realidade.
  #
  # O modelo devolve texto; aqui ele vira ou um conjunto de variações que os
  # motores **conseguem renderizar**, ou uma lista de erros para uma segunda
  # tentativa. É a mesma validação do formulário do modo avançado
  # (`Engines::Values`) — não existe um caminho frouxo porque quem preencheu
  # foi uma IA.
  class Plan
    MAX_VARIATIONS = 3

    Variation = Struct.new(:engine_id, :format, :title, :values, :why, keyword_init: true) do
      def as_json(*)
        {
          "engineId" => engine_id, "format" => format, "title" => title,
          "values" => values, "why" => why
        }
      end
    end

    Result = Struct.new(:question, :variations, :errors, keyword_init: true) do
      # Uma pergunta é resposta boa: falta um fato e o agente não inventou.
      def question? = question.present?
      def ok? = question? || variations.any?

      def as_json(*)
        { "question" => question, "variations" => variations.map(&:as_json) }
      end
    end

    def self.call(raw, tokens:, limit: MAX_VARIATIONS)
      new(raw, tokens, limit).call
    end

    def initialize(raw, tokens, limit)
      @raw = raw.to_s
      @tokens = tokens
      @limit = limit
      @errors = []
    end

    def call
      payload = extract
      return Result.new(question: nil, variations: [], errors: [ "a resposta não era um objeto JSON" ]) if payload.nil?

      question = payload["question"].to_s.strip
      return Result.new(question: question, variations: [], errors: []) if question.present?

      variations = Array(payload["variations"]).first(@limit).each_with_index.filter_map { |raw, index|
        build(raw, index + 1)
      }

      if variations.empty? && @errors.empty?
        @errors << "`variations` veio vazio e `question` também. Uma das duas precisa ter conteúdo."
      end

      Result.new(question: nil, variations: variations, errors: @errors)
    end

    private

    def build(raw, position)
      return note(position, "não é um objeto") unless raw.is_a?(Hash)

      entry = Engines::Registry.find(raw["engineId"].to_s)
      return note(position, "o motor '#{raw['engineId']}' não existe no catálogo") unless entry

      manifest = entry.manifest
      format = raw["format"].to_s.presence || manifest.formats.first
      unless manifest.supports?(format)
        return note(position, "o motor '#{manifest.id}' não sai no formato '#{format}' (aceita: #{manifest.formats.join(', ')})")
      end

      result = Engines::Values.call(manifest, raw["values"], tokens: @tokens)
      unless result.valid?
        result.errors.each { |path, code| note(position, field_error(path, code)) }
        return nil
      end

      Variation.new(
        engine_id: manifest.id,
        format: format,
        title: title_for(raw["title"], manifest),
        values: result.values,
        why: raw["why"].to_s.strip.presence
      )
    end

    def title_for(given, manifest)
      title = given.to_s.squish
      title.presence&.first(120) || manifest.as_json(locale: :"pt-BR")["name"]
    end

    # A mensagem volta ao modelo, então é sempre em pt-BR — independente do
    # idioma de quem pediu.
    def field_error(path, code)
      field = path.to_s.delete_prefix("values.")
      reason = I18n.t("errors.messages.#{code}", locale: :"pt-BR", default: "não confere")
      "o campo '#{field}' #{reason}"
    end

    def note(position, message)
      @errors << "variação #{position}: #{message}"
      nil
    end

    def extract
      Ai::JsonObject.extract(@raw)
    end
  end
end
