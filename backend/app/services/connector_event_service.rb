# frozen_string_literal: true

class ConnectorEventService
  def initialize(organization, chat)
    @organization = organization
    @chat = chat
  end

  def create_booking_connector_call(booking)
    connector_call(booking, 'create_booking')
  end

  def delete_booking_connector_call(booking)
    connector_call(booking, 'delete_booking')
  end

  def create_employee_connector_call(employee)
    connector_call(employee, 'create_employee')
  end

  def update_employee_connector_call(employee)
    connector_call(employee, 'update_employee')
  end

  def delete_employee_connector_call(employee)
    connector_call(employee, 'delete_employee')
  end

  def create_service_connector_call(service)
    connector_call(service, 'create_service')
  end

  def update_service_connector_call(service)
    connector_call(service, 'update_service')
  end

  def delete_service_connector_call(service)
    connector_call(service, 'delete_service')
  end

  private

  CAPTION_PREFIXES = {
    'create_booking' => 'booking',
    'delete_booking' => 'booking',
    'create_employee' => 'employee',
    'update_employee' => 'employee',
    'delete_employee' => 'employee',
    'create_service' => 'service',
    'update_service' => 'service',
    'delete_service' => 'service'
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
        elsif ::Regexp.last_match(1).start_with?('user') || ::Regexp.last_match(1).start_with?('system')
          var_value = get_variable(::Regexp.last_match(1).split('.')[1])
          var_value ? "\"#{var_value}\"" : 'null'
        end
      end

      response = event.execute(payload)

      # Assign variables
      if [200, 201].include?(response.code)
        Rails.logger.info(" ** Event #{event.event_name} executed successfully **")
        booking.update(external_id: response['id']) if event_name == 'create_booking' && response['id'].present?
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
    when 'Agenda::Booking'
      {
        'booking.id' => model.id.to_s,
        'booking.external_id' => model.external_id,
        'booking.employee_name' => model.professional.name,
        'booking.service_name' => model.service.name,
        'booking.start_time' => model.start.strftime('%Y-%m-%dT%H:%M'),
        'booking.end_time' => model.end.strftime('%Y-%m-%dT%H:%M'),
        'service.id' => model.service.id.to_s,
        'service.external_id' => model.service.external_id,
        'service.name' => model.service.name,
        'employee.id' => model.professional.id.to_s,
        'employee.external_id' => model.professional.external_id,
        'employee.name' => model.professional.name,
        'customer.name' => model.chat.user_name,
        'customer.number' => model.chat.external_id.split('@').first
      }
    when 'Agenda::Professional'
      {
        'employee.id' => model.id,
        'employee.name' => model.name,
        'employee.email' => model.email
      }
    when 'Agenda::Offering'
      {
        'service.id' => model.id,
        'service.name' => model.name
      }
    end
  end

  # Assign variavle
  def assign_variable(json, event)
    event.variables_path.each do |definition_id, json_path|
      data = json.dig(*json_path.split('.').map { _1.match(/\A\d+\z/) ? _1.to_i : _1 })
      next unless defined?(::CustomField)

      definition = CustomField.find_by(id: definition_id, organization_id: @organization.id)
      case definition.type
      when 'user'
        CustomFieldValue.find_or_create_by(
          definition: definition,
          audience: @chat.audience
        ).update(value: data)
      when 'system'
        CustomFieldValue.find_or_create_by(definition: definition)
                               .update(value: data)
      end
    rescue Mongoid::Errors::DocumentNotFound
      Rails.logger.error("Variable not found `#{definition_id}` on organization `#{@organization.id}`")
      nil
    rescue StandardError => e
      Rails.logger.error("Error assigning variable `#{definition.name}` with path `#{json_path}`: #{e.full_message}")
    end
  end

  # Get variable value
  def get_variable(value_caption)
    return nil unless defined?(::CustomField)

    definition = CustomField.find_by(id: value_caption, organization_id: @organization.id)

    case definition.type
    when 'user'
      CustomFieldValue.find_by(
        definition: definition,
        chat: @chat
      ).try(:value) || definition.default_value
    when 'system'
      CustomFieldValue.find_by(
        definition: definition
      ).try(:value) || definition.default_value
    end
  rescue Mongoid::Errors::DocumentNotFound
    Rails.logger.error("Variable not found `#{value_caption}`")
    nil
  rescue StandardError => e
    Rails.logger.error("Error getting variable `#{value_caption}`: #{e.full_message}")
    nil
  end
end
