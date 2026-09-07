module Ai
  # Traduz o **roteiro** que o modelo escreve num `CarouselCard` válido.
  #
  # O modelo não emite `CarouselCard` de propósito. O documento tem onze tipos
  # de bloco, ids, `spacing`, `width`, `ImageSpec` com `focus` e `zoom` — pedir
  # isso ao modelo é convidar saída inválida a cada geração. O que ele escreve é
  # curto e óbvio (`title`, `body`, `bullets`, `steps`, `quote`, `stat`,
  # `button`, `cover`), e a montagem acontece aqui.
  #
  # Consequência importante: **este compilador é a validação**. Campo
  # desconhecido é ignorado, campo faltando tem padrão, e o que sai é sempre um
  # documento que o editor abre.
  class CardBuilder
    # Os seis estilos de arte que `frontend/src/lib/doc.ts` sabe desenhar.
    ART_STYLES = %w[arc waves dots grid beams blob].freeze

    def initialize(run_id)
      @run_id = run_id
      @index = 0
    end

    # Devolve um card, ou nil se o roteiro não trouxer nada aproveitável.
    def build(script)
      return nil unless script.is_a?(Hash)

      @index += 1
      card_id = "ia-#{@run_id}-c#{@index}"
      blocks = Blocks.new(card_id)
      cover = @index == 1 || truthy(script["cover"])

      body = cover ? cover_blocks(blocks, script) : content_blocks(blocks, script)
      return nil if body.empty?

      {
        "id" => card_id,
        "layout" => "no-image",
        "bg" => nil,
        "align" => cover ? "bottom" : "top",
        # A capa ganha arte; o resto do carrossel fica com o fundo do tema, que
        # é o que mantém a leitura calma nos cards de conteúdo.
        "image" => cover ? art_image(card_id) : nil,
        "blocks" => body
      }.tap { |card| card["layout"] = "image-full" if card["image"] }
    end

    private

    # A capa é o card que a biblioteca desenha na grade: filete de acento,
    # chapéu, título grande e assinatura.
    def cover_blocks(blocks, script)
      [
        blocks.divider("accent"),
        (blocks.caption(script["kicker"], "ink") if present(script["kicker"])),
        (blocks.title(script["title"]) if present(script["title"])),
        (blocks.caption(script["footer"], "muted") if present(script["footer"]))
      ].compact
    end

    def content_blocks(blocks, script)
      out = []
      out << blocks.title(script["title"]) if present(script["title"])
      out << blocks.body(script["body"]) if present(script["body"])
      out << blocks.list("bullet", strings(script["bullets"])) if list?(script["bullets"])
      out << blocks.list("number", strings(script["steps"])) if list?(script["steps"])

      if script["stat"].is_a?(Hash) && present(script["stat"]["value"])
        out << blocks.stat(script["stat"]["value"].to_s, script["stat"]["label"].to_s)
      end

      out << blocks.quote(script["quote"]) if present(script["quote"])
      out << blocks.button(script["button"]) if present(script["button"])
      out
    end

    def art_image(card_id)
      {
        "source" => {
          "kind" => "art",
          # Determinístico pelo id do card: recarregar a tela não redesenha a
          # arte, e a mesma geração produz sempre o mesmo carrossel.
          "style" => ART_STYLES[card_id.sum % ART_STYLES.length],
          "seed" => card_id.sum % 1_000,
          "tint" => "accent"
        },
        "focus" => { "x" => 0.5, "y" => 0.5 },
        "zoom" => 1
      }
    end

    def present(value) = value.is_a?(String) && value.strip.present?
    def truthy(value) = value == true || value == "true"
    def list?(value) = value.is_a?(Array) && strings(value).any?
    def strings(value) = Array(value).select { |item| present(item) }.map(&:strip)

    # Mesma fábrica da semente, com ids determinísticos `<cardId>-b1`, `-b2`…
    class Blocks
      def initialize(card_id)
        @card_id = card_id
        @count = 0
      end

      def text(role, value, align = "start", color = "ink")
        {
          "id" => next_id, "type" => "text", "role" => role,
          "spans" => Doc::Spans.from_markdown(value.to_s.strip),
          "align" => align, "color" => color
        }
      end

      def title(value) = text("title", value)
      def body(value) = text("body", value, "start", "muted")
      def caption(value, color = "muted") = text("caption", value, "start", color)

      def list(style, items)
        {
          "id" => next_id, "type" => "list", "style" => style,
          "items" => items.map { |item| Doc::Spans.from_markdown(item) },
          "color" => "ink"
        }
      end

      def stat(value, label)
        { "id" => next_id, "type" => "stat", "value" => value, "label" => label,
          "align" => "start", "color" => "accent" }
      end

      def quote(value)
        { "id" => next_id, "type" => "quote",
          "spans" => Doc::Spans.from_markdown(value.to_s.strip), "color" => "ink" }
      end

      def divider(style = "line") = { "id" => next_id, "type" => "divider", "style" => style }
      def button(label) = { "id" => next_id, "type" => "button", "label" => label.to_s.strip, "variant" => "solid", "align" => "start" }

      private

      def next_id
        @count += 1
        "#{@card_id}-b#{@count}"
      end
    end
  end
end
