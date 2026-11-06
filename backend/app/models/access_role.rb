# Grupo de permissões da organização: um mapa recurso → nível de acesso.
# `none` esconde o recurso do menu e bloqueia a API; qualquer outro valor libera.
class AccessRole < ApplicationRecord
  KEYS = %w[
    dashboard custom_dashboards flows calendar pipelines chat chat_list_to contacts
    catalog funnel campaigns core_settings
  ].freeze

  # Como "qualquer valor diferente de none libera", um nível inventado concederia
  # acesso sem ninguém perceber: só entram os níveis que existem.
  LEVELS = %w[all own none].freeze
  # `chat_list_to` não é ligar/desligar: diz quais conversas a pessoa enxerga.
  CHAT_LIST_LEVELS = %w[all team assigned].freeze

  MANAGER_PERMISSIONS = KEYS.index_with("all").freeze

  MEMBER_PERMISSIONS = KEYS.index_with("none").merge(
    "chat" => "all",
    "chat_list_to" => "all",
    "calendar" => "all",
    "contacts" => "all",
    "catalog" => "all"
  ).freeze

  # Ponto de partida de um grupo novo: nada liberado até alguém marcar.
  BLANK_PERMISSIONS = KEYS.index_with("none").merge("chat_list_to" => "all").freeze

  # Os grupos com que toda organização nasce. O valor é o código que a tela traduz;
  # o nome em si é dado e fica em pt-BR.
  DEFAULTS = { "Gerente" => "manager", "Usuário" => "member" }.freeze

  belongs_to :organization
  has_many :accounts, dependent: :nullify

  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { maximum: 60 }, uniqueness: { scope: :organization_id }
  validate :permissions_are_known
  validate :default_keeps_its_name, on: :update, if: :name_changed?

  # Apagar a organização leva tudo junto; só o pedido direto é recusado.
  before_destroy :keep_default_role, unless: :destroyed_by_association

  def self.seed_defaults_for(organization)
    organization.access_roles.find_or_create_by!(name: "Gerente") { |role| role.permissions = MANAGER_PERMISSIONS }
    organization.access_roles.find_or_create_by!(name: "Usuário") { |role| role.permissions = MEMBER_PERMISSIONS }
  end

  def level_for(key)
    permissions[key.to_s].presence || "none"
  end

  def default?
    default_key.present?
  end

  # Pelo nome gravado: enquanto uma renomeação não salva, o grupo continua padrão.
  def default_key
    DEFAULTS[name_was.presence || name]
  end

  private

  def permissions_are_known
    return errors.add(:permissions, :invalid) unless permissions.is_a?(Hash)

    permissions.each do |key, level|
      next errors.add(:permissions, :unknown_key, key: key) unless KEYS.include?(key)

      allowed = key == "chat_list_to" ? CHAT_LIST_LEVELS : LEVELS
      errors.add(:permissions, :unknown_level, key: key) unless allowed.include?(level)
    end
  end

  def default_keeps_its_name
    errors.add(:name, :default_role) if DEFAULTS.key?(name_was)
  end

  def keep_default_role
    return unless default?

    errors.add(:base, :default_role)
    throw :abort
  end
end
