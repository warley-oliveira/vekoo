module MiniRacerEngine
  # Classe-base de toda extensão. A subclasse implementa `register`, que só pode fazer
  # `context.attach`: ele roda a cada execução, inclusive nas que nunca tocam a extensão, e
  # uma consulta aqui pesaria em todo script da plataforma.
  #
  #   def register(worker, context, event)
  #     @worker = worker
  #     context.attach("exemplo.oi", proc { |*params| attach_method(method(:oi), params, event) })
  #   end
  #
  # `attach_method` é o caminho seguro de um callback: conta a cota, limpa a entrada, não
  # deixa detalhe interno vazar para o script, entrega só dado puro e emite o evento.
  class EngineModule
    def register(_worker, _context, _event)
      raise NotImplementedError, "#{self.class} precisa implementar register"
    end

    # JavaScript carregado depois de todos os `register` e antes do script, para quem monta
    # uma fachada sobre as funções nativas (ver `Workers::Fetch`). Não pode depender de outra
    # extensão ao carregar, só ao ser chamado.
    def bootstrap_js
      nil
    end

    # @param charge `false` para o que não conta na cota de chamadas
    def attach_method(method_def, params, event = nil, charge: true)
      budget&.charge_call!(method_def.name) if charge

      # O `to_js` também aqui: texto com meio emoji chega do V8 em bytes inválidos, e nem o
      # BSON nem o `to_json` de quem recebe aceitariam.
      input = Values.to_js(Values.from_js(params))
      output = Values.to_js(guarded(method_def.name) { method_def.call(input) })
      emit_event(event, method_def.name, input: input, output: output)
      output
    end

    private

    # Uma exceção que chega ao JS leva a mensagem junto, e mensagem de banco ou de driver
    # conta host, SQL e caminho de arquivo. Só `MiniRacerEngine::Error` passa como está.
    def guarded(name)
      yield
    rescue MiniRacerEngine::Error, ::MiniRacer::Error
      raise
    rescue StandardError => e
      Rails.logger.error("[MiniRacerEngine] #{self.class.name}##{name}: #{e.class}: #{e.message}\n#{Array(e.backtrace).first(8).join("\n")}")
      raise MiniRacerEngine::Error, "Internal error in #{name}"
    end

    # Quem assina o evento (uma tela, um log) não derruba o script.
    def emit_event(event, name, payload)
      event&.call(name, payload)
    rescue StandardError => e
      Rails.logger.error("[MiniRacerEngine] evento #{name}: #{e.class}: #{e.message}")
    end

    # Fora de `Worker#perform` (uma extensão chamada direto, sem V8) não há cota.
    def budget
      @worker&.budget
    end

    def organization
      @worker&.get_context(:organization)
    end

    def organization_id
      organization&.id&.to_s
    end

    def chat
      @worker&.get_context(:chat)
    end

    def require_organization!
      organization || raise(MiniRacerEngine::Error, "No organization in context")
    end

    def require_chat!
      chat || raise(MiniRacerEngine::Error, "No chat in context")
    end
  end
end
