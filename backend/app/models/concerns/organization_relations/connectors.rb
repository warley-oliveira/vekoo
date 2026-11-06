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
module OrganizationRelations
  module Connectors
    extend ActiveSupport::Concern

    # TTL do cache do flag de reabertura. O hook que o consulta roda no caminho de toda
    # mensagem recebida, então a leitura não pode bater no Postgres a cada mensagem.
    REOPEN_ON_INBOUND_CACHE_TTL = 5.minutes

    included do
      include BusinessWorkWindow

      has_many :oauth_credentials, dependent: :destroy
      has_many :daily_chat_stats, dependent: :destroy
    end

    class_methods do
      def reopen_on_inbound_cache_key(organization_id)
        "org.reopen_on_inbound.#{organization_id}"
      end

      # Lê o flag sem instanciar o registro: `pick` traz só a coluna `features`.
      def reopen_on_inbound_enabled?(organization_id)
        return false if organization_id.blank?

        Rails.cache.fetch(reopen_on_inbound_cache_key(organization_id), expires_in: REOPEN_ON_INBOUND_CACHE_TTL) do
          stored = where(id: organization_id).pick(:features) || {}
          ActiveModel::Type::Boolean.new.cast(stored.with_indifferent_access[:reopen_conversation_on_inbound_enabled]) || false
        end
      end
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

    private

    def chat_setting(key, default:)
      value = settings.to_h[key]
      value.nil? ? default : ActiveModel::Type::Boolean.new.cast(value)
    end
  end
end
