# O histórico de uma campanha, na linha do tempo do monitor. Origem: Campaign::ActivityLog.
module Outreach
  class ActivityLog
    include Mongoid::Document
    include Mongoid::Timestamps

    ACTIONS = %w[
      created scheduled launched paused resumed cancelled completed
      launch_failed channel_stopped channel_resumed
    ].freeze

    belongs_to :campaign, class_name: "Outreach::Campaign", inverse_of: :activity_logs

    field :action, type: String
    # Vazio quando quem fez foi a própria plataforma.
    field :account_id, type: String
    field :metadata, type: Hash, default: {}

    validates :action, presence: true, inclusion: { in: ACTIONS }

    index({ campaign_id: 1, created_at: -1 })
  end
end
