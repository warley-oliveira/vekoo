# Associações da organização com o domínio "connectors". Ficam aqui, e não em
# Organization, para cada domínio evoluir sem disputar o mesmo arquivo.
#
# Conversas e conectores vivem no Mongo, por isso são consultas e não `has_many`.
#
# Também mora aqui o que na origem era coluna do assistente e agora é configuração da
# organização, em `settings`:
#
#   automation_enabled            desliga todo disparo de fluxo da organização (padrão: true)
#   default_automation_enabled    automação das conversas novas (padrão: true)
#   automation_pause_period       minutes | hours | days | disabled (padrão: disabled)
#   automation_pause_time_to      quantidade do período acima (padrão: 1)
#   business_work_enabled         liga a janela de atendimento (ver BusinessWorkWindow)
#   business_work                 dias e horários da janela
#   auto_clear_context_enabled    limpa o contexto da conversa depois de inatividade (padrão: false)
#   auto_clear_context_interval   horas de inatividade para isso (padrão: 48)
#   flow_debounce_seconds         quanto o fluxo espera a pessoa terminar de escrever (0 a 60; padrão: 3)
module OrganizationRelations
  module Connectors
    extend ActiveSupport::Concern

    AUTOMATION_PAUSE_PERIODS = %w[disabled minutes hours days].freeze

    included do
      include BusinessWorkWindow

      has_many :oauth_credentials, dependent: :destroy
      has_many :daily_chat_stats, dependent: :destroy

      validate :automation_pause_period_is_known, if: :settings_changed?
    end

    def connectors
      Connector::Base.where(organization_id: id)
    end

    def chats
      Chat.where(organization_id: id)
    end

    def chat_tags
      ChatTag.where(organization_id: id)
    end

    def automation_enabled?
      chat_setting("automation_enabled", default: true)
    end

    def default_automation_enabled
      chat_setting("default_automation_enabled", default: true)
    end

    def automation_pause_period
      settings.to_h["automation_pause_period"].presence || "disabled"
    end

    def automation_pause_time_to
      settings.to_h["automation_pause_time_to"].presence&.to_i || 1
    end

    def auto_clear_context_enabled
      chat_setting("auto_clear_context_enabled", default: false)
    end

    def auto_clear_context_interval
      settings.to_h["auto_clear_context_interval"].presence&.to_i || 48
    end

    # Mescla em vez de substituir (a tela salva um grupo de cada vez), com lock pelo mesmo motivo
    # de `update_with_settings!`: duas gravações na linha leriam o mesmo jsonb.
    def update_automation_settings!(values)
      with_lock do
        self.settings = settings.merge(values.to_h.stringify_keys)
        save!
      end
    end

    private

    def automation_pause_period_is_known
      return if AUTOMATION_PAUSE_PERIODS.include?(automation_pause_period)

      errors.add(:base, I18n.t("connectors.automation.invalid_pause_period"))
    end

    def chat_setting(key, default:)
      value = settings.to_h[key]
      value.nil? ? default : ActiveModel::Type::Boolean.new.cast(value)
    end
  end
end
