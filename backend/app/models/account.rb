# O vínculo de uma pessoa (`User`) com uma organização: papel, grupo de permissões,
# departamentos e revogação. Uma pessoa tem um vínculo por organização. O nome ficou `Account`
# de propósito: todo `account_id` gravado no Postgres e no Mongo continua valendo.
#
# A identidade (nome, e-mail, telefone, idioma, foto, senha) é do `User` e vale em todas as
# organizações. Para o código que já lia `account.name`, ela continua aqui por delegação; e
# atribuir `name`/`email`/`password` num vínculo novo monta o `User` junto (convite, cadastro,
# semente, factories).
#
# `support: true` é o vínculo que o suporte do Vekoo (`User#master`) ganha ao entrar numa
# organização: dá o hashid da URL e o autor das ações, e não aparece em Pessoas, contagens,
# seletores nem atribuição (`Organization#accounts` não o enxerga).
class Account < ApplicationRecord
  ROLES = %w[owner member].freeze
  MINIMUM_PASSWORD_LENGTH = User::MINIMUM_PASSWORD_LENGTH
  EMAIL_FORMAT = User::EMAIL_FORMAT
  # Como o cliente vê o autor das ações do suporte: nome do produto, não da pessoa.
  SUPPORT_NAME = "Suporte Vekoo"
  IDENTITY_WRITERS = %i[name email phone locale password password_confirmation].freeze

  belongs_to :organization
  belongs_to :user, autosave: true
  belongs_to :access_role, optional: true

  has_many :team_memberships, dependent: :destroy
  has_many :teams, through: :team_memberships
  # `nullify` na migration: a conta sai, a imagem fica — o carrossel que a usa
  # continua de pé.
  has_many :uploads, dependent: :nullify

  delegate :email, :phone, :locale, :avatar, :sessions, :password_resets, :push_devices,
    :authenticate, :master?, to: :user, allow_nil: true

  # Na origem o campo aceitava nulo, que queria dizer "atende normalmente".
  normalizes :setup_only, with: ->(setup_only) { setup_only || false }, apply_to_nil: true

  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :organization_id }, if: -> { user_id.present? }
  validate :access_role_belongs_to_organization
  validate :identity_is_valid

  # O Mongo não tem chave estrangeira: os avisos da pessoa saem junto com ela.
  after_destroy { AccountNotice.where(account_id: id).delete_all }
  after_destroy_commit :disconnect_realtime
  after_update_commit :reconnect_realtime, if: -> { saved_change_to_access_role_id? || saved_change_to_role? }

  scope :active, -> { where(revoked_at: nil) }
  scope :revoked, -> { where.not(revoked_at: nil) }
  scope :members, -> { where(support: false) }
  scope :with_identity, -> { joins(:user) }
  scope :with_email, ->(email) { joins(:user).where(users: { email: email.to_s.strip.downcase }) }
  scope :by_name, -> { joins(:user).order("users.name", "accounts.id") }
  # A foto é da pessoa: o `with_attached_avatar` de antes, agora pelo `User`.
  scope :with_attached_avatar, -> { includes(user: { avatar_attachment: :blob }) }

  IDENTITY_WRITERS.each do |attribute|
    define_method(:"#{attribute}=") { |value| identity.public_send(:"#{attribute}=", value) }
  end

  # --- hashid ---------------------------------------------------------------

  def self.hashids
    Rails.configuration.x.account_hashid
  end

  def self.decode_hashid(hashid)
    return nil unless hashid.is_a?(String) && hashid.match?(/\A[a-z0-9]{1,32}\z/)

    hashids.decode(hashid).first
  rescue Hashids::InputError
    nil
  end

  # O vínculo de uma pessoa pelo hashid. `nil` tanto para o que não existe quanto para o de
  # outra pessoa: quem chama responde igual aos dois, sem dizer se a organização existe.
  def self.find_by_hashid_for(user, hashid)
    number = decode_hashid(hashid)
    return nil unless user && number

    find_by(number: number, user_id: user.id)
  end

  def hashid
    number && self.class.hashids.encode(number)
  end

  # --- e-mail, nome -----------------------------------------------------------

  # O vínculo mais antigo de quem tem esse e-mail; com `organization`, o daquela organização; com
  # `role`, só com aquele papel (as sementes acham a organização de demonstração pela dona).
  def self.for_email(email, organization: nil, role: nil)
    scope = joins(:user).where(users: { email: email.to_s.strip.downcase }, support: false)
    scope = scope.where(organization_id: organization.is_a?(Organization) ? organization.id : organization) if organization
    scope = scope.where(role: role) if role
    scope.order(:created_at).first
  end

  # `{ id => nome }`, para listar autores e responsáveis.
  def self.names_by_id
    joins(:user).pluck("accounts.id", "users.name", "accounts.support").to_h do |id, name, support|
      [ id, support ? SUPPORT_NAME : name ]
    end
  end

  def name
    support? ? SUPPORT_NAME : user&.name
  end

  def identity
    user || build_user
  end

  # --- papel e permissões ---------------------------------------------------

  def owner?
    role == "owner"
  end

  # Quem vê e pode tudo: o dono, o vínculo de suporte e o suporte do Vekoo em qualquer vínculo.
  def full_access?
    owner? || support? || master? || false
  end

  def revoked?
    revoked_at.present?
  end

  # O vínculo vale para esta pessoa agora? O de suporte só enquanto ela for suporte; o comum,
  # enquanto não for revogado. O suporte do Vekoo entra mesmo num vínculo revogado.
  def usable_by?(someone)
    return false unless someone && user_id == someone.id
    return someone.master? if support?

    !revoked? || someone.master?
  end

  # Corta o acesso sem apagar nada: as conversas, os cards e o histórico da pessoa
  # continuam apontando para ela. Idempotente — quem já foi revogado mantém a data
  # original, que é a que importa para saber quando o acesso foi cortado.
  #
  # A sessão é da pessoa, e ela pode ter outras organizações: só cai se este era o último
  # vínculo, que é quando o token passa a responder `accessRevoked`.
  def revoke!(at: Time.current)
    return if revoked?

    transaction do
      update!(revoked_at: at)
      if user.locked_out?
        Session.remember_revoked(user.sessions)
        user.sessions.destroy_all
      end
    end
    disconnect_realtime
  end

  def restore!
    return unless revoked?

    update!(revoked_at: nil)
  end

  # Derruba as sessões da pessoa (são dela, não do vínculo). Ver `User#end_sessions!`.
  def end_sessions!(except: nil)
    user.end_sessions!(except: except)
  end

  # A permissão é conferida ao assinar o canal, e a conexão guarda a conta enquanto ficar aberta: quem
  # perdeu um acesso seguiria recebendo eventos e enviando mensagem. Reconectando, passa pela conferência
  # de novo, com o que vale agora.
  def reconnect_realtime
    disconnect_realtime(reconnect: true)
  end

  # Dono e suporte veem tudo; os demais valem pelo grupo de permissões. Sem grupo, valem os
  # defaults de membro.
  def permission_level(key)
    return "all" if full_access?

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
  def disconnect_realtime(reconnect: false)
    ActionCable.server.remote_connections.where(current_account: self).disconnect(reconnect: reconnect)
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

  # Os erros do `User` saem com o nome do campo, como antes da separação: `field: "email"`.
  def identity_is_valid
    errors.attribute_names.select { |name| name.to_s.start_with?("user.") }.each { |name| errors.delete(name) }
    return if user.nil? || (user.persisted? && !user.changed?)

    errors.delete(:user)
    return if user.valid?

    user.errors.each { |error| errors.import(error) }
  end
end
