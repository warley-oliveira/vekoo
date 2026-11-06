# frozen_string_literal: true

# A conversa de uma pessoa com o copiloto (origem: ChatAssistantConversation). Uma por pessoa, que
# continua de um acesso para outro até ela limpar.
class CopilotThread
  include Mongoid::Document
  include Mongoid::Timestamps

  # Teto de um acumulador: as mensagens moram no próprio documento, que tem limite de tamanho e é
  # lido inteiro a cada mensagem.
  MAX_MESSAGES = 200

  field :account_id, type: String
  field :organization_id, type: String

  index({ account_id: 1, organization_id: 1 }, { unique: true })
  index({ updated_at: -1 })

  embeds_many :messages, class_name: "CopilotThread::Message", inverse_of: :copilot_thread

  validates :account_id, :organization_id, presence: true

  def self.find_or_create_for(account_id:, organization_id:)
    find_or_create_by(account_id: account_id.to_s, organization_id: organization_id.to_s)
  end

  def add_user_message(content)
    append(role: "user", content: content)
  end

  def add_assistant_message(content, changes_applied: nil, tool_activities: nil, content_segments: nil)
    append(
      role: "assistant",
      content: content,
      tool_calls: changes_applied,
      changes_applied: changes_applied,
      tool_activities: tool_activities,
      content_segments: content_segments
    )
  end

  def clear_messages!
    messages.destroy_all
    touch
  end

  def ordered_messages
    messages.sort_by { |message| message.timestamp.to_f }
  end

  # O que o modelo lê a cada turno: só o texto. As ferramentas de um turno anterior não voltam: ele
  # consulta de novo, com o dado de agora.
  def history_for_llm
    ordered_messages.filter_map do |message|
      { role: message.role, content: message.content } if message.content.present?
    end
  end

  # O que a tela recebe ao conectar.
  def messages_for_api
    ordered_messages.map do |message|
      {
        id: message.id.to_s,
        role: message.role,
        content: message.content,
        timestamp: ApplicationSerializer.epoch_ms(message.timestamp),
        toolCalls: message.tool_calls,
        changesApplied: message.changes_applied,
        toolActivities: message.tool_activities,
        contentSegments: message.content_segments
      }
    end
  end

  private

  def append(attributes)
    message = messages.create!(attributes.merge(timestamp: Time.current))
    excess = messages.size - MAX_MESSAGES
    ordered_messages.first(excess).each(&:destroy) if excess.positive?
    message
  end

  class Message
    include Mongoid::Document
    include Mongoid::Timestamps

    embedded_in :copilot_thread, class_name: "CopilotThread", inverse_of: :messages

    field :role, type: String
    field :content, type: String
    field :timestamp, type: Time, default: -> { Time.current }
    field :tool_calls, type: Array
    field :changes_applied, type: Array
    field :tool_activities, type: Array
    # A linha do tempo de texto e atividades, para a tela redesenhar na ordem em que aconteceu.
    field :content_segments, type: Array

    validates :role, inclusion: { in: %w[user assistant] }
    validates :content, presence: true, if: -> { role == "user" }
  end
end
