module Outreach
  # Quem da base de contatos entra na campanha: conversas escolhidas, ou todas as que casam com os
  # filtros. Sempre pela organização, e só com os dois campos que importam: uma conversa pode ter
  # milhares de bytes de dados coletados.
  class ChatAudience
    # Não têm telefone: o id externo é do Instagram, do Messenger ou um visitante do site.
    NO_PHONE_AUDIENCES = %w[instagram facebook web].freeze
    MAX_CONTACTS = 50_000
    CONVERTIBLE_ID = ->(value) { BSON::ObjectId.legal?(value.to_s) ? BSON::ObjectId.from_string(value.to_s) : nil }

    class TooMany < StandardError; end

    def self.by_ids(organization, chat_ids)
      new(organization.chats.where(:_id.in => chat_ids))
    end

    def self.by_filters(organization, filters)
      new(apply_filters(organization.chats, filters.to_h.with_indifferent_access))
    end

    def self.apply_filters(scope, filters)
      if filters[:q].present?
        pattern = /#{Regexp.escape(filters[:q].to_s)}/i
        scope = scope.any_of({ external_id: pattern }, { user_name: pattern })
      end

      tag_ids = Array(filters[:tag_ids]).filter_map(&CONVERTIBLE_ID)
      scope = scope.where(:chat_tag_ids.in => tag_ids) if tag_ids.any?

      connector_ids = Array(filters[:connector_ids]).filter_map(&CONVERTIBLE_ID)
      scope = scope.where(:connector_id.in => connector_ids) if connector_ids.any?

      scope = scope.where(status: filters[:status].to_s) if filters[:status].present?

      unless filters[:automation_enabled].nil?
        scope = scope.where(automation_enabled: ActiveModel::Type::Boolean.new.cast(filters[:automation_enabled]))
      end

      scope
    end
    private_class_method :apply_filters

    def initialize(scope)
      @scope = scope
    end

    # @raise [TooMany] acima do limite de uma importação, como no CSV
    # @return [Array<Hash>] no formato de `RecipientImporter`
    def rows
      chats = scope.where(:audience_type.nin => NO_PHONE_AUDIENCES)
                   .only(:external_id, :user_name)
                   .limit(MAX_CONTACTS + 1)
                   .to_a
      raise TooMany if chats.size > MAX_CONTACTS

      chats.filter_map { |chat| row_for(chat) }
    end

    private

    attr_reader :scope

    # Grupo e identificador oculto do WhatsApp também não são telefone.
    def row_for(chat)
      external_id = chat.external_id.to_s
      return nil if external_id.include?("@") && !external_id.end_with?(BrPhoneVariants::JID_SUFFIX)

      { phone: external_id, name: chat.user_name, contact_id: chat.id.to_s }
    end
  end
end
