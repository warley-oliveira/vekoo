# Uma peça. Há dois tipos, e um vai sumindo:
#
#   - **documento** (o caminho de agora): a peça é um `PieceDocument`, salvo
#     em versões (`PieceVersion`); a imagem é derivada dele por um
#     renderizador. Ciclo: generating → draft → approved → scheduled →
#     published (+ failed).
#   - **legada**: a saída de um motor (`engine_id` + `values`) sem equivalente
#     na biblioteca de layouts. Ciclo antigo, de render: queued → rendering →
#     ready | failed. Só leitura.
#
# `provenance` guarda de que versão da marca a peça saiu — é isso que permite
# dizer "a marca mudou desde então" e oferecer a regeneração.
class Piece < ApplicationRecord
  DOCUMENT_STATUSES = %w[generating draft approved scheduled published failed].freeze
  LEGACY_STATUSES = %w[queued rendering ready failed].freeze
  STATUSES = (DOCUMENT_STATUSES + LEGACY_STATUSES).uniq.freeze
  LEGACY_FORMATS = Engines::Manifest::FORMATS

  belongs_to :organization
  belongs_to :brand_core
  belongs_to :brand_core_version, optional: true
  belongs_to :account, optional: true
  # De que pedido da conversa a peça nasceu. Opcional: a peça feita no modo
  # avançado não tem turno, e a conversa some depois de 30 dias enquanto a
  # peça fica.
  belongs_to :agent_turn, optional: true

  has_many_attached :images
  has_many :versions, -> { order(:created_at) }, class_name: "PieceVersion", dependent: :destroy
  belongs_to :current_version, class_name: "PieceVersion", optional: true

  normalizes :title, with: ->(title) { title.squish }

  validates :title, presence: true, length: { maximum: 120 }
  validates :status, inclusion: { in: STATUSES }
  validates :format, inclusion: { in: ->(piece) { piece.legacy? ? LEGACY_FORMATS : PieceDocument::FORMATS.keys } }
  validate :engine_must_exist, if: :legacy?
  validate :format_must_be_supported, if: :legacy?

  scope :recent_first, -> { order(created_at: :desc) }
  scope :for_engine, ->(id) { where(engine_id: id) }

  # Sem documento, a peça é a saída de um motor.
  def legacy? = current_version_id.nil? && engine_id.present?
  def document? = !legacy?

  def document
    current_version&.document
  end

  # Grava o documento como versão nova e a torna a atual. `base_version` é a
  # versão de que a alteração partiu (o conflito entre abas se mede por ela).
  def record_version!(document, source:, summary: nil, account: nil, base_version: current_version)
    transaction do
      version = versions.create!(
        document: document.merge("pieceId" => id), source: source, summary: summary&.first(200),
        account: account, base_version_id: base_version&.id
      )
      update!(current_version: version)
      version
    end
  end

  def entry
    engine_id.present? ? Engines::Registry.find(engine_id) : nil
  end

  def manifest
    entry&.manifest
  end

  def ready? = status == "ready"
  def failed? = status == "failed"
  def pending? = %w[queued rendering].include?(status)

  # Saiu de uma versão anterior da marca: as cores, as fontes ou a voz de hoje
  # não são as que estão impressas. A tela oferece gerar de novo.
  def outdated?
    version = provenance["brandCoreVersion"]
    version.present? && version != brand_core.current_version
  end

  def reset_for_render!
    update!(status: "queued", error: nil)
  end

  private

  def engine_must_exist
    errors.add(:engine_id, :inclusion) unless entry
  end

  def format_must_be_supported
    return unless entry && format.present?

    errors.add(:format, :inclusion) unless manifest.supports?(format)
  end
end
