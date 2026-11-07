module Widget
  # Merges sanitized host-page context (output of Widget::ContextSanitizer)
  # into Chat#widget_context. Sections replace wholesale — last write
  # wins, matching SPA navigation semantics — while events accumulate as a
  # deduped ring buffer. A verified identity also updates the chat
  # contact data, mirroring the pre-chat capture flow.
  #
  # Returns a Result telling which sections materially changed, so callers
  # can decide whether to record a Widget::ContextHistoryWriter snapshot in
  # the chat history. Returns nil when there was nothing to apply.
  class ContextStore
    EVENTS_KEPT = 10

    Result = Struct.new(:changed_sections, :context, keyword_init: true) do
      def changed?
        changed_sections.any?
      end
    end

    def self.apply(chat, sanitized)
      new(chat, sanitized).apply
    end

    def initialize(chat, sanitized)
      @chat = chat
      @sanitized = sanitized
    end

    def apply
      return nil if chat.nil? || sanitized.blank?

      current = chat.widget_context || {}
      changed = changed_sections(current)

      merged = current.merge(sanitized)
      if sanitized["events"].present?
        combined = (current["events"] || []) + sanitized["events"]
        merged["events"] = combined.uniq { |e| [ e["name"], e["at"] ] }.last(EVENTS_KEPT)
      end

      chat.widget_context = merged
      apply_verified_identity
      chat.save

      Result.new(changed_sections: changed, context: merged)
    end

    private

    attr_reader :chat, :sanitized

    # Seções mudam por conteúdo (ignorando o carimbo captured_at, que muda em
    # todo envio); events mudam quando chega entrada ainda não registrada.
    def changed_sections(current)
      changed = %w[page product visitor].select do |section|
        sanitized.key?(section) && strip_stamp(sanitized[section]) != strip_stamp(current[section])
      end
      changed << "events" if new_events?(current)
      changed
    end

    def strip_stamp(section)
      section.is_a?(Hash) ? section.except("captured_at") : {}
    end

    def new_events?(current)
      incoming = sanitized["events"] || []
      return false if incoming.empty?

      known = (current["events"] || []).map { |e| [ e["name"], e["at"] ] }
      incoming.any? { |e| known.exclude?([ e["name"], e["at"] ]) }
    end

    def apply_verified_identity
      visitor = sanitized["visitor"]
      return unless visitor.is_a?(Hash) && visitor["verified"]

      if visitor["name"].present? && (chat.user_name.blank? || chat.user_name == "Visitante")
        chat.user_name = visitor["name"]
      end

      attrs = chat.custom_attributes || {}
      attrs["email"] = visitor["email"] if visitor["email"].present?
      attrs["phone"] = visitor["phone"] if visitor["phone"].present?
      chat.custom_attributes = attrs
    end
  end
end
