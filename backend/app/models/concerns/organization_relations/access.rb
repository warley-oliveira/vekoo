# Associações da organização com o domínio "access". Ficam aqui, e não em
# Organization, para cada domínio evoluir sem disputar o mesmo arquivo.
#
# Além das associações, os dados de empresa e as preferências do chat (`settings`), e o
# atalho de alertas que a origem tinha na conta.
module OrganizationRelations
  module Access
    extend ActiveSupport::Concern

    CHAT_SETTINGS_DEFAULTS = {
      # Remove a etiqueta "aguardando-operador" quando o operador responde.
      "auto_remove_waiting_operator_tag" => false,
      # Reabre a conversa fechada quando o contato manda mensagem.
      "reopen_conversation_on_inbound_enabled" => false
    }.freeze

    # O flag de reabertura é lido no caminho de toda mensagem recebida: a leitura não
    # pode bater no Postgres a cada mensagem.
    REOPEN_ON_INBOUND_CACHE_TTL = 5.minutes

    CNPJ_DIGITS = 14

    included do
      has_many :organization_alerts, dependent: :delete_all

      has_one_attached :logo do |attachable|
        # PNG: logo costuma ter fundo transparente, e JPEG o pintaria de preto.
        attachable.variant :display, resize_to_limit: [ 512, 512 ], format: :png
      end

      validate :timezone_exists, if: :timezone_changed?
      validate :cnpj_has_every_digit
    end

    class_methods do
      def reopen_on_inbound_cache_key(organization_id)
        "organization.reopen_on_inbound.#{organization_id}"
      end

      # Lê o flag sem instanciar o registro: `pick` traz só a coluna `settings`.
      def reopen_on_inbound_enabled?(organization_id)
        return false if organization_id.blank?

        Rails.cache.fetch(reopen_on_inbound_cache_key(organization_id), expires_in: REOPEN_ON_INBOUND_CACHE_TTL) do
          stored = where(id: organization_id).pick(:settings) || {}
          # O cast tolera booleano, texto e nil: o valor vem de jsonb.
          ActiveModel::Type::Boolean.new.cast(stored.dig("chat_settings", "reopen_conversation_on_inbound_enabled")) || false
        end
      end
    end

    # --- dados da empresa ---------------------------------------------------

    def business_name
      settings.dig("company_info", "business_name")
    end

    def cnpj
      settings.dig("company_info", "cnpj")
    end

    def company_name
      business_name.presence || name
    end

    def clean_cnpj
      cnpj&.gsub(/\D/, "")
    end

    def formatted_cnpj
      return nil unless cnpj
      return cnpj unless clean_cnpj.length == CNPJ_DIGITS

      "#{clean_cnpj[0..1]}.#{clean_cnpj[2..4]}.#{clean_cnpj[5..7]}/#{clean_cnpj[8..11]}-#{clean_cnpj[12..13]}"
    end

    def valid_cnpj?
      clean_cnpj&.length == CNPJ_DIGITS
    end

    # --- preferências do chat -----------------------------------------------

    def chat_settings
      CHAT_SETTINGS_DEFAULTS.merge(settings.fetch("chat_settings", {}))
    end

    def auto_remove_waiting_operator_tag
      chat_settings["auto_remove_waiting_operator_tag"]
    end

    def reopen_conversation_on_inbound_enabled
      chat_settings["reopen_conversation_on_inbound_enabled"]
    end

    # Mescla em vez de substituir: a tela salva uma preferência de cada vez, e mandar
    # só uma não pode apagar a outra. O lock serializa duas gravações na mesma linha,
    # que de outro modo leriam o mesmo jsonb e uma sobrescreveria a outra.
    def update_with_settings!(attributes = {}, company_info: nil, chat_settings: nil)
      with_lock do
        assign_attributes(attributes)
        self.settings = settings.merge(
          { "company_info" => merged_company_info(company_info),
            "chat_settings" => merged_chat_settings(chat_settings) }.compact
        )
        save!
      end

      # Sem invalidar, a mudança levaria até o fim do TTL para valer.
      Rails.cache.delete(self.class.reopen_on_inbound_cache_key(id)) if chat_settings
    end

    # --- alertas --------------------------------------------------------------

    def raise_alert(category:, origin_type:, origin_id:, code:, severity: "error", message: nil, origin_name: nil, metadata: {})
      OrganizationAlert.raise_alert!(
        self,
        category: category,
        origin_type: origin_type,
        origin_id: origin_id,
        code: code,
        severity: severity,
        message: message,
        origin_name: origin_name,
        metadata: metadata
      )
    end

    def resolve_alert(origin_type:, origin_id:, code: nil)
      OrganizationAlert.resolve!(self, origin_type: origin_type, origin_id: origin_id, code: code)
    end

    def resolve_alerts_for_category(category)
      OrganizationAlert.resolve_category!(self, category)
    end

    def active_alert_badges
      OrganizationAlert.active_counts_by_category(self)
    end

    private

    def merged_company_info(given)
      return nil unless given

      fields = given.to_h.stringify_keys.slice("business_name", "cnpj")
      settings.fetch("company_info", {}).merge(fields.transform_values { |value| value.to_s.strip.presence })
    end

    def merged_chat_settings(given)
      return nil unless given

      flags = given.to_h.stringify_keys.slice(*CHAT_SETTINGS_DEFAULTS.keys)
      settings.fetch("chat_settings", {}).merge(
        flags.transform_values { |value| ActiveModel::Type::Boolean.new.cast(value) || false }
      )
    end

    def timezone_exists
      TZInfo::Timezone.get(timezone.to_s)
    rescue TZInfo::InvalidTimezoneIdentifier
      errors.add(:timezone, :invalid)
    end

    def cnpj_has_every_digit
      errors.add(:cnpj, :invalid) if cnpj.present? && !valid_cnpj?
    end
  end
end
