# frozen_string_literal: true

# O copiloto do chat (origem: ChatAssistantChannel). Params: { sessionId }, gerado pela tela, que
# separa as abas abertas. A stream é da pessoa dentro da organização: na origem era só
# "chat_assistant-<id gerado no navegador>", e quem soubesse o id escutava.
#
# Quem manda o histórico é o servidor, em CopilotThread. A origem aceitava a lista de mensagens vinda
# do navegador, inclusive falas atribuídas ao próprio assistente.
class CopilotChannel < ApplicationCable::Channel
  SESSION_ID = /\A[\w\-]{1,100}\z/

  # Melhor esforço: um soluço no Redis não pode derrubar o trabalho do agente.
  def self.broadcast_event(organization_id, account_id, session_id, action, data)
    ActionCable.server.broadcast(
      organization_stream(organization_id, Copilot.stream_name(account_id, session_id)),
      { action: action, data: data }
    )
  rescue StandardError => e
    Rails.logger.warn("[CopilotChannel] transmissão perdida (#{action}): #{e.class}: #{e.message}")
  end

  def subscribed
    @session_id = (params[:sessionId] || params[:session_id]).to_s
    return reject unless current_account.can?(:chat) && @session_id.match?(SESSION_ID)

    stream_from organization_stream(Copilot.stream_name(current_account.id, @session_id))

    # Só para esta assinatura: as outras abas já têm o que têm.
    transmit(
      {
        action: "connected",
        data: { message: I18n.t("inbox.copilot.connected"), sessionId: @session_id, savedMessages: thread.messages_for_api }
      }
    )
  end

  def unsubscribed
    stop_all_streams
  end

  # { userMessage, skipSave? }. `skipSave` é a nova tentativa: a mensagem já está guardada.
  def message(data)
    return unless current_account.can?(:chat)

    input = (data || {}).to_h.deep_transform_keys { |key| key.to_s.underscore }.with_indifferent_access
    text = input[:user_message].to_s.strip
    skip_save = ActiveModel::Type::Boolean.new.cast(input[:skip_save]) || false

    return transmit_error("blankMessage", "inbox.copilot.blank_message") if text.blank? && !skip_save
    return transmit_error("messageTooLong", "inbox.copilot.message_too_long") if text.length > Copilot::MAX_MESSAGE_CHARS
    return transmit_error("unavailable", "inbox.copilot.unavailable") unless Ai::Chat.available?
    # Antes de enfileirar, para a pessoa saber na hora. Quem cobra de verdade é o job.
    return transmit_error("noCredits", "inbox.copilot.no_credits") if current_organization.credits_left < Copilot::MESSAGE_COST

    CopilotJob.perform_later(
      organization_id: current_organization.id,
      account_id: current_account.id,
      session_id: @session_id,
      user_message: text.presence,
      skip_save: skip_save
    )
  rescue StandardError => e
    Rails.logger.error("[CopilotChannel] #{e.class}: #{e.message}")
    transmit_error("failed", "inbox.copilot.failed")
  end

  # Limpa o histórico. As outras abas da mesma sessão também ficam sabendo.
  def clear_history(_data = {})
    return unless current_account.can?(:chat)

    thread.clear_messages!
    self.class.broadcast_event(current_organization.id, current_account.id, @session_id, "history_cleared", { success: true })
  rescue StandardError => e
    Rails.logger.error("[CopilotChannel] clear_history: #{e.class}: #{e.message}")
  end

  private

  def thread
    CopilotThread.find_or_create_for(account_id: current_account.id, organization_id: current_organization.id)
  end

  def transmit_error(code, message_key)
    transmit({ action: "error", data: { error: I18n.t(message_key), code: code } })
  end
end
