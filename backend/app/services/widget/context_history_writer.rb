module Widget
  # Persists the current host-page context snapshot as a system message in
  # the chat history when the context materially changes.
  #
  # Because the message has role 'system' (inside the ChatMessage default
  # scope), it flows to the LLM through BaseMessageJob#chat_messages_handler
  # on every channel that converges there (TextMessageJob, audio, follow-ups)
  # — no prompt-builder changes needed. The platform chat renders it as a
  # context card via role_base_type 'widget-context' + context_message; the
  # widget visitor never sees it (widget endpoints filter user/assistant).
  class ContextHistoryWriter
    MESSAGE_ORIGIN = 'widget_context'.freeze
    ROLE_BASE_TYPE = 'widget-context'.freeze

    # Backdated so the snapshot orders before the user message (and before a
    # replied proactive bubble, which is backdated 1 second) in the same POST.
    BACKDATE = 2.seconds

    def self.record(chat, context)
      new(chat, context).record
    end

    def initialize(chat, context)
      @chat = chat
      @context = context
    end

    def record
      content = ContextPromptBuilder.new(context).perform
      return nil if content.blank?

      message = ChatMessage::Text.new(
        role: 'system',
        role_base_type: ROLE_BASE_TYPE,
        content: content,
        chat: chat,
        message_origin: MESSAGE_ORIGIN,
        context_message: display_context,
        created_at: BACKDATE.ago
      )
      message.skip_chat_sync = true
      message.save
      message
    end

    private

    attr_reader :chat, :context

    # captured_at é carimbo interno de frescor — ruído para o cartão do chat.
    def display_context
      context.transform_values do |section|
        section.is_a?(Hash) ? section.except('captured_at') : section
      end
    end
  end
end
