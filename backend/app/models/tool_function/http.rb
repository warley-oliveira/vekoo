module ToolFunction
  # Função que é só uma chamada HTTP. Na origem o modelo existia sem nenhum consumidor nem rota, e continua sem
  # rota: fica para o bloco que vier a precisar. A URL vem do cliente, então só sai por `SafeHttp`.
  class Http < Base
    PROPERTY_TYPES = %w[string number integer boolean array object].freeze
    MAX_RESPONSE_BYTES = 5.megabytes

    # `method` na origem: num documento, esse nome esconde o `Object#method` do Ruby.
    field :http_method, type: String
    field :url, type: String
    field :headers, type: Array, default: [ [ "Content-Type", "application/json" ] ]
    field :parameters_json, type: String, default: { type: "object", properties: {}, required: [] }.to_json

    validates :name, :description, :http_method, :url, :organization_id, presence: true
    validate :parameters_json_is_a_schema

    # @param body [String, nil]
    # @return [SafeHttp::Response]
    # @raise [SafeHttp::Refused]
    def perform(body: nil)
      SafeHttp.request(url, method: http_method, headers: headers.to_h, body: body, max_bytes: MAX_RESPONSE_BYTES)
    end

    private

    def parameters_json_is_a_schema
      parsed = JSON.parse(parameters_json.to_s)
      errors.add(:parameters_json, "The `type` field must be an object.") if parsed["type"] != "object"
      properties = parsed["properties"]
      return errors.add(:parameters_json, "The `properties` field must be defined.") unless properties.is_a?(Hash)

      Array(parsed["required"]).each do |required|
        errors.add(:parameters_json, "The property #{required} not defined.") unless properties.key?(required)
      end
      properties.each do |name, property|
        errors.add(:parameters_json, "The property #{name} has an unknown type.") unless PROPERTY_TYPES.include?(property["type"])
      end
    rescue JSON::ParserError
      errors.add(:parameters_json, "is not valid JSON")
    end
  end
end
