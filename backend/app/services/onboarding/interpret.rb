module Onboarding
  # Uma resposta da conversa, lida pelo modelo: em que campo do brandcore cada
  # pedaço cai, se a resposta foi vaga e o que perguntar de volta.
  #
  # Devolve **campos limpos**, não o documento: tipo certo, tamanho cortado,
  # enum conferido, e só os campos que o tema da pergunta pode tocar. Quem
  # grava no documento é o `Onboarding::Fields`.
  #
  # Falha de rede ou do modelo sobe (`Ai::Chat::Failed`): a tela diz "o motor
  # não respondeu" e a pessoa tenta de novo com a resposta dela intacta.
  # Sem chave configurada — ou com o teto de custo do mês batido — entra a
  # leitura sem modelo (`plain`), que grava as palavras dela no campo
  # principal do tema. Pior que o modelo, mas nunca trava a conversa.
  class Interpret
    # Os campos que cada tema pode escrever. Fora daqui o que o modelo
    # devolver é descartado: a resposta sobre o público não reescreve o nome.
    FIELDS = {
      "brand" => %w[name concept segment segmentCode],
      "audience" => %w[audience],
      "differential" => %w[positioning],
      "voice" => %w[example essence tones toneNote],
      "banned" => %w[bannedWords toneNote],
      "offers" => %w[offers],
      "logo" => %w[],
      "palette" => %w[colors displayFont utilityFont],
      "fonts" => %w[displayFont utilityFont colors]
    }.freeze
    # Quem cita o @ ou o endereço no meio de outra resposta não precisa ser
    # perguntado de novo.
    EXTRAS = %w[instagram address notes].freeze
    ALL = (FIELDS.values.flatten + EXTRAS).uniq.freeze

    Result = Struct.new(:fields, :vague, :follow_up, :skip, :wants_suggestion,
      :source, :usage, :model, :cost_micro_usd, keyword_init: true) do
      def vague? = vague == true
      def skip? = skip == true
      def wants_suggestion? = wants_suggestion == true
    end

    # `chat: nil` lê sem modelo — é o caminho do teto de custo batido.
    def self.call(brand_core, topic:, text:, follow_up_available:, chat: Ai::Chat.new)
      new(brand_core, topic, text, follow_up_available, chat).call
    end

    def initialize(brand_core, topic, text, follow_up_available, chat)
      @brand_core = brand_core
      @topic = topic.to_s
      @text = text.to_s.strip
      @follow_up_available = follow_up_available
      @chat = chat
      @document = brand_core.full_document
    end

    def call
      return plain unless @chat

      answer = ask
      payload = Ai::JsonObject.extract(answer.text)
      # Resposta torta não é "o motor não respondeu": ele respondeu, mal. A
      # leitura sem modelo ainda aproveita as palavras da pessoa.
      return plain(answer) unless payload.is_a?(Hash) && payload["fields"].is_a?(Hash)

      Result.new(
        fields: with_segment(sanitize(payload["fields"])),
        vague: payload["vague"] == true,
        follow_up: @follow_up_available ? line(payload["followUp"], 240).presence : nil,
        skip: payload["skip"] == true,
        wants_suggestion: payload["wantsSuggestion"] == true,
        source: "ai",
        **accounting(answer)
      )
    rescue Ai::Chat::MissingKey
      Rails.logger.info("onboarding: sem ANTHROPIC_API_KEY — leitura sem modelo")
      plain
    end

    private

    def ask
      @chat.answer(
        system: [ { type: "text", text: ConversationPrompts.system, cache_control: { type: "ephemeral" } } ],
        messages: [ {
          role: "user",
          content: ConversationPrompts.message(
            topic: @topic, answer: @text, draft: draft,
            follow_up_available: @follow_up_available, language: I18n.locale.to_s
          )
        } ],
        model: Agent::Run.model,
        max_tokens: 2_000,
        # Ler uma resposta e encaixar em campos é tarefa curta: `low` responde
        # em segundos, e numa conversa a espera aparece.
        effort: "low"
      )
    end

    # O que já está gravado, do jeito que o modelo precisa para juntar em vez
    # de apagar: os nomes dos campos são os mesmos da resposta que ele dá.
    def draft
      identity = @document["identity"]
      voice = @document["voice"]
      {
        name: identity["name"], concept: identity["concept"], segment: identity["segment"],
        audience: identity["audience"], positioning: identity["positioning"],
        instagram: identity["instagram"], address: identity["address"],
        essence: voice["essence"], tones: voice["tones"], toneNote: voice["toneNote"],
        bannedWords: voice["bannedWords"].map { |word| word["text"] },
        offers: @document["offers"]["items"].map { |offer| offer.slice("name", "price", "description", "validity") },
        colors: @document["palette"]["colors"].map { |color| color["hex"] },
        displayFont: @document.dig("typography", "display", "family"),
        utilityFont: @document.dig("typography", "utility", "family"),
        notes: @document["notes"]["text"]
      }.compact_blank
    end

    def allowed
      @topic == BrandCore::Onboarding::SUMMARY ? ALL : FIELDS.fetch(@topic, []) + EXTRAS
    end

    # O ramo não é perguntado: sai do que ela vende. Se o modelo não
    # classificou, o "o que vende" serve de ramo — como na leitura sem modelo.
    # Sem isso o tema `brand`, que é obrigatório, nunca fecha e a mesma
    # pergunta volta para sempre.
    def with_segment(fields)
      return fields unless @topic == "brand"
      return fields if fields["segment"].present? || @document["identity"]["segment"].present?

      concept = fields["concept"].presence || @document["identity"]["concept"]
      concept.present? ? fields.merge("segment" => line(concept, BrandCore::Schema::SHORT)) : fields
    end

    # ------------------------------------------------------------- limpeza

    def sanitize(raw)
      raw = raw.to_h.deep_stringify_keys.slice(*allowed)
      raw.each_with_object({}) do |(key, value), fields|
        clean = clean(key, value)
        fields[key] = clean unless clean.nil? || (clean.respond_to?(:empty?) && clean.empty?)
      end
    end

    def clean(key, value)
      schema = BrandCore::Schema
      case key
      when "name", "segment" then line(value, schema::SHORT)
      when "concept", "essence", "toneNote", "address" then line(value, schema::LINE)
      when "audience", "positioning", "example" then line(value, schema::PARAGRAPH)
      when "notes" then value.to_s.strip.first(schema::NOTES)
      when "instagram" then line(value, schema::SHORT).delete_prefix("@")
      when "segmentCode" then BrandCore::Onboarding::SEGMENTS.include?(value.to_s) ? value.to_s : nil
      when "tones" then Array(value).map(&:to_s).select { |tone| schema::TONES.include?(tone) }.uniq.first(3)
      when "bannedWords" then Array(value).filter_map { |word| line(word, schema::SHORT).presence }.uniq.first(schema::MAX_LIST)
      when "colors" then Array(value).filter_map { |hex| BrandCore::PaletteBuilder.normalize(hex) }.uniq.first(3)
      when "displayFont", "utilityFont" then line(value, schema::SHORT)
      when "offers" then offers(value)
      end
    end

    def offers(value)
      Array(value).filter_map { |offer|
        next unless offer.is_a?(Hash)

        name = line(offer["name"], BrandCore::Schema::SHORT)
        next if name.blank?

        {
          "name" => name,
          "price" => line(offer["price"], BrandCore::Schema::SHORT),
          "description" => line(offer["description"], BrandCore::Schema::LINE),
          "validity" => line(offer["validity"], BrandCore::Schema::LINE)
        }
      }.first(BrandCore::Schema::MAX_OFFERS)
    end

    def line(value, max)
      value.to_s.squish.first(max).to_s
    end

    def accounting(answer)
      return { usage: {}, model: nil, cost_micro_usd: 0 } unless answer

      { usage: answer.usage, model: answer.model, cost_micro_usd: Agent::Pricing.micro_usd(answer.model, answer.usage) }
    end

    # ------------------------------------------------------- sem o modelo

    PRICE = /R\$\s?\d[\d.]*(?:,\d{2})?/i
    HEX = /#\h{6}\b/

    # As palavras da pessoa no campo principal do tema. Não julga se a
    # resposta foi vaga — sem modelo não há como — e por isso também não
    # pergunta de volta: segue em frente com o que ela disse.
    def plain(answer = nil)
      fields = case @topic
      when "brand" then brand_from(@text)
      when "audience" then { "audience" => @text }
      when "differential" then { "positioning" => @text }
      when "voice" then { "example" => @text }
      when "banned" then { "bannedWords" => @text.split(/[,;\n]/) }
      when "offers" then { "offers" => @text.split(/[\n;]/).map { |row| offer_from(row) } }
      when "palette", "fonts" then { "colors" => @text.scan(HEX), "displayFont" => font_in(@text) }
      else {}
      end

      Result.new(
        fields: sanitize(fields), vague: false, follow_up: nil, skip: false, wants_suggestion: false,
        source: "plain", **accounting(answer)
      )
    end

    # "Padaria do João, pão de fermentação natural" → nome antes da vírgula,
    # o resto é o que vende. Sem separador, a frase inteira é as duas coisas.
    def brand_from(text)
      name, rest = text.split(/\s*(?:[,.:;—–]|\s-\s)\s*/, 2)
      concept = rest.presence || text
      { "name" => name, "concept" => concept, "segment" => concept }
    end

    def offer_from(row)
      price = row[PRICE].to_s
      { "name" => row.sub(PRICE, "").gsub(/[\s\-–—:,]+\z/, ""), "price" => price }
    end

    def font_in(text)
      Fields.catalog(text)&.family
    end
  end
end
