module BusinessWorkWindow
  # Converge form legado, API e tool de IA para o mesmo formato: dias em Array,
  # `enabled`/`day_of_week` como string e janelas sem campos vazios. `enabled`
  # ausente vale 'false' (checkbox desmarcado no form legado não envia nada).
  module Normalizer
    module_function

    def call(business_work)
      data = business_work.respond_to?(:to_unsafe_h) ? business_work.to_unsafe_h : business_work
      return business_work unless data.is_a?(Hash)

      data = data.deep_stringify_keys
      data['days'] = days(data['days']) if data.key?('days')
      data
    end

    def days(days)
      days = days.values if days.is_a?(Hash)
      Array(days).filter_map do |day|
        next unless day.is_a?(Hash) && day['day_of_week'].present?

        {
          'day_of_week' => day['day_of_week'].to_s,
          'enabled' => day['enabled'].to_s == 'true' ? 'true' : 'false',
          'windows' => windows(day['windows'])
        }
      end
    end

    def windows(windows)
      windows = windows.values if windows.is_a?(Hash)
      Array(windows).filter_map do |window|
        next unless window.is_a?(Hash) && window['start'].present? && window['end'].present?

        { 'start' => window['start'].to_s.strip, 'end' => window['end'].to_s.strip }
      end
    end
  end
end
