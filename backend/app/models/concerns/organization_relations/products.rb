# Associações da organização com o domínio "products". Ficam aqui, e não em
# Organization, para cada domínio evoluir sem disputar o mesmo arquivo.
#
# `::Products::` com o prefixo: dentro deste módulo, `Products` seria ele mesmo.
module OrganizationRelations
  module Products
    extend ActiveSupport::Concern

    included do
      has_many :product_items, class_name: "::Products::Item", dependent: :destroy
      has_many :product_categories, class_name: "::Products::Category", dependent: :destroy
      has_many :product_field_definitions, class_name: "::Products::FieldDefinition", dependent: :destroy
      has_many :product_imports, class_name: "::Products::Import", dependent: :destroy
    end
  end
end
