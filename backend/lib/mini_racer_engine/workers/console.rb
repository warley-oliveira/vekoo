module MiniRacerEngine::Workers
  # `console.log`, `console.warn` e `console.error`. Os demais (`info`, `debug`) são os do
  # próprio V8: existem e não fazem nada.
  class Console < MiniRacerEngine::EngineModule
    def register(worker, context, event)
      @worker = worker
      context.attach("console.log", proc { |*params| log_call(:console_log, params, event) })
      context.attach("console.warn", proc { |*params| log_call(:console_warn, params, event) })
      context.attach("console.error", proc { |*params| log_call(:console_error, params, event) })
    end

    private

    # Depois do teto, nem log nem evento: um `while (true) console.log(x)` encheria o disco
    # e a memória de quem assina o evento, sem nada que o pare até o timeout. Não conta na
    # cota de chamadas, para log não derrubar um script que funciona.
    def log_call(name, params, event)
      return nil if budget && !budget.charge_console_line

      attach_method(method(name), params, event, charge: false)
    end

    def console_log(message)
      Rails.logger.info(line(message))
      message
    end

    def console_warn(message)
      Rails.logger.info("Warning: #{line(message)}")
      message
    end

    def console_error(message)
      Rails.logger.info("Error: #{line(message)}")
      message
    end

    def line(message)
      "[script] #{message.to_json}".truncate(MiniRacerEngine::Limits::MAX_CONSOLE_CHARS)
    end
  end
end
