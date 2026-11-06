module MiniRacerEngine
  # O que uma execução já gastou. Mora no Ruby porque o script enxerga e chama as funções
  # nativas direto (`__nativeRequest`, por exemplo): limite conferido no JS seria contornado.
  #
  # O V8 só para o JavaScript. Enquanto um callback Ruby roda, o `timeout` espera ele
  # voltar: um `sleep` ou um `fetch` lento passaria do prazo. Por isso quem bloqueia usa
  # `remaining_seconds` como teto do próprio tempo.
  class Budget
    attr_reader :timeout_ms

    def initialize(timeout_ms: nil)
      @timeout_ms = Limits.timeout_ms(timeout_ms)
      @deadline = now + (@timeout_ms / 1000.0)
      @calls = 0
      @fetches = 0
      @response_bytes = 0
      @stored_bytes = 0
      @console_lines = 0
    end

    def remaining_seconds
      [ @deadline - now, 0.0 ].max
    end

    def expired?
      remaining_seconds.zero?
    end

    def charge_call!(name = nil)
      @calls += 1
      return if @calls <= Limits::MAX_CALLS

      raise LimitExceeded, "Script exceeded the limit of #{Limits::MAX_CALLS} calls per run#{" (#{name})" if name}"
    end

    def charge_fetch!
      @fetches += 1
      return if @fetches <= Limits::MAX_FETCHES

      raise LimitExceeded, "Script exceeded the limit of #{Limits::MAX_FETCHES} network calls per run"
    end

    # Quanto ainda cabe na próxima resposta.
    def response_bytes_left
      [ Limits::MAX_TOTAL_RESPONSE_BYTES - @response_bytes, Limits::MAX_RESPONSE_BYTES ].min
    end

    def charge_response_bytes!(bytes)
      @response_bytes += bytes
    end

    def charge_stored_bytes!(bytes)
      @stored_bytes += bytes
      return if @stored_bytes <= Limits::MAX_STORED_BYTES

      raise LimitExceeded, "Script exceeded the limit of #{Limits::MAX_STORED_BYTES} stored bytes per run"
    end

    # false quando o teto de linhas de log já foi atingido.
    def charge_console_line
      @console_lines += 1
      @console_lines <= Limits::MAX_CONSOLE_LINES
    end

    private

    def now
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end
  end
end
