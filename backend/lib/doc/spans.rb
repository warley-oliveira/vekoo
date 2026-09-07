module Doc
  # O texto do carrossel não é uma string: é uma sequência de trechos com
  # marcas (`TextSpan[]` em `frontend/src/lib/doc.ts`). Este é o porte Ruby de
  # `spansFromMarkdown` / `normalizeSpans` — mora aqui, e não na semente, porque
  # o compilador de cards da IA precisa exatamente do mesmo comportamento: o que
  # o modelo escreve com `**negrito**` tem que virar o mesmo documento que a
  # semente produz.
  module Spans
    MARKDOWN = /\*\*(.+?)\*\*|\*(.+?)\*/

    module_function

    # Junta vizinhos de marcas iguais e descarta os vazios.
    def normalize(spans)
      spans.each_with_object([]) do |span, out|
        next if span["text"].to_s.empty?

        previous = out.last
        if previous && previous.except("text") == span.except("text")
          previous["text"] += span["text"]
        else
          out << span.dup
        end
      end
    end

    # `**negrito**` e `*itálico*` viram marcas de verdade — o editor recebe
    # trechos, não asteriscos na tela.
    def from_markdown(text)
      result = []
      last = 0

      text.to_enum(:scan, MARKDOWN).each do
        match = Regexp.last_match
        result << { "text" => text[last...match.begin(0)] } if match.begin(0) > last
        result << if match[1]
          { "text" => match[1], "bold" => true }
        else
          { "text" => match[2], "italic" => true }
        end
        last = match.end(0)
      end
      result << { "text" => text[last..] } if last < text.length

      normalize(result)
    end

    # Caminho inverso — serve para resumir um card em texto puro (busca, dica
    # para a geração de imagem).
    def to_plain_text(spans)
      Array(spans).map { |span| span["text"].to_s }.join
    end
  end
end
