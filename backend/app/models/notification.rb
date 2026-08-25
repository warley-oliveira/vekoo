# Aviso do produto. Guarda a **chave** de tradução, nunca o texto: a frase é
# interface e pertence à tela.
class Notification < ApplicationRecord
  KEYS = %w[templates folders welcome].freeze

  belongs_to :organization

  validates :key, presence: true, inclusion: { in: KEYS }

  scope :recent_first, -> { order(notified_at: :desc) }
  scope :unread, -> { where(read: false) }
end
