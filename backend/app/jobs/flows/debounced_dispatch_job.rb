module Flows
  # O fim do debounce de uma conversa: junta o que chegou e entrega a `Flows::Dispatch`.
  #
  # Espera mais se o prazo foi empurrado ou se o contato ainda está digitando, sempre com um job só: este se reagenda
  # em vez de outro nascer. E, se uma execução da conversa está rodando, não faz nada: o que está na caixa fica lá, e o fim da
  # rodada chama este job de novo (`InboundDispatcher.flush`). É o que impede o mesmo bloco de rodar duas vezes ao mesmo tempo.
  class DebouncedDispatchJob < ApplicationJob
    queue_as :default

    # Digitando sem parar ainda tem resposta: a origem esperava sem teto.
    MAX_HOLD = 30.seconds
    HOLD_STEP = 3.seconds

    retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.error("[Flows::DebouncedDispatchJob] #{job.arguments.first} #{error.class}: #{error.message}")
    end

    def perform(chat_id, organization_id)
      chat = Chat.scoped(organization_id, chat_id)
      return unless chat

      deadline = chat.flow_inbox_deadline
      return if deadline.nil?
      # Uma pessoa assumiu nesse meio-tempo: o que estava na caixa não vai mais para o fluxo.
      return discard_inbox(chat, deadline) unless automation_on?(chat)

      remaining = deadline - Time.current
      return reschedule(chat, remaining) if remaining.positive?
      return reschedule(chat, HOLD_STEP) if hold_while_typing?(chat)
      return if FlowExecution.running.for_chat(organization_id, chat_id).real_runs.exists?

      items = take_inbox(chat, deadline)
      # O prazo mudou entre a leitura e aqui: chegou mensagem, que não agenda job porque este já existia.
      return reschedule(chat, 1.second) if items.nil?

      dispatch(chat, items)
    end

    private

    def automation_on?(chat)
      chat.automation_enabled && chat.organization&.automation_enabled?
    end

    def hold_while_typing?(chat)
      return false unless Chats::Presence.typing?(chat.id)

      first_at = Array(chat.flow_inbox).filter_map { |item| item["at"] }.min
      first_at.present? && Time.current.to_f - first_at < MAX_HOLD
    end

    def reschedule(chat, wait)
      self.class.set(wait: wait).perform_later(chat.id.to_s, chat.organization_id)
    end

    def discard_inbox(chat, deadline)
      take_inbox(chat, deadline)
    end

    # Atômico, com o prazo na condição: mensagem que chegou depois da leitura não é engolida.
    def take_inbox(chat, deadline)
      before = Chat.collection.find_one_and_update(
        { _id: chat.id, organization_id: chat.organization_id, flow_inbox_deadline: deadline },
        { "$unset" => { flow_inbox: "", flow_inbox_deadline: "" } },
        return_document: :before,
        projection: { flow_inbox: 1 }
      )
      before && Array(before["flow_inbox"])
    end

    def dispatch(chat, items)
      return if items.empty?

      Dispatch.call(
        chat: chat,
        text: items.map { |item| item["text"].to_s }.compact_blank.join("\n"),
        event: items.any? { |item| item["event"] == "first_message" } ? "first_message" : "message_received",
        message_id: items.last["message_id"]
      )
    end
  end
end
