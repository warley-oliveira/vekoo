module ToolFunction
  # Função em JavaScript, que roda no motor de scripts (docs/migration/api/script-engine.md). Na origem era do
  # assistente (`admin_organization_id`) ou do workspace (`admin_core_account_id`). Aqui é sempre da organização.
  #
  # Dentro desta classe, `MiniRacer` é ela mesma: o motor é `::MiniRacer`.
  class MiniRacer < Base
    # Até onde a API de ferramentas aceita, e sem nome igual: o modelo recusa a lista inteira.
    NAME_FORMAT = /\A[a-zA-Z0-9_-]{1,64}\z/
    MAX_CODE_BYTES = 256.kilobytes

    field :tool_installation_id, type: String
    field :parameters, type: Array, default: []
    field :js_code, type: String, default: "return 'Hello World!'\n"
    field :parameters_json, type: String

    validates :name, :description, :js_code, :organization_id, presence: true
    validate :name_fits_the_model
    validate :code_within_limit

    index({ organization_id: 1, tool_installation_id: 1 })

    before_validation :normalize_name
    before_save :normalize_parameters
    before_save { self.parameters_json = JSON.pretty_generate(transform_to_schema) }

    def installed?
      tool_installation_id.present?
    end

    def installation
      return nil unless installed?

      @installation ||= ToolInstallation.scoped(organization_id, tool_installation_id)
    end

    # Função de ferramenta desligada ou sem a instalação não roda: a credencial não pode passar.
    def runnable?
      !installed? || installation&.enabled == true
    end

    def credentials
      installation&.credentials if installed? && runnable?
    end

    # Roda o script. Sempre em job na fila `scripts`, nunca na thread do Puma.
    #
    # @return [Object] o resultado do script, em JSON puro
    # @raise [::MiniRacer::Error, MiniRacerEngine::Error]
    def invoke(params, organization:, chat: nil, timeout_ms: nil, &on_event)
      raise MiniRacerEngine::Error, "Tool is disabled" unless runnable?

      MiniRacerService.new(organization, chat, credentials: credentials)
                      .run(js_code, params.to_h, timeout_ms: timeout_ms, &on_event)
                      .result
    end

    def input_schema
      JSON.parse(parameters_json.presence || transform_to_schema.to_json)
    rescue JSON::ParserError
      { "type" => "object", "properties" => {} }
    end

    def transform_to_schema
      output = { "type" => "object", "properties" => {}, "required" => [] }

      parameters.each do |item|
        param = { "type" => item["type"], "description" => item["description"] }
        param["enum"] = item["enum"] if item["enum"].present?

        if item["type"] == "array" && item["items_properties"].present?
          param["items"] = build_items_schema(item)
          param["minItems"] = item["min_items"].to_i if item["min_items"].present?
        elsif item["type"] == "array"
          param["items"] = { "type" => item["items_type"].presence || "string" }
        end

        output["properties"][item["name"]] = param
        output["required"] << item["name"] if [ "true", true ].include?(item["required"])
      end

      output
    end

    private

    def build_items_schema(item)
      schema = { "type" => item["items_type"] || "object" }
      return schema unless item["items_properties"].is_a?(Array)

      schema["properties"] = {}
      schema["required"] = []

      item["items_properties"].each do |prop|
        prop_schema = { "type" => prop["type"], "description" => prop["description"] }
        prop_schema["enum"] = prop["enum"] if prop["enum"].present?

        if prop["type"] == "array" && prop["items_properties"].present?
          prop_schema["items"] = build_items_schema(prop)
        elsif prop["type"] == "array" && prop["items_type"].present?
          prop_schema["items"] = { "type" => prop["items_type"] }
        end

        schema["properties"][prop["name"]] = prop_schema
        schema["required"] << prop["name"] if [ "true", true ].include?(prop["required"])
      end

      schema.delete("required") if schema["required"].empty?
      schema
    end

    def normalize_name
      self.name = name.to_s.parameterize.underscore if name.present?
    end

    def normalize_parameters
      self.parameters = Array(parameters).map do |item|
        item = item.to_h.stringify_keys
        item["name"] = item["name"].to_s.strip.gsub(" ", "_")
        item
      end
    end

    def name_fits_the_model
      return if name.blank? || name.match?(NAME_FORMAT)

      errors.add(:name, :invalid)
    end

    def code_within_limit
      errors.add(:js_code, :too_long, count: MAX_CODE_BYTES) if js_code.to_s.bytesize > MAX_CODE_BYTES
    end
  end
end
