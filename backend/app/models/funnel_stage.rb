# Uma etapa do funil. O id é o que fica gravado na conversa: renomear não desloca ninguém.
class FunnelStage < ApplicationRecord
  belongs_to :funnel, inverse_of: :stages

  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { maximum: 60 }
end
