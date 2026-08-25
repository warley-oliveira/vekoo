# A organização possui tudo: contas, pastas, carrosséis e avisos. Criar conta
# cria a organização, e quem cria entra como dono.
class Organization < ApplicationRecord
  PLANS = %w[free].freeze

  has_many :accounts, dependent: :destroy
  has_many :folders, dependent: :destroy
  has_many :carousels, dependent: :destroy
  has_many :notifications, dependent: :destroy

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
  def consume_credits(amount)
    amount = amount.to_i
    return false if amount <= 0 || amount > credits_left

    increment!(:credits_used, amount)
  end
end
