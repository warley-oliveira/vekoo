# frozen_string_literal: true

# Uma mensagem para o copiloto. No Sidekiq, porque uma resposta pode levar minutos; o texto chega em
# pedaços por CopilotChannel.
#
# Sem nova tentativa: a mensagem pode já ter enviado algo a um contato, e repetir enviaria de novo.
# Quem decide tentar outra vez é a pessoa.
#
# O crédito é cobrado na entrada, e devolvido se nada útil saiu: nem texto, nem ação aplicada.
class CopilotJob < ApplicationJob
  queue_as :default

  discard_on StandardError do |job, error|
    Rails.logger.error("[CopilotJob] descartado: #{error.class}: #{error.message} args=#{job.arguments.first&.slice(:organization_id, :account_id)}")
  end

  def perform(organization_id:, account_id:, session_id:, user_message: nil, skip_save: false)
    @organization = Organization.find_by(id: organization_id)
    @account = @organization&.accounts&.active&.find_by(id: account_id)
    return unless @account&.can?(:chat)

    @session_id = session_id

    I18n.with_locale(@account.locale.presence || I18n.default_locale) do
      run(user_message, skip_save)
    end
  end

  private

  def run(user_message, skip_save)
    return broadcast_error("noCredits", "inbox.copilot.no_credits") unless @organization.consume_credits(Copilot::MESSAGE_COST)

    thread = CopilotThread.find_or_create_for(account_id: @account.id, organization_id: @organization.id)
    thread.add_user_message(user_message) if user_message.present? && !skip_save

    agent = build_agent
    response = agent.process_messages(thread.history_for_llm)
    finish(thread, response)
  rescue Ai::Chat::MissingKey => e
    Rails.logger.error("[CopilotJob] #{e.class}: ANTHROPIC_API_KEY ausente")
    fail_turn(agent, "unavailable", "inbox.copilot.unavailable")
  rescue Ai::Chat::Failed => e
    Rails.logger.error("[CopilotJob] #{e.class}: #{e.message}")
    fail_turn(agent, "failed", "inbox.copilot.failed")
  rescue StandardError => e
    Rails.logger.error("[CopilotJob] #{e.class}: #{e.message}\n#{e.backtrace&.first(10)&.join("\n")}")
    fail_turn(agent, "failed", "inbox.copilot.failed")
  end

  def build_agent
    sequence = 0

    Copilot::Agent.new(
      account: @account,
      notify: method(:broadcast),
      on_text_chunk: lambda { |chunk|
        @delivered = true
        broadcast("text_chunk", { chunk: chunk, seq: sequence })
        sequence += 1
      }
    )
  end

  def finish(thread, response)
    useful = response[:text].present? || response[:changes_applied].present?

    if useful
      thread.add_assistant_message(
        response[:text],
        changes_applied: response[:changes_applied].presence,
        tool_activities: response[:tool_activities].presence,
        content_segments: response[:content_segments]
      )
    end

    refund unless useful
    broadcast("message_complete", { text: response[:text], toolCalls: response[:changes_applied], changesApplied: response[:changes_applied] })
    broadcast_credits(useful ? Copilot::MESSAGE_COST : 0)
  end

  # Falhou no meio: se a pessoa já recebeu texto ou já houve mudança, o crédito fica.
  def fail_turn(agent, code, message_key)
    refund unless @delivered || agent&.executor&.changes_applied.present?

    broadcast_error(code, message_key)
    broadcast_credits(0)
  end

  def refund
    @organization.refund_credits!(Copilot::MESSAGE_COST)
  end

  def broadcast_error(code, message_key)
    broadcast("error", { error: I18n.t(message_key), code: code })
  end

  def broadcast_credits(consumed)
    broadcast("credits_updated", { messageCredits: @organization.reload.credits_left, consumedCredits: consumed })
  end

  def broadcast(action, data)
    CopilotChannel.broadcast_event(@organization.id, @account.id, @session_id, action, data)
  end
end
