# A automação do atendimento: substitui os assistentes da origem. É o `Flows::InboundDispatcher` quem
# decide o que dispara, e `FlowRuntime::Engine` quem executa.
class Flow < ApplicationRecord
  STATUSES = %w[draft published archived].freeze
  TRIGGER_TYPES = %w[
    message_received
    first_message
    keyword
    contact_created
    human_handoff
    manual
    webhook
  ].freeze

  belongs_to :organization
  belongs_to :published_version, class_name: "FlowVersion", optional: true

  # As execuções e as versões saem em cascata, no banco: nenhuma tem callback, e um histórico grande
  # não pode virar um `destroy` por linha na thread da requisição.
  has_many :versions, -> { order(version_number: :desc) }, class_name: "FlowVersion", inverse_of: :flow
  has_many :executions, class_name: "FlowExecution", inverse_of: :flow

  validates :name, presence: true, length: { maximum: 120 }
  validates :description, length: { maximum: 2_000 }, allow_nil: true
  validates :status, inclusion: { in: STATUSES }
  validates :trigger_type, inclusion: { in: TRIGGER_TYPES }
  validate :connector_filter_is_a_map

  scope :published, -> { where(status: "published") }
  scope :for_trigger, ->(type) { where(trigger_type: type) }
  scope :for_organization, ->(organization_id) { where(organization_id: organization_id) }

  after_commit { Flows::TriggerIndex.bust(organization_id) }

  def self.scoped(organization_id, id)
    where(organization_id: organization_id).find_by(id: id)
  end

  def published?
    status == "published" && published_version_id.present?
  end

  def archived?
    status == "archived"
  end

  def draft_version
    versions.where(published_at: nil).reorder(version_number: :desc).first
  end

  def connector_ids
    Array(connector_filter.to_h["connector_ids"]).map(&:to_s)
  end

  def serves_connector?(connector_id)
    connector_ids.empty? || connector_ids.include?(connector_id.to_s)
  end

  # Publica o rascunho e já abre o próximo, com a mesma definição: a versão publicada nunca mais muda.
  #
  # @return [FlowVersion] a versão publicada
  def publish!(version: draft_version, account: nil)
    # Dois cliques em "publicar": o segundo espera a linha e encontra a versão já publicada.
    with_lock do
      next if version.reload.published?

      version.update!(published_at: Time.current)
      update!(
        status: "published",
        published_version: version,
        trigger_type: version.trigger_type.presence || trigger_type
      )
      versions.create!(
        version_number: version.version_number + 1,
        definition: version.definition,
        created_by_account_id: account&.id
      )
    end
    version
  end

  private

  def connector_filter_is_a_map
    errors.add(:connector_filter, :invalid) unless connector_filter.is_a?(Hash)
  end
end
