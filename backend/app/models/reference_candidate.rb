# Um post candidato a referência. Guarda o que a curadoria precisa para
# escolher — números, tipo, link, uma prévia — e **nunca a legenda**: ela é
# lida de novo na hora da análise e descartada.
class ReferenceCandidate < ApplicationRecord
  STATUSES = %w[pending carded].freeze
  # A partir daqui o post ganha destaque na lista.
  HIGHLIGHT = 1.5

  belongs_to :account, class_name: "ReferenceImportAccount", foreign_key: :reference_import_account_id, inverse_of: :candidates
  belongs_to :reference_card, optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :ig_media_id, presence: true

  def highlight? = relative_engagement.present? && relative_engagement >= HIGHLIGHT
  def video? = media_type == "VIDEO"
  def carded? = status == "carded"

  # O formato de referência do post.
  def reference_format
    return "carousel" if media_type == "CAROUSEL_ALBUM"

    video? ? "reels" : "static"
  end
end
