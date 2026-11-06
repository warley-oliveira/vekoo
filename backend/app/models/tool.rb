# O catálogo de ferramentas: igual para toda organização, sem dono. Instalar uma copia as funções dela
# para a organização (`Tools::InstallService`). O CRUD do catálogo era painel interno da origem e não
# veio: quem alimenta é a semente.
class Tool
  include Mongoid::Document
  include Mongoid::Timestamps

  field :name, type: String
  field :slug, type: String
  field :description, type: String
  field :image_url, type: String
  field :icon, type: String # nome de ícone Iconify
  field :color, type: String # hex, de fundo quando não há image_url
  field :category, type: String
  field :active, type: Boolean, default: true
  field :credentials_schema, type: Array, default: []
  field :function_templates, type: Array, default: []

  validates :name, :slug, :description, presence: true
  validates :slug, uniqueness: true

  index({ slug: 1 }, { unique: true })
  index({ active: 1, category: 1 })

  before_validation :generate_slug

  scope :active, -> { where(active: true) }

  def requires_credentials?
    credentials_schema.any?
  end

  private

  def generate_slug
    self.slug ||= name.to_s.parameterize
  end
end
