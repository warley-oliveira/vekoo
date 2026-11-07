# frozen_string_literal: true

class ConnectorEventService
  def initialize(organization, chat)
    @organization = organization
    @chat = chat
  end

  def create_booking_connector_call(booking)
    connector_call(booking, "create_booking")
  end

  def delete_booking_connector_call(booking)
    connector_call(booking, "delete_booking")
  end

  def create_employee_connector_call(employee)
    connector_call(employee, "create_employee")
  end

  def update_employee_connector_call(employee)
    connector_call(employee, "update_employee")
  end

  def delete_employee_connector_call(employee)
    connector_call(employee, "delete_employee")
  end

  def create_service_connector_call(service)
    connector_call(service, "create_service")
  end

  def update_service_connector_call(service)
    connector_call(service, "update_service")
  end

  def delete_service_connector_call(service)
    connector_call(service, "delete_service")
  end

  private

  CAPTION_PREFIXES = {
    "create_booking" => "booking",
    "delete_booking" => "booking",
    "create_employee" => "employee",
    "update_employee" => "employee",
    "delete_employee" => "employee",
    "create_service" => "service",
    "update_service" => "service",
    "delete_service" => "service"
  }.freeze

  def connector_call(booking, event_name)
    events = ConnectorEvent.where(
      organization_id: @organization.id,
      event_name: event_name
    )

    Rails.logger.info(" ** Found #{events.count} connector events **")
    events.each do |event|
      Rails.logger.info(" ** Executing event #{event.event_name} **")

      # Make model variables
      variables = make_model_variables_map(booking)
      Rails.logger.info(" ** Variables: #{JSON.pretty_generate(variables)} **")

      # Apply variables on payload
      payload = event.parsed_json.gsub(/\{(\w+|\w+\.\w+)\}/) do |_match|
        if variables[::Regexp.last_match(1)]
          "\"#{variables[::Regexp.last_match(1)]}\""
        elsif ::Regexp.last_match(1).start_with?("user") || ::Regexp.last_match(1).start_with?("system")
          scope, field_id = ::Regexp.last_match(1).split(".")
          var_value = get_variable(scope, field_id)
          var_value ? "\"#{var_value}\"" : "null"
        end
      end

      response = event.execute(payload)

      # Assign variables
      if [ 200, 201 ].include?(response.code)
        Rails.logger.info(" ** Event #{event.event_name} executed successfully **")
        booking.update(external_id: response["id"]) if event_name == "create_booking" && response["id"].present?
        assign_variable(response.parsed_response, event)
      else
        Rails.logger.info(" ** Event #{event.event_name} failed with response: #{response} **")
      end

      Rails.logger.info(" ** Event #{event.event_name} executed with response: #{response} **")
    rescue StandardError => e
      Rails.logger.error(" ** Event #{event.event_name} failed with error: #{e} **")
    end
  end

  def make_model_variables_map(model)
    case model.class.name
    when "Agenda::Booking"
      {
        "booking.id" => model.id.to_s,
        "booking.external_id" => model.external_id,
        "booking.employee_name" => model.professional.name,
        "booking.service_name" => model.service.name,
        "booking.start_time" => model.start.strftime("%Y-%m-%dT%H:%M"),
        "booking.end_time" => model.end.strftime("%Y-%m-%dT%H:%M"),
        "service.id" => model.service.id.to_s,
        "service.external_id" => model.service.external_id,
        "service.name" => model.service.name,
        "employee.id" => model.professional.id.to_s,
        "employee.external_id" => model.professional.external_id,
        "employee.name" => model.professional.name,
        "customer.name" => model.chat.user_name,
        "customer.number" => model.chat.external_id.split("@").first
      }
    when "Agenda::Professional"
      {
        "employee.id" => model.id,
        "employee.name" => model.name,
        "employee.email" => model.email
      }
    when "Agenda::Offering"
      {
        "service.id" => model.id,
        "service.name" => model.name
      }
    end
  end

  # O que a resposta do provedor trouxe vira campo personalizado da conversa, a fonte de verdade
  # dos valores.
  def assign_variable(json, event)
    return unless @chat

    event.variables_path.each do |field_id, json_path|
      data = json.dig(*json_path.split(".").map { _1.match(/\A\d+\z/) ? _1.to_i : _1 })
      field = custom_field(field_id)
      next Rails.logger.error("Variable not found `#{field_id}` on organization `#{@organization.id}`") unless field

      @chat.update(custom_attributes: @chat.custom_attributes.to_h.merge(field.key => data.to_s))
    rescue StandardError => e
      Rails.logger.error("Error assigning variable `#{field_id}` with path `#{json_path}`: #{e.full_message}")
    end
  end

  # `{user.<id>}`: o valor do campo nesta conversa, ou o padrão dele. `{system.<id>}`: o padrão.
  def get_variable(scope, field_id)
    field = custom_field(field_id)
    return Rails.logger.error("Variable not found `#{field_id}`") && nil unless field

    value = @chat&.custom_attributes&.dig(field.key) if scope == "user"
    value.presence || field.default_value
  rescue StandardError => e
    Rails.logger.error("Error getting variable `#{field_id}`: #{e.full_message}")
    nil
  end

  def custom_field(field_id)
    CustomField.where(organization_id: @organization.id.to_s, id: field_id).take
  end
end
