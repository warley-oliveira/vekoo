# Um par do teste lado a lado (Fase 3): o mesmo pedido, na mesma marca, gerado
# com os padrões do banco de referências (`references`) e sem (`plain`), cada
# lado num canto sorteado. O par de controle tem `plain` dos dois lados.
#
# `copied_sides`: os lados em que alguma peça parece cópia de um post real —
# o alarme que barra ligar a busca, mesmo que ela vença.
#
# A curadoria vê `left`/`right` e nunca o braço: `*_arm` não sai em resposta
# nenhuma até a rodada inteira estar avaliada (`Results`).
class ReferenceEvalPair < ApplicationRecord
  ARMS = %w[references plain].freeze
  VERDICTS = %w[left right tie].freeze
  # O porquê de uma escolha, opcional.
  REASONS = %w[hook structure copy visual].freeze
  SIDES = %w[left right].freeze
  MAX_USABLE = 3

  belongs_to :brand_core
  belongs_to :decided_by, class_name: "Account", optional: true

  normalizes :reasons, :copied_sides, with: ->(values) { Array(values).map(&:to_s).compact_blank.uniq }, apply_to_nil: true

  validates :round, :request_key, :request_text, presence: true
  validates :left_arm, :right_arm, inclusion: { in: ARMS }
  validates :verdict, inclusion: { in: VERDICTS }, allow_nil: true
  validates :usable_left, :usable_right, numericality: { only_integer: true, in: 0..MAX_USABLE }, allow_nil: true
  validates :notes, length: { maximum: 1_000 }
  validate :reasons_must_be_known

  scope :in_round, ->(round) { where(round: round.to_s).order(:position) }
  scope :decided, -> { where.not(verdict: nil) }

  def decided? = verdict.present?

  def arm(side) = side.to_s == "left" ? left_arm : right_arm

  def piece_ids(side) = side.to_s == "left" ? left_piece_ids : right_piece_ids

  # O braço que venceu, ou "tie".
  def winner
    return unless decided?

    verdict == "tie" ? "tie" : arm(verdict)
  end

  private

  def reasons_must_be_known
    errors.add(:reasons, :inclusion) if (reasons - REASONS).any?
    errors.add(:copied_sides, :inclusion) if (copied_sides - SIDES).any?
  end
end
