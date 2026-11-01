# Uma conta de um lote: o que a Business Discovery devolveu dela (a mediana de
# curtidas + comentários dos posts puxados, que é a régua do engajamento
# relativo de cada candidato) ou por que não devolveu.
class ReferenceImportAccount < ApplicationRecord
  STATUSES = %w[pending running done error].freeze
  # Erro que vale tentar de novo depois (o resto pede outra conta ou outro token).
  RETRYABLE = %w[rateLimited failed].freeze

  belongs_to :reference_import
  has_many :candidates, -> { order(Arel.sql("relative_engagement DESC NULLS LAST"), posted_at: :desc) },
    class_name: "ReferenceCandidate", dependent: :delete_all

  validates :status, inclusion: { in: STATUSES }
  validates :username, presence: true, format: { with: InstagramGraph::Client::USERNAME }

  def retryable? = status == "error" && RETRYABLE.include?(error_code)
end
