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

  # Teto do documento serializado. Generoso para texto (oito cards com blocos
  # dão poucas dezenas de KB) e apertado para quem tentar guardar imagem dentro.
  MAX_DOCUMENT_BYTES = 1.megabyte

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
  # Opcional só no modelo, por causa do legado (ver `orphans`): criar sem
  # marca é recusado — todo carrossel nasce dentro de uma.
  belongs_to :brand_core, optional: true
  belongs_to :brand_core_version, optional: true

  normalizes :title, with: ->(title) { title.squish }

  validates :title, presence: true, length: { maximum: 120 }
  validates :format, inclusion: { in: FORMATS }
  validate :theme_must_be_complete
  validate :cards_must_be_a_list
  validate :cards_must_not_be_huge
  validate :folder_belongs_to_organization, if: :folder_id_changed?
  validate :must_be_born_in_a_brand, on: :create

  scope :active, -> { where(trashed_at: nil) }
  scope :trashed, -> { where.not(trashed_at: nil) }
  scope :recent_first, -> { order(edited_at: :desc) }
  scope :trashed_first, -> { order(trashed_at: :desc) }
  scope :expired_trash, -> { trashed.where(trashed_at: ...TRASH_RETENTION.ago) }
  scope :sorted_by, ->(key) { order(SORTS.fetch(key.to_s, SORTS["recent"])) }
  scope :in_brand, ->(brand_id) { where(brand_core_id: brand_id) }
  # Legado: o que foi criado antes de existir marca. Some com a migração.
  scope :orphans, -> { where(brand_core_id: nil) }

  before_validation :stamp_edited_at, on: :create
  before_validation :stamp_brand_version, on: :create

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

  # A versão publicada da marca no momento em que o carrossel nasceu — a
  # proveniência mínima que a biblioteca mostra.
  def stamp_brand_version
    return unless brand_core&.published?

    self.brand_core_version ||= brand_core.versions.find_by(number: brand_core.current_version)
  end

  def must_be_born_in_a_brand
    return errors.add(:brand_core, :blank) if brand_core.nil?

    errors.add(:brand_core, :invalid) if brand_core.organization_id != organization_id
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

  # O documento é texto e referência de imagem, nunca a imagem em si. Sem este
  # teto, nada impede alguém de continuar enfiando data URL em base64 no jsonb
  # e inchar o banco — que é exatamente o que o upload de verdade veio resolver.
  # A chave estrangeira só diz que a pasta existe, em qualquer organização.
  def folder_belongs_to_organization
    return if folder_id.blank? || Folder.exists?(id: folder_id, organization_id: organization_id)

    errors.add(:folder_id, :invalid)
  end

  def cards_must_not_be_huge
    return unless cards.is_a?(Array)

    errors.add(:cards, :too_large) if cards.to_json.bytesize > MAX_DOCUMENT_BYTES
  end
end
