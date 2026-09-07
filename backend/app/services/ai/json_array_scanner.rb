module Ai
  # Extrai objetos de um array JSON **enquanto ele ainda está sendo escrito**.
  #
  # É isto que permite mandar `event: card` assim que o modelo fecha um card, em
  # vez de esperar o documento inteiro. Contar chaves basta porque o que
  # importa é achar onde cada objeto de topo termina — o `JSON.parse` de
  # verdade só roda sobre o pedaço já completo.
  class JsonArrayScanner
    def initialize
      @buffer = +""
      @started = false
      @depth = 0
      @object_start = nil
      @in_string = false
      @escaped = false
    end

    # Alimenta o scanner e devolve os objetos que fecharam agora.
    def push(chunk)
      found = []
      chunk.each_char do |char|
        @buffer << char
        index = @buffer.length - 1

        # Modelos gostam de embrulhar JSON em cerca de markdown. Tudo antes do
        # primeiro `[` é ruído.
        unless @started
          @started = true if char == "["
          next
        end

        if @in_string
          if @escaped then @escaped = false
          elsif char == "\\" then @escaped = true
          elsif char == '"' then @in_string = false
          end
          next
        end

        case char
        when '"' then @in_string = true
        when "{"
          @object_start = index if @depth.zero?
          @depth += 1
        when "}"
          @depth -= 1
          if @depth.zero? && @object_start
            slice = @buffer[@object_start..index]
            @object_start = nil
            parsed = safe_parse(slice)
            found << parsed if parsed
          end
        end
      end
      found
    end

    private

    # Objeto malformado é pulado, não derruba a geração: um card estranho é
    # melhor perdido do que um carrossel inteiro perdido.
    def safe_parse(slice)
      value = JSON.parse(slice)
      value.is_a?(Hash) ? value : nil
    rescue JSON::ParserError
      nil
    end
  end
end
