module Agent
  # A decisão do agente, conferida contra a realidade.
  #
  # O modelo devolve texto; aqui ele vira ou um conjunto de variações — cada
  # uma um `PieceDocument` válido contra os contratos de layout —, ou uma
  # lista de erros para uma segunda tentativa. É o mesmo `Validator` que o
  # editor usa, no modo estrito: o agente tem que entregar a peça cabendo.
  class Plan
    MAX_VARIATIONS = 3

    # `reference_ids`: os cards do banco que a variação seguiu — vão para a
    # peça (`pieces.reference_ids`), nunca para a tela.
    Variation = Struct.new(:format, :title, :document, :why, :reference_ids, keyword_init: true) do
      def as_json(*)
        { "format" => format, "title" => title, "document" => document, "why" => why }
      end
    end

    Result = Struct.new(:question, :variations, :errors, :only_images, keyword_init: true) do
      # Uma pergunta é resposta boa: falta um fato e o agente não inventou.
      def question? = question.present?
      # A pessoa pediu foto e as fotos já saíram pela ferramenta.
      def only_images? = only_images == true
      def ok? = question? || only_images? || variations.any?

      def as_json(*)
        { "question" => question, "variations" => variations.map(&:as_json) }
      end
    end

    # `generated`: os ids das fotos que a ferramenta criou neste turno — sem
    # elas, "só fotos" não é entrega. `references`: apelido → id dos padrões
    # de referência que foram ao agente (`References::AgentBrief#aliases`).
    def self.call(raw, brand_core:, request_text: nil, limit: MAX_VARIATIONS, generated: [], references: {})
      new(raw, brand_core, request_text, limit, generated, references).call
    end

    def initialize(raw, brand_core, request_text, limit, generated, references)
      @raw = raw.to_s
      @brand = brand_core
      @request_text = request_text
      @limit = limit
      @generated = Array(generated)
      @references = references.to_h
      @errors = []
    end

    def call
      payload = Ai::JsonObject.extract(@raw)
      return Result.new(question: nil, variations: [], errors: [ "a resposta não era um objeto JSON" ]) if payload.nil?

      question = payload["question"].to_s.strip
      return Result.new(question: question, variations: [], errors: []) if question.present?

      if payload["onlyImages"] == true && Array(payload["variations"]).empty?
        return Result.new(question: nil, variations: [], errors: [], only_images: true) if @generated.any?

        return Result.new(question: nil, variations: [], errors: [ "`onlyImages` sem nenhuma foto criada: chame `generate_image` ou entregue variações." ])
      end

      variations = Array(payload["variations"]).first(@limit).each_with_index.filter_map { |raw, index|
        build(raw, index + 1)
      }

      if variations.empty? && @errors.empty?
        @errors << "`variations` veio vazio e `question` também. Uma das duas precisa ter conteúdo (ou `onlyImages`, se a pessoa pediu só fotos e você já as criou)."
      end

      Result.new(question: nil, variations: variations, errors: @errors)
    end

    private

    def build(raw, position)
      return note(position, "não é um objeto") unless raw.is_a?(Hash)
      return note(position, "formato '#{raw['format']}' não existe (use #{PieceDocument::FORMATS.keys.join(', ')})") unless PieceDocument::FORMATS.key?(raw["format"].to_s)

      document = PieceDocument::Build.from_agent(raw, brand_core: @brand, request_text: @request_text)
      result = PieceDocument::Validator.call(document, brand_core: @brand, strict: true)
      unless result.valid?
        result.errors.each { |path, code, detail| note(position, describe(document, path, code, detail)) }
        return nil
      end

      Variation.new(
        format: document["format"],
        title: raw["title"].to_s.squish.presence&.first(120) || document.dig("slides", 0, "layoutId"),
        document: document,
        why: raw["why"].to_s.strip.presence,
        reference_ids: reference_ids(raw["referenceIds"])
      )
    end

    # Apelido desconhecido some sem erro: errar o rótulo da referência não é
    # motivo para pagar uma segunda tentativa.
    def reference_ids(raw)
      Array(raw).filter_map { |name| @references[name.to_s.strip.upcase] }.uniq
    end

    # O erro volta ao modelo em pt-BR e na língua dele — o slot e o layout,
    # não o caminho interno do documento.
    MESSAGES = {
      "unknownLayout" => "o layout '%{detail}' não existe na biblioteca",
      "formatUnsupported" => "o layout não sai no formato '%{detail}'",
      "mustBeFirst" => "este layout só pode ser a primeira lâmina",
      "mustBeLast" => "este layout só pode ser a última lâmina",
      "carouselSize" => "um carrossel precisa ter %{detail} lâminas",
      "singleSlide" => "peça que não é carrossel tem exatamente uma lâmina",
      "requiredSlot" => "falta o slot obrigatório",
      "blank" => "o slot obrigatório veio vazio",
      "requiredImage" => "o slot de imagem é obrigatório e veio sem foto — use uma foto de `ativosDisponiveis` ou outro layout",
      "tooLong" => "o texto passou do limite (%{detail} caracteres)",
      "tooManyLines" => "o texto tem linhas demais (%{detail})",
      "foreignAsset" => "a foto não é desta marca — use um id de `ativosDisponiveis`",
      "invalidId" => "o id da foto é inválido",
      "unknownToken" => "o token de cor '%{detail}' não existe — use um de `tokensDeCor`",
      "inclusion" => "valor fora das opções (%{detail})"
    }.freeze

    def describe(document, path, code, detail)
      slide = path[/\Aslides\[(\d+)\]/, 1]
      block = path[/blocks\[(\d+)\]/, 1]
      slot = path[/slots\.(\w+)/, 1] || (slide && block && document.dig("slides", slide.to_i, "blocks", block.to_i, "slot"))
      where = [ slide && "lâmina #{slide.to_i + 1}", slot && "slot `#{slot}`" ].compact.join(", ").presence || path
      "#{where}: #{format(MESSAGES.fetch(code, 'não confere (%{detail})'), detail: detail.to_s)}"
    end

    def note(position, message)
      @errors << "variação #{position}: #{message}"
      nil
    end
  end
end
