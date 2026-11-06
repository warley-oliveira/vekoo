# Campo personalizado do contato (origem: InstanceVariable::Definition). Os valores ficam
# denormalizados em `Chat#custom_attributes[key]`, **sempre como texto**: é por isso que as
# comparações numéricas convertem na hora (ver Chats::Filters).
class CustomField
  include Mongoid::Document
  include Mongoid::Timestamps

  VALUE_TYPES = %w[text number list checkbox date].freeze
  # Auditoria das normalizações em massa, com teto: `mapping` pode ter 500 pares, e o documento
  # é lido a cada mensagem que muda um atributo.
  MAX_NORMALIZATION_HISTORY = 20
  TARGET_KEY_FORMAT = /\A[a-z0-9_]+\z/

  field :organization_id, type: String
  field :name, type: String
  field :key, type: String
  field :description, type: String
  field :value_type, type: String
  field :option_values, type: Array, default: []
  field :default_value, type: String
  field :normalization_history, type: Array, default: []
  # Normalização na escrita (ver ChatRelations::Inbox): todo valor gravado neste campo vira
  # texto numérico canônico por CustomAttributes::ValueNormalizer. Se não houver número no
  # valor, o original fica como está.
  field :auto_normalize, type: Boolean, default: false
  field :normalization_strategy, type: String, default: "min"
  # Presente: o valor normalizado vai para custom_attributes.<normalization_target_key> e o
  # campo original é preservado.
  field :normalization_target_key, type: String

  # Consultado pelo before_save de Chat quando custom_attributes muda.
  index({ organization_id: 1, key: 1 })

  has_many :values, class_name: "CustomFieldValue", inverse_of: :custom_field, dependent: :destroy

  before_validation :set_caption

  validates :name, :value_type, :organization_id, presence: true
  validate :key_not_taken
  validates :value_type, inclusion: { in: VALUE_TYPES }, allow_blank: true
  validates :normalization_strategy, inclusion: { in: CustomAttributes::ValueNormalizer::STRATEGIES }, allow_nil: true
  validates :normalization_target_key, format: { with: TARGET_KEY_FORMAT }, allow_blank: true

  def self.scoped(organization_id, id)
    where(organization_id: organization_id.to_s, id: id).take
  end

  private

  # A chave nasce do nome, e é o nome que a pessoa preenche: é nele que o erro tem onde aparecer.
  def key_not_taken
    return if key.blank?

    errors.add(:name, :taken) if self.class.where(organization_id: organization_id, key: key, :_id.ne => id).exists?
  end

  def set_caption
    self.name = name.to_s.strip
    # A chave não muda ao renomear: é por ela que os valores estão gravados nas conversas.
    self.key = name.parameterize.underscore if key.blank? && name.present?
    self.option_values = Array(option_values).map(&:to_s).compact_blank
  end
end
