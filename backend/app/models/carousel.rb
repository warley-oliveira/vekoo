# O carrossel é o documento inteiro: tema (as cores da obra) + cards, cada card
# com seus blocos. O formato do jsonb é o mesmo de `frontend/src/lib/doc.ts` —
# o editor salva o documento de uma vez, então não vale a pena quebrar card e
# bloco em tabelas antes de existir edição colaborativa.
class Carousel < ApplicationRecord
  FORMATS = %w[4:5 1:1].freeze
  THEME_KEYS = %w[bg surface ink accent accentInk].freeze

  # Quanto tempo o carrossel fica na lixeira antes de sumir de vez. O número
  # também sai em `GET /catalog` — a tela promete "some em 30 dias" e não deve
  # ser ela a cravar o prazo.
  TRASH_RETENTION = 30.days

  # Ordenações aceitas em `GET /carousels?sort=`. Lista fechada de propósito:
  # `order` com texto de fora é injeção de SQL.
  SORTS = {
    "recent" => { edited_at: :desc },
    "oldest" => { edited_at: :asc },
    "title" => { title: :asc },
    "created" => { created_at: :desc }
  }.freeze

  belongs_to :organization
  belongs_to :folder, optional: true

  normalizes :title, with: ->(title) { title.squish }

  validates :title, presence: true, length: { maximum: 120 }
  validates :format, inclusion: { in: FORMATS }
  validate :theme_must_be_complete
  validate :cards_must_be_a_list

  scope :active, -> { where(trashed_at: nil) }
  scope :trashed, -> { where.not(trashed_at: nil) }
  scope :recent_first, -> { order(edited_at: :desc) }
  scope :trashed_first, -> { order(trashed_at: :desc) }
  scope :expired_trash, -> { trashed.where(trashed_at: ...TRASH_RETENTION.ago) }
  scope :sorted_by, ->(key) { order(SORTS.fetch(key.to_s, SORTS["recent"])) }

  before_validation :stamp_edited_at, on: :create

  def trashed?
    trashed_at.present?
  end

  def trash!
    update!(trashed_at: Time.current)
  end

  def restore!
    update!(trashed_at: nil)
  end

  private

  def stamp_edited_at
    self.edited_at ||= Time.current
  end

  # O tema recolore o carrossel inteiro; faltando uma tinta, o card renderiza
  # com buraco. Melhor recusar na entrada.
  def theme_must_be_complete
    return errors.add(:theme, :invalid) unless theme.is_a?(Hash)

    missing = THEME_KEYS - theme.keys.map(&:to_s)
    errors.add(:theme, :incomplete) if missing.any?
  end

  def cards_must_be_a_list
    return errors.add(:cards, :invalid) unless cards.is_a?(Array)

    errors.add(:cards, :invalid) unless cards.all? { |card| card.is_a?(Hash) }
  end
end
