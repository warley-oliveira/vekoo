# frozen_string_literal: true

# Registra cada evento de desconexão de integrações WhatsApp (Z-API).
# Os documentos expiram automaticamente após 1 ano via índice TTL do MongoDB.
#
# Para criar o índice TTL no MongoDB (rodar uma vez em produção):
#   rake db:mongoid:create_indexes
class Connector::DisconnectionLog
  include Mongoid::Document
  include Mongoid::Timestamps

  # ------------------------------------------------------------------
  # Identificação da integração
  # ------------------------------------------------------------------
  field :connector_id,       type: String  # Connector::WhatsappWeb#id (BSON)
  field :connector_type,     type: String, default: 'whatsapp_api'
  field :instance_name,        type: String  # nome legível da instância Z-API
  field :instance_id,          type: String  # zapi_instance_id / params[:instance_id]
  field :phone_number,         type: String  # número conectado no momento da desconexão
  field :profile_name,         type: String  # nome exibido no WhatsApp

  # ------------------------------------------------------------------
  # Identificação do Workspace
  # ------------------------------------------------------------------
  field :organization_id,      type: String   # Organization#id
  field :organization_name,    type: String   # Organization#name (snapshot)

  # ------------------------------------------------------------------
  # Motivo e contexto do evento
  # ------------------------------------------------------------------
  field :raw_error,            type: String  # payload[:error] original (inglês)
  field :translated_reason,    type: String  # motivo traduzido para pt-BR
  field :payload_snapshot,     type: Hash    # cópia do payload completo para auditoria

  # ------------------------------------------------------------------
  # TTL — expiração automática após 1 ano
  # ------------------------------------------------------------------
  field :expires_at, type: Time

  index({ expires_at: 1 }, { expire_after_seconds: 0 })
  index({ connector_id: 1, created_at: -1 })
  index({ organization_id: 1, created_at: -1 })

  # ------------------------------------------------------------------
  # Convenience
  # ------------------------------------------------------------------

  # Constrói e persiste um log de desconexão a partir do contexto do controller.
  #
  # @param connector [Connector::WhatsappWeb]
  # @param raw_error [String, nil]
  # @param translated_reason [String, nil]
  # @param payload [Hash]
  def self.record!(connector:, raw_error:, translated_reason:, payload: {})
    organization = connector.organization

    create!(
      connector_id: connector.id.to_s,
      instance_name: connector.instance_name,
      instance_id: connector.try(:zapi_instance_id) || connector.try(:instance_id) || connector.id.to_s,
      phone_number: connector.try(:number_id) || connector.try(:phone_number_pairing) || connector.try(:phone_number),
      profile_name: connector.profile_name,
      organization_id: organization&.id,
      organization_name: organization&.name,
      raw_error: raw_error,
      translated_reason: translated_reason,
      payload_snapshot: payload.to_h.slice('type', 'instanceId', 'phone', 'momment', 'disconnected', 'error'),
      expires_at: 1.year.from_now
    )
  rescue StandardError => e
    Rails.logger.error("[DisconnectionLog] Falha ao registrar log de desconexão: #{e.message}")
  end
end
