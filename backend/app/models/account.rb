# A conta da pessoa. Uma conta pertence a uma organização e o e-mail é único
# no produto inteiro (convidar a mesma pessoa para várias organizações entra
# em uma etapa futura).
class Account < ApplicationRecord
  ROLES = %w[owner member].freeze
  # Igual ao que a tela valida (zod) — o mesmo mínimo dos dois lados.
  MINIMUM_PASSWORD_LENGTH = 8
  EMAIL_FORMAT = /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/

  belongs_to :organization
  belongs_to :access_role, optional: true

  has_many :team_memberships, dependent: :destroy
  has_many :teams, through: :team_memberships

  has_many :sessions, dependent: :destroy
  has_many :password_resets, dependent: :destroy
  # `nullify` na migration: a conta sai, a imagem fica — o carrossel que a usa
  # continua de pé.
  has_many :uploads, dependent: :nullify

  has_secure_password

  normalizes :email, with: ->(email) { email.strip.downcase }
  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { minimum: 2, maximum: 60 }
  validates :email, presence: true, format: { with: EMAIL_FORMAT }, uniqueness: true
  validates :password, length: { minimum: MINIMUM_PASSWORD_LENGTH }, allow_nil: true
  validates :role, inclusion: { in: ROLES }

  scope :active, -> { where(revoked_at: nil) }

  def owner?
    role == "owner"
  end

  # Dono vê tudo; os demais valem pelo grupo de permissões. Sem grupo, valem os
  # defaults de membro.
  def permission_level(key)
    return "all" if owner?

    (access_role&.permissions || AccessRole::MEMBER_PERMISSIONS)[key.to_s].presence || "none"
  end

  def can?(key)
    permission_level(key) != "none"
  end

  def permission_map
    AccessRole::KEYS.index_with { |key| permission_level(key) }
  end
end
