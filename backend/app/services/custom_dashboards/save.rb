# frozen_string_literal: true

module CustomDashboards
  # Grava o dashboard e, se vierem, a lista inteira de widgets, como a tela edita: uma lista só. Confere
  # tudo antes de escrever. A origem apagava os widgets e só depois descobria que os novos eram inválidos,
  # e aí o dashboard ficava vazio.
  class Save
    # @param widgets [Array<Hash>, nil] nil deixa os widgets como estão; [] apaga todos
    def initialize(dashboard, attributes, widgets: nil)
      @dashboard = dashboard
      @attributes = attributes
      @widgets = widgets
    end

    # @return [CustomDashboard]
    # @raise [Mongoid::Errors::Validations]
    def call
      dashboard.assign_attributes(attributes)
      built = widgets&.map { |widget| CustomDashboardWidget.new(widget) }

      validate!(built)
      dashboard.save!
      # Em documento salvo, a atribuição grava a lista de uma vez, num `$set` só.
      dashboard.widgets = built if built

      dashboard
    end

    private

    attr_reader :dashboard, :attributes, :widgets

    def validate!(built)
      valid = dashboard.valid?
      Array(built).each_with_index do |widget, index|
        next if widget.valid?

        valid = false
        dashboard.errors.add(:widgets, I18n.t("insights.custom_dashboards.errors.invalid_widget", position: index + 1, message: widget.errors.full_messages.first))
      end

      if built && built.size > CustomDashboard::MAX_WIDGETS
        valid = false
        dashboard.errors.add(:widgets, I18n.t("insights.custom_dashboards.errors.too_many_widgets", max: CustomDashboard::MAX_WIDGETS))
      end

      raise Mongoid::Errors::Validations.new(dashboard) unless valid
    end
  end
end
