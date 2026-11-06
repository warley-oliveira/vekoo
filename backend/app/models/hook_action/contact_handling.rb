module HookAction
  # Acha ou cria a conversa do contato: toda requisição começa por aqui. Fixa no webhook.
  class ContactHandling < Base
    store_accessor :config, :contact_identifier, :contact_name

    def static?
      true
    end

    def perform(payload, _chat = nil)
      phone = format_whatsapp_number(replace_template_variables(contact_identifier, payload))
      raise Hooks::ActionFailed, I18n.t("automation.hooks.errors.no_contact_identifier") if phone.blank?

      name = replace_template_variables(contact_name, payload)
      chat = find_or_create_chat(phone, name)

      chat.update(user_name: name) if name.present? && chat.user_name != name
      @current_chat = chat
    end

    def format_whatsapp_number(number)
      digits = number.to_s.gsub(/\D/, "")
      # DDI digitado duas vezes.
      digits.start_with?("5555") && digits.size > 13 ? digits[2..] : digits
    end

    private

    # O número chega em qualquer forma do 9º dígito. Pelo prefixo do índice
    # `{organization_id, external_id, last_message_at}`, sem varrer a coleção.
    def find_or_create_chat(phone, name)
      Chats::Locator.create_once("hook.#{organization_id}.#{phone}", find: -> { existing_chat(phone) }) do
        Chat.create!(
          organization_id: organization_id,
          external_id: phone,
          user_name: name.presence,
          status: "open",
          automation_enabled: organization.default_automation_enabled
        )
      end
    end

    def existing_chat(phone)
      Chat.where(organization_id: organization_id.to_s, :external_id.in => BrPhoneVariants.call(phone))
          .order_by(last_message_at: :desc).first
    end
  end
end
