module Ai
  # Escrita de Server-Sent Events.
  #
  # O front consome isto com `fetch` + `ReadableStream`, e não com `EventSource`
  # — porque `EventSource` não manda `Authorization`, e de bônus o `fetch` já
  # aceita `AbortSignal` para cancelar.
  class Sse
    # Cloudflare derruba conexão parada por volta de 100s, e a geração de um
    # carrossel passa disso pensando. O comentário mantém o cano vivo sem
    # inventar evento.
    HEARTBEAT = 15.seconds

    def initialize(stream)
      @stream = stream
      @last_write = Time.current
    end

    def write(event, payload = {})
      @stream.write("event: #{event}\ndata: #{payload.to_json}\n\n")
      @last_write = Time.current
    end

    # Chamar de dentro de laços longos: só escreve se a linha andou ficando
    # quieta demais.
    def heartbeat!
      return if Time.current - @last_write < HEARTBEAT

      @stream.write(": ping\n\n")
      @last_write = Time.current
    end

    def close
      @stream.close
    rescue IOError
      # Cliente já foi embora: fechar duas vezes não é problema de ninguém.
    end
  end
end
