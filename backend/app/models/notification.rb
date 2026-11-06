# Aviso do produto. Guarda a **chave** de tradução, nunca o texto: a frase é
# interface e pertence à tela. É da organização inteira, inclusive o "lido": quem lê,
# lê por todos. O aviso para uma pessoa específica é o `AccountNotice`.
class Notification < ApplicationRecord
  KEYS = %w[templates folders welcome].freeze

  belongs_to :organization

  validates :key, presence: true, inclusion: { in: KEYS }

  scope :recent_first, -> { order(notified_at: :desc) }
  scope :unread, -> { where(read: false) }
  scope :already_read, -> { where(read: true) }

  def mark_as_read!
    update!(read: true) unless read
  end

  # Tirar da lista. Como o aviso é da organização, sai para todo mundo.
  def dismiss!
    destroy!
  end
end
