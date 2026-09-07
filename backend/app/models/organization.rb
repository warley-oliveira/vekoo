# A organização possui tudo: contas, pastas, carrosséis e avisos. Criar conta
# cria a organização, e quem cria entra como dono.
class Organization < ApplicationRecord
  # Saldo insuficiente. Vive aqui porque quem sabe do saldo é a organização;
  # o controlador só a traduz para o `noCredits` que a tela já conhece.
  class NoCreditsError < StandardError; end

  PLANS = %w[free].freeze

  has_many :accounts, dependent: :destroy
  has_many :folders, dependent: :destroy
  has_many :carousels, dependent: :destroy
  has_many :notifications, dependent: :destroy
  has_many :uploads, dependent: :destroy

  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { minimum: 2, maximum: 60 }
  validates :plan, inclusion: { in: PLANS }
  validates :credits_total, numericality: { greater_than_or_equal_to: 0 }
  validates :credits_used,
    numericality: {
      greater_than_or_equal_to: 0,
      less_than_or_equal_to: ->(org) { org.credits_total }
    }

  def owner
    accounts.find_by(role: "owner")
  end

  def credits_left
    credits_total - credits_used
  end

  # Consome créditos sem nunca passar do total — devolve false se não há saldo.
  #
  # O `with_lock` não é zelo: sem ele, duas requisições que leem `credits_left`
  # ao mesmo tempo passam as duas pela checagem e o `increment!` estoura a
  # check constraint `credits_used <= credits_total` como um 500 sem sentido.
  def consume_credits(amount)
    amount = amount.to_i
    return false if amount <= 0

    with_lock do
      return false if amount > credits_left

      increment!(:credits_used, amount)
      true
    end
  end

  # Reserva antes de gastar — é o caminho da geração por IA, que cobra na
  # entrada e devolve se nada útil sair. Levanta em vez de devolver false
  # porque quem chama está no meio de abrir um stream.
  def reserve_credits!(amount)
    raise NoCreditsError unless consume_credits(amount)

    true
  end

  # Devolve o que foi reservado. Nunca deixa `credits_used` negativo — um
  # estorno duplicado é erro de programa, não motivo para corromper o saldo.
  def refund_credits!(amount)
    amount = amount.to_i
    return false if amount <= 0

    with_lock { decrement!(:credits_used, [ amount, credits_used ].min) }

    true
  end
end
