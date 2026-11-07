class ConnectorEvent
  include Mongoid::Document
  include Mongoid::Timestamps

  field :name, type: String
  field :event_name, type: String
  field :description, type: String
  field :method, type: String
  field :url, type: String
  field :headers, type: Array, default: [ [ "Content-Type", "application/json" ] ]
  field :organization_id, type: String
  # variables_path contains the path of the
  # variables to be persisted on response
  field :variables_path, type: Hash, default: {}
  # Used on frontend, raw json
  field :parameters_json, type: String, default: <<~JSON
    {
      "parameter_string": "string value",
      "parameter_integer": 123,
      "parameter_boolean": true
    }
  JSON

  field :parsed_json, type: String

  validate :parameters_json_validator
  validates_presence_of :name, :event_name, :description, :method, :url

  index({ organization_id: 1, event_name: 1 })

  EVENTS_PARAMETERS = {
    create_booking: %w[booking.id
                           booking.external_id
                           booking.date
                           booking.employee_name
                           booking.service_name
                           booking.start_time
                           booking.end_time
                           service.id
                           service.external_id
                           service.name
                           employee.id
                           employee.external_id
                           employee.name],
    delete_booking: %w[booking.id booking.external_id],
    create_employee: %w[employee.id employee.name employee.email],
    update_employee: %w[employee.id employee.name employee.email],
    delete_employee: %w[employee.id],
    create_service: %w[service.id service.name],
    update_service: %w[service.id service.name],
    delete_service: %w[service.id]
  }.freeze

  validates :event_name, inclusion: { in: EVENTS_PARAMETERS.keys.map(&:to_s) }

  def parameters_json_validator
    # `to_s.dup`: nulo é JSON inválido, e `clone` manteria congelado o que vem congelado.
    validate_parameters_json = parameters_json.to_s.dup
    to_parsed_json = parameters_json.to_s.dup

    validate_parameters_json.gsub!(/\{(\w+|\w+\.\w+)\}/) do |_match|
      "\"#{::Regexp.last_match(1)}\""
    end
    # Validate JSON
    JSON.parse(validate_parameters_json)

    to_parsed_json.gsub!(/\{(\w+|\w+\.\w+)\}/) do |_match|
      var_type, var_name = ::Regexp.last_match(1).split(".")

      if %w[system user].include?(var_type)
        variable = custom_field(caption: var_name, type: var_type)

        unless variable
          variable = custom_field(id: var_name, type: var_type)

          errors.add(:parameters_json, "Invalid variable: #{::Regexp.last_match(1)}") unless variable
        end
        "{#{var_type}.#{variable.id}}" if variable
      else
        "{#{::Regexp.last_match(1)}}"
      end
    end
    self.parsed_json = to_parsed_json unless errors.any?
  rescue JSON::ParserError
    errors.add(:parameters_json, "is not a valid JSON")
  end

  # Execute the event
  def execute(payload = {})
    make_request(payload)
  end

  # `CustomField` é do domínio inbox. Enquanto ele não existe, variável nenhuma resolve.
  def custom_field(criteria)
    return nil unless defined?(::CustomField)

    ::CustomField.find_by(organization_id: organization_id, **criteria)
  rescue StandardError
    nil
  end

  private

  def make_request(payload)
    case method&.downcase&.strip
    when "get"
      Rails.logger.info("[ConnectorEvent] GET #{url}\nPayload: #{payload}")
      HTTParty.get(url, headers: headers.to_h)
    when "post"
      Rails.logger.info("[ConnectorEvent] POST #{url}\nPayload: #{payload}")
      HTTParty.post(url, headers: headers.to_h, body: payload)
    when "put"
      Rails.logger.info("[ConnectorEvent] PUT #{url}\nPayload: #{payload}")
      HTTParty.put(url, headers: headers.to_h, body: payload)
    when "patch"
      Rails.logger.info("[ConnectorEvent] PATCH #{url}\nPayload: #{payload}")
      HTTParty.patch(url, headers: headers.to_h, body: payload)
    when "delete"
      Rails.logger.info("[ConnectorEvent] DELETE #{url}\nPayload: #{payload}")
      HTTParty.delete(url, headers: headers.to_h)
    end
  end
end
