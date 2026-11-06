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
  has_many :push_devices, dependent: :destroy

  has_one_attached :avatar do |attachable|
    attachable.variant :thumb, resize_to_fill: [ 256, 256 ], format: :jpg, saver: { quality: 85 }
  end

  has_secure_password

  normalizes :email, with: ->(email) { email.strip.downcase }
  normalizes :name, with: ->(name) { name.squish }
  normalizes :phone, with: ->(phone) { phone.strip.presence }
  normalizes :locale, with: ->(locale) { locale.strip.presence }
  # Na origem o campo aceitava nulo, que queria dizer "atende normalmente".
  normalizes :setup_only, with: ->(setup_only) { setup_only || false }, apply_to_nil: true

  validates :name, presence: true, length: { minimum: 2, maximum: 60 }
  validates :email, presence: true, format: { with: EMAIL_FORMAT }, uniqueness: true
  validates :password, length: { minimum: MINIMUM_PASSWORD_LENGTH }, allow_nil: true
  validates :role, inclusion: { in: ROLES }
  validates :phone, length: { maximum: 30 }, allow_nil: true
  validates :locale, inclusion: { in: ->(_) { I18n.available_locales.map(&:to_s) } }, allow_nil: true
  validate :access_role_belongs_to_organization

  # O Mongo não tem chave estrangeira: os avisos da pessoa saem junto com ela.
  after_destroy { AccountNotice.where(account_id: id).delete_all }
  after_destroy_commit :disconnect_realtime

  scope :active, -> { where(revoked_at: nil) }
  scope :revoked, -> { where.not(revoked_at: nil) }

  def owner?
    role == "owner"
  end

  def revoked?
    revoked_at.present?
  end

  # Corta o acesso sem apagar nada: as conversas, os cards e o histórico da pessoa
  # continuam apontando para ela. Idempotente — quem já foi revogado mantém a data
  # original, que é a que importa para saber quando o acesso foi cortado.
  def revoke!(at: Time.current)
    return if revoked?

    transaction do
      update!(revoked_at: at)
      sessions.destroy_all
    end
    disconnect_realtime
  end

  def restore!
    return unless revoked?

    update!(revoked_at: nil)
  end

  # Derruba as sessões abertas, como a troca de senha pelo link já fazia. Com
  # `except`, poupa a sessão de quem está pedindo (e o WebSocket dela).
  def end_sessions!(except: nil)
    scope = except ? sessions.where.not(id: except.id) : sessions
    scope.destroy_all
    disconnect_realtime unless except
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

  private

  # A sessão só é conferida ao conectar: sem isto, um WebSocket já aberto seguiria
  # recebendo eventos depois de a pessoa perder o acesso.
  def disconnect_realtime
    ActionCable.server.remote_connections.where(current_account: self).disconnect(reconnect: false)
  rescue StandardError => e
    Rails.logger.warn("account #{id}: não foi possível derrubar o WebSocket (#{e.class})")
  end

  # O grupo é da organização: um id de outra organização nunca entra, nem aparece
  # como erro de chave estrangeira.
  def access_role_belongs_to_organization
    return if access_role_id.blank?
    return if access_role&.organization_id == organization_id

    errors.add(:access_role_id, :invalid)
  end
end
