module Agent
  # A marca publicada como ficha para o agente.
  #
  # Lê **só** `published_document`, pelo mesmo `Engines::Tokens` que os motores
  # usam — o rascunho nunca chega aqui, senão a peça sairia de uma marca que
  # ninguém aprovou. Traz o que serve para *escrever* (identidade, voz,
  # produtos, anotações) e o que serve para *preencher* (ids de cor e de ativo
  # que os campos `choice`/`image` aceitam).
  #
  # Bloco estável por marca+versão: carrega o segundo ponto de cache.
  class BrandBrief
    def initialize(tokens)
      @tokens = tokens
      @document = tokens.document
    end

    def text
      JSON.pretty_generate(as_json)
    end

    # Serve à chave de cache do processo e ao registro de proveniência: duas
    # marcas diferentes, ou duas versões da mesma, são fichas diferentes.
    def cache_key
      "#{@tokens.brand_core.id}:#{@tokens.version}"
    end

    def as_json
      {
        "identidade" => identity,
        "voz" => voice,
        "produtosEOfertas" => offers,
        "anotacoes" => @document["notes"]["text"].presence,
        "coresDisponiveis" => colors,
        "ativosDisponiveis" => assets
      }.compact
    end

    private

    def identity
      i = @document["identity"]
      {
        "nome" => i["name"],
        "segmento" => i["segment"].presence,
        "conceito" => i["concept"].presence,
        "publico" => i["audience"].presence,
        "posicionamento" => i["positioning"].presence,
        "instagram" => i["instagram"].presence&.then { |handle| "@#{handle}" },
        "endereco" => i["address"].presence,
        "pessoas" => i["characters"].map { |c| [ c["name"], c["role"].presence ].compact.join(" — ") }.presence
      }.compact
    end

    def voice
      v = @document["voice"]
      {
        "essencia" => v["essence"].presence,
        "tons" => v["tones"].presence,
        "observacaoDeTom" => v["toneNote"].presence,
        # A lista mais importante da ficha: é a única regra da marca que o
        # agente pode violar sem que nada quebre tecnicamente.
        "palavrasBanidas" => v["bannedWords"].filter_map { |w| w["text"].presence }.presence,
        "regrasAtivas" => v["qualityRules"].select { |_, on| on }.keys.presence,
        "exemplosDeCopy" => v["examples"].filter_map { |e| e["text"].presence }.presence
      }.compact
    end

    # Preço, vigência e descrição em texto livre, como a pessoa escreveu. É
    # daqui que sai todo número que a peça pode mostrar — e a regra-mestra do
    # prompt diz que fora daqui não se inventa nenhum.
    def offers
      items = @document["offers"]["items"].filter_map { |offer|
        next if offer["name"].blank?

        {
          "nome" => offer["name"],
          "preco" => offer["price"].presence,
          "descricao" => offer["description"].presence,
          "quandoVale" => offer["validity"].presence
        }.compact
      }
      items.presence
    end

    # Os ids que um campo `choice` com `source: palette.*` aceita. Sem isto o
    # agente escolheria "fundo escuro" por nome e a validação recusaria.
    def colors
      @tokens.colors.map { |color|
        {
          "id" => color["id"],
          "nome" => color["name"],
          "papel" => color["role"],
          "hex" => color["hex"],
          "serveComoFundo" => BrandCore::Schema::BACKGROUND_ROLES.key?(color["role"]),
          "serveComoAcento" => %w[accent campaign].include?(color["role"])
        }
      }
    end

    # Os ids que um campo `image` aceita, por tipo de ativo.
    def assets
      @tokens.brand_core.assets.ordered.filter_map { |asset|
        next if asset.kind == "font"

        {
          "id" => asset.id,
          "tipo" => asset.kind,
          "variante" => asset.variant,
          "arquivo" => asset.filename
        }.compact
      }.presence
    end
  end
end
