# Grupo de permissões da organização: um mapa recurso → nível de acesso.
# `none` esconde o recurso do menu e bloqueia a API; qualquer outro valor libera.
class AccessRole < ApplicationRecord
  KEYS = %w[
    dashboard custom_dashboards flows calendar pipelines chat chat_list_to contacts
    catalog funnel campaigns core_settings
  ].freeze

  MANAGER_PERMISSIONS = KEYS.index_with("all").freeze

  MEMBER_PERMISSIONS = KEYS.index_with("none").merge(
    "chat" => "all",
    "chat_list_to" => "all",
    "calendar" => "all",
    "contacts" => "all",
    "catalog" => "all"
  ).freeze

  belongs_to :organization
  has_many :accounts, dependent: :nullify

  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { maximum: 60 }, uniqueness: { scope: :organization_id }

  def self.seed_defaults_for(organization)
    organization.access_roles.find_or_create_by!(name: "Gerente") { |role| role.permissions = MANAGER_PERMISSIONS }
    organization.access_roles.find_or_create_by!(name: "Usuário") { |role| role.permissions = MEMBER_PERMISSIONS }
  end

  def level_for(key)
    permissions[key.to_s].presence || "none"
  end
end
