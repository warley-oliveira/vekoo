module HookAction
  # Grava um valor em um campo personalizado do contato.
  class UserField < Base
    store_accessor :config, :custom_field_id, :value_template

    validate :custom_field_belongs_to_organization, if: :hook

    def perform(payload, chat = nil)
      raise Hooks::ActionFailed, I18n.t("automation.hooks.errors.no_chat") unless chat

      definition = CustomField.scoped(organization_id, custom_field_id)
      return @current_chat = chat if definition.nil?

      chat.custom_attributes = chat.custom_attributes.to_h.merge(definition.key => replace_template_variables(value_template, payload))
      chat.save
      @current_chat = chat
    end

    private

    def custom_field_belongs_to_organization
      return if custom_field_id.blank? || CustomField.scoped(organization_id, custom_field_id)

      errors.add(:base, I18n.t("automation.hooks.errors.custom_field_not_found"))
    end
  end
end
