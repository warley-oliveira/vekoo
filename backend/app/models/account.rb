# A conta da pessoa. Uma conta pertence a uma organização e o e-mail é único
# no produto inteiro (convidar a mesma pessoa para várias organizações entra
# em uma etapa futura).
class Account < ApplicationRecord
  ROLES = %w[owner member].freeze
  # Igual ao que a tela valida (zod) — o mesmo mínimo dos dois lados.
  MINIMUM_PASSWORD_LENGTH = 8
  EMAIL_FORMAT = /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/

  belongs_to :organization

  has_many :sessions, dependent: :destroy
  has_many :password_resets, dependent: :destroy

  has_secure_password

  normalizes :email, with: ->(email) { email.strip.downcase }
  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { minimum: 2, maximum: 60 }
  validates :email, presence: true, format: { with: EMAIL_FORMAT }, uniqueness: true
  validates :password, length: { minimum: MINIMUM_PASSWORD_LENGTH }, allow_nil: true
  validates :role, inclusion: { in: ROLES }

  def owner?
    role == "owner"
  end
end
