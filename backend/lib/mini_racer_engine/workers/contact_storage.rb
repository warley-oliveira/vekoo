module MiniRacerEngine::Workers
  # Dados guardados na conversa: `contactStorage` (do script, a tela não mostra) e
  # `contactAttribute` (os campos personalizados do contato). Mais ligar e desligar a
  # automação da conversa.
  class ContactStorage < MiniRacerEngine::EngineModule
    # Os dois mapas moram no documento da conversa, que é lido a cada mensagem e tem teto de
    # 16 MB no Mongo. Sem limite, um script de cliente incharia a conversa para sempre.
    MAX_VALUE_BYTES = 64.kilobytes
    MAX_KEYS = 200

    def register(worker, context, event)
      @worker = worker
      context.attach("contactStorage.getItem", proc { |*params| attach_method(method(:get_item), params, event) })
      context.attach("contactStorage.setItem", proc { |*params| attach_method(method(:set_item), params, event) })

      # Campo personalizado do contato (contact.custom_attributes)
      #  — usado para armazenar dados de contexto do contato, como preferências, histórico, etc.
      context.attach("contactAttribute.getItem", proc { |*params| attach_method(method(:get_attribute), params, event) })
      context.attach("contactAttribute.setItem", proc { |*params| attach_method(method(:set_attribute), params, event) })
      context.attach("enableAutomation", proc { |*params| attach_method(method(:enable_automation), params, event) })
      context.attach("disableAutomation", proc { |*params| attach_method(method(:disable_automation), params, event) })
    end

    private

    def get_item(params)
      read(:contact_storage, params[0])
    end

    def set_item(params)
      write(:contact_storage, params[0], params[1])
    end

    def get_attribute(params)
      read(:custom_attributes, params[0])
    end

    # Os campos personalizados aparecem na lista de conversas, por isso avisam a tela.
    def set_attribute(params)
      written = write(:custom_attributes, params[0], params[1])
      chat.dispatch_event! if written
      written
    end

    def enable_automation(_params)
      conversation = require_chat!
      conversation.automation_enabled = true
      conversation.save!
    end

    def disable_automation(_params)
      conversation = require_chat!
      conversation.automation_enabled = false
      conversation.save!
    end

    def read(field, key)
      conversation = require_chat!
      return nil if key.nil?

      stored(conversation, field)[normalized(key)]
    end

    # `$set` só na chave, como `Chat#sync_system_tags!` faz com as etiquetas. `save!` gravaria
    # o mapa inteiro, e dois scripts na mesma conversa apagariam a chave um do outro.
    #
    # Na memória, escreve direto em `attributes` e tira o campo da lista de alterados: ler um
    # Hash pelo getter já o marca, e o próximo `save!` da conversa (`disableAutomation`, por
    # exemplo) reescreveria o mapa inteiro do mesmo jeito.
    def write(field, key, value)
      conversation = require_chat!
      return nil if key.nil?

      name = normalized(key)
      raise MiniRacerEngine::Error, "Invalid key" if name.blank?

      # O BSON não aceita texto em bytes inválidos.
      clean = MiniRacerEngine::Values.to_js(value)
      guard_size!(conversation, field, name, clean)

      Chat.where(organization_id: conversation.organization_id, _id: conversation.id)
          .update_all("$set" => { "#{field}.#{name}" => clean })
      (conversation.attributes[field.to_s] ||= {})[name] = clean
      conversation.remove_change(field)
      true
    end

    def stored(conversation, field)
      conversation.attributes[field.to_s] || {}
    end

    def guard_size!(conversation, field, name, value)
      bytes = value.to_json.bytesize
      raise MiniRacerEngine::Error, "Value too large (limit: #{MAX_VALUE_BYTES} bytes)" if bytes > MAX_VALUE_BYTES

      budget&.charge_stored_bytes!(bytes)

      current = stored(conversation, field)
      return if current.key?(name) || current.size < MAX_KEYS

      raise MiniRacerEngine::Error, "Too many keys (limit: #{MAX_KEYS})"
    end

    # Só letras, números, `_` e `-`: sem ponto nem `$`, que no `$set` seriam caminho e operador.
    def normalized(key)
      key.to_s.parameterize.underscore
    end
  end
end
