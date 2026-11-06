module Products
  class FieldDefinitionsController < BaseController
    before_action :set_definition, only: %i[update destroy]

    def index
      definitions = current_organization.product_field_definitions.ordered

      render json: {
        fieldDefinitions: FieldDefinitionSerializer.many(definitions),
        meta: { total: definitions.size },
        valueTypes: FieldDefinition::VALUE_TYPES
      }
    end

    def create
      definition = current_organization.product_field_definitions.new(definition_params)

      if definition.save
        render json: FieldDefinitionSerializer.one(definition), status: :created
      else
        render_invalid(definition)
      end
    end

    # A `key` não entra em `definition_params`: ela é a chave dentro do jsonb
    # `custom_fields` de todo item, e renomeá-la deixaria órfãos os valores existentes.
    def update
      if @definition.update(definition_params)
        render json: FieldDefinitionSerializer.one(@definition)
      else
        render_invalid(@definition)
      end
    end

    # Os valores já preenchidos nos itens continuam no banco.
    def destroy
      @definition.destroy!
      head :no_content
    end

    private

    def set_definition
      @definition = current_organization.product_field_definitions.find(params[:id])
    end

    # `fieldDefinition` no corpo, e não `definition` como na origem: esse nome é um mapa
    # livre em CamelParams (o de fluxo), e as chaves não seriam convertidas.
    def definition_params
      params.require(:field_definition).permit(
        :name, :description, :value_type, :default_value, :required, :searchable, :position,
        option_values: []
      )
    end
  end
end
