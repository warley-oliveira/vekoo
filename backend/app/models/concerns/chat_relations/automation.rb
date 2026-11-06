# O que `Chat` tem do domínio "automation": a caixa do debounce e os eventos que disparam fluxo. Fica aqui, e não em Chat,
# para cada domínio evoluir sem disputar o mesmo arquivo.
module ChatRelations
  module Automation
    extend ActiveSupport::Concern

    # As mensagens que estão esperando o debounce (ver Flows::InboundDispatcher). Existem só por segundos: `$unset` na saída.
    included do
      field :flow_inbox, type: Array
      field :flow_inbox_deadline, type: Time

      after_create :dispatch_contact_created

      # Métodos de Chat, que uma concern incluída não consegue sobrepor.
      prepend AutomationEvents
    end

    def flow_executions
      FlowExecution.for_chat(organization_id, id)
    end

    module AutomationEvents
      # Só na virada: a pausa se repete a cada mensagem do atendente, e a transferência acontece uma vez.
      def pause_automation_for_human!
        handing_off = automation_enabled
        result = super
        # A conversa de teste do editor não é um contato: nada dispara por ela.
        Flows::InboundDispatcher.call(chat: self, text: "", event: "human_handoff") if handing_off && external_id != Chat::TEST_EXTERNAL_ID
        result
      end

      # Limpar o contexto é recomeçar: uma pergunta de dias atrás não pode pegar a próxima mensagem como resposta.
      def clear_context(...)
        result = super
        Flows::CancelActive.for_chat(self)
        result
      end
    end

    private

    # A conversa de teste do editor não é um contato, e carga em lote (`ignore_events`) não dispara nada.
    def dispatch_contact_created
      return if ignore_events || external_id == Chat::TEST_EXTERNAL_ID
      return unless automation_enabled && organization&.automation_enabled?

      Flows::InboundDispatcher.call(chat: self, text: "", event: "contact_created")
    rescue StandardError => e
      # Automação nunca derruba quem está criando o contato.
      Rails.logger.error("[ChatRelations::Automation] #{e.class}: #{e.message}")
    end
  end
end
