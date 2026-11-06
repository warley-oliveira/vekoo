module MiniRacerEngine
  # A fronteira de valores entre Ruby e JS. O `mini_racer` 0.22 tem armadilhas nos dois
  # sentidos, conferidas rodando (ver as specs):
  #
  # Ruby -> JS: `BigDecimal` e `Date` viram a string "Undefined Conversion" sem avisar, e
  # qualquer objeto comum (`BSON::ObjectId`, documento) levanta `InternalError`. É isso que
  # garante que objeto Ruby nenhum chega ao script, mas o erro é inútil para quem escreve.
  #
  # JS -> Ruby: objeto cíclico vira Hash recursivo, e compartilhamento vira grafo: um
  # `o = { a: o, b: o }` de 40 níveis tem 2^40 caminhos. Passar isso para `to_json` ou para o
  # BSON estoura a pilha ou nunca termina, e callback Ruby não é interrompido pelo timeout.
  module Values
    MAX_DEPTH = 64
    MAX_NODES = 200_000

    module_function

    # O que veio do script, antes de entrar em código Ruby.
    def from_js(value)
      nodes = 0
      walk = lambda do |current, depth|
        nodes += 1
        raise Error, "Arguments too large" if nodes > MAX_NODES
        raise Error, "Arguments nested too deeply" if depth > MAX_DEPTH

        case current
        when Hash then current.to_h { |key, item| [ key.to_s, walk.call(item, depth + 1) ] }
        when Array then current.map { |item| walk.call(item, depth + 1) }
        when ::MiniRacer::JavaScriptFunction then nil
        when ::MiniRacer::ScriptError then current.message
        else current
        end
      end

      walk.call(value, 0)
    end

    # O que vai para o script: só dado puro. Também serve para `to_json`: nada aqui levanta
    # por causa de texto em codificação estranha.
    def to_js(value)
      case value
      when nil, true, false, Integer, Float, ::MiniRacer::Binary then value
      when String then utf8(value)
      when Symbol then value.to_s
      when Hash then value.to_h { |key, item| [ key.to_s, to_js(item) ] }
      when Array, Set then value.map { |item| to_js(item) }
      when Time, ActiveSupport::TimeWithZone, DateTime then value.to_time
      when Date then value.iso8601
      when BigDecimal then value.to_f
      when BSON::ObjectId then value.to_s
      else to_js_fallback(value)
      end
    end

    def utf8(text)
      return text if text.encoding == Encoding::UTF_8 && text.valid_encoding?
      return text.encode(Encoding::UTF_8, invalid: :replace, undef: :replace) unless text.encoding == Encoding::BINARY

      text.dup.force_encoding(Encoding::UTF_8).scrub
    end

    def to_js_fallback(value)
      plain = value.respond_to?(:as_json) ? value.as_json : value.to_s
      plain.instance_of?(value.class) ? plain.to_s : to_js(plain)
    end
    private_class_method :to_js_fallback
  end
end
