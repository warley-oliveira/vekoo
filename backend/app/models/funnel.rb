# Um funil da organização: nome e etapas ordenadas. A posição de cada conversa fica em
# `Chat#funnel_stages` (`{ funnel_id => stage_id }`), no Mongo: ver `ChatRelations::Insights`.
#
# Criar e mudar as etapas passa por `Funnels::Save`, que cuida da lista inteira de uma vez.
class Funnel < ApplicationRecord
  MAX_STAGES = 30
  MAX_PER_ORGANIZATION = 50

  belongs_to :organization
  # A posição é o que dá a ordem do funil, e `created_at` só desempata.
  has_many :stages, -> { order(:position, :created_at) }, class_name: "FunnelStage", inverse_of: :funnel, dependent: :delete_all

  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { maximum: 80 }, uniqueness: { scope: :organization_id, case_sensitive: false }
  validates :description, length: { maximum: 500 }, allow_blank: true
  validate :within_organization_limit, on: :create

  # Apagar a organização leva tudo junto, e aí não há o que limpar nas conversas uma a uma.
  after_destroy_commit :forget_chats, unless: :destroyed_by_association

  private

  def within_organization_limit
    return if organization.nil? || organization.funnels.count < MAX_PER_ORGANIZATION

    errors.add(:base, I18n.t("insights.funnels.errors.too_many_funnels", count: MAX_PER_ORGANIZATION))
  end

  def forget_chats
    Funnels::CleanupChatsJob.perform_later(organization_id, id)
  end
end
