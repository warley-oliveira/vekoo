# Campos personalizados do contato (origem: InstanceVariable::Definition).
#
# Ler é aberto a qualquer sessão: chat, contatos, pipelines e fluxos mostram os campos, e o nome
# de um campo não é dado de ninguém. Os valores (`values`) e a mudança em massa (`normalize`)
# atravessam as conversas da organização inteira, então são de quem configura, como o resto.
#
# A exceção é `add_option`: na origem quem atende criava opção nova na hora, dentro da conversa,
# reescrevendo o campo inteiro. Aqui é uma rota própria, para ela não abrir o campo todo.
class CustomFieldsController < PlatformController
  include InboxAccess

  MAX_NORMALIZATION_MAPPING = CustomAttributes::NormalizationService::MAX_DISTINCT_VALUES

  # As chaves do mapeamento são valores livres da pessoa, não nomes de campo.
  self.opaque_params += %w[mapping]

  require_any_permission :chat, :core_settings, only: :add_option
  require_permission :core_settings, except: %i[index show add_option]

  before_action :set_custom_field, except: %i[index create]

  def index
    records, meta = paginate(
      current_organization.custom_fields.order_by(updated_at: :desc, _id: :desc),
      per_page: Paginated::MAX_PER_PAGE
    )

    render json: { customFields: CustomFieldSerializer.many(records), meta: meta }
  end

  def show
    render json: { customField: CustomFieldSerializer.one(@custom_field) }
  end

  def create
    custom_field = CustomField.new(custom_field_params.merge(organization_id: current_organization.id.to_s))

    if custom_field.save
      render json: { customField: CustomFieldSerializer.one(custom_field) }, status: :created
    else
      render_invalid(custom_field)
    end
  end

  def update
    if @custom_field.update(custom_field_params)
      render json: { customField: CustomFieldSerializer.one(@custom_field) }
    else
      render_invalid(@custom_field)
    end
  end

  def destroy
    @custom_field.destroy
    head :no_content
  end

  # POST /custom-fields/:id/options { value }. `$addToSet` em vez de regravar a lista: duas
  # pessoas criando opção ao mesmo tempo não se atropelam.
  def add_option
    return render_error(status: :unprocessable_content, code: "notListField", field: "value") unless @custom_field.value_type == "list"

    value = params[:value].to_s.strip
    return render_error(status: :unprocessable_content, code: "unprocessable", field: "value") if value.blank?

    @custom_field.add_to_set(option_values: value) unless option_exists?(value)

    render json: { customField: CustomFieldSerializer.one(@custom_field) }
  end

  # GET /custom-fields/:id/values?startDate=&endDate=
  def values
    render json: CustomAttributes::NormalizationService.new(@custom_field).distinct_values(date_range: date_range_params)
  end

  # POST /custom-fields/:id/normalize
  # { mapping: { "de" => "para" }, convertToNumber, dryRun, targetKey, startDate, endDate }
  #
  # Sem `dryRun`, só mostra a prévia. Na origem, omitir aplicava de vez, e isto muda dados de
  # conversas em massa sem volta.
  def normalize
    mapping = normalization_mapping
    return render_error(status: :unprocessable_content, code: "invalidMapping", field: "mapping") if mapping.nil?

    target_key = params[:target_key].presence
    if target_key && !target_key.to_s.match?(CustomField::TARGET_KEY_FORMAT)
      return render_error(status: :unprocessable_content, code: "invalidTargetKey", field: "targetKey")
    end

    render json: CustomAttributes::NormalizationService.new(@custom_field, account_id: current_account.id).normalize(
      mapping: mapping,
      convert_to_number: boolean_param(:convert_to_number) || false,
      dry_run: params.key?(:dry_run) ? boolean_param(:dry_run) : true,
      target_key: target_key,
      date_range: date_range_params
    )
  end

  private

  def set_custom_field
    @custom_field = CustomField.scoped(current_organization.id, params[:id])
    render_not_found unless @custom_field
  end

  def custom_field_params
    params.expect(
      custom_field: [ :name, :description, :value_type, :default_value, :auto_normalize, :normalization_strategy,
                      :normalization_target_key, { option_values: [] } ]
    ).to_h
  end

  def option_exists?(value)
    Array(@custom_field.option_values).any? { |option| option.to_s.casecmp?(value) }
  end

  def boolean_param(key)
    ActiveModel::Type::Boolean.new.cast(params[key])
  end

  def date_range_params
    start_at = parse_time(params[:start_date])
    end_at = parse_time(params[:end_date])
    return nil unless start_at || end_at

    { start: start_at, end: end_at }
  end

  def parse_time(value)
    return nil if value.blank?

    organization_time_zone.parse(value.to_s)
  rescue ArgumentError
    nil
  end

  # Chaves livres: confere a forma, sem `permit`. nil quando não serve.
  def normalization_mapping
    raw = params[:mapping]
    raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
    return nil unless raw.is_a?(Hash)

    mapping = raw.transform_values(&:to_s)
    return nil if mapping.empty? || mapping.size > MAX_NORMALIZATION_MAPPING

    mapping
  end
end
