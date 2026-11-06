module MiniRacerEngine::Workers
  # Quem é o contato da conversa.
  class Contact < MiniRacerEngine::EngineModule
    # `setFupEnabled` e `setStepperStage` mexiam em follow-up e etapa do assistente, que não
    # existem aqui. Os nomes continuam porque são contrato de quem escreve script, sem efeito
    # e dizendo isso: um `ReferenceError` derrubaria o script por causa de um detalhe.
    NOT_SUPPORTED = "Not supported: it belonged to assistants, which were replaced by flows".freeze

    def register(worker, context, event)
      @worker = worker
      context.attach("getContactInfo", proc { |*params| attach_method(method(:get_contact_info), params, event) })
      context.attach("setFupEnabled", proc { |*params| attach_method(method(:fup_enabled), params, event) })
      context.attach("setStepperStage", proc { |*params| attach_method(method(:stepper_state!), params, event) })
    end

    private

    def get_contact_info(_params)
      conversation = require_chat!

      {
        id: conversation.id.to_s,
        name: conversation.user_name,
        external_id: conversation.phone_number,
        phone_number: conversation.phone_number
      }
    end

    def fup_enabled(_params)
      { success: false, error: NOT_SUPPORTED }
    end

    def stepper_state!(_params)
      { success: false, error: NOT_SUPPORTED }
    end
  end
end
