# frozen_string_literal: true

module CustomDashboards
  # Grava o dashboard e, se vierem, a lista inteira de widgets, como a tela edita: uma lista só. Confere
  # tudo antes de escrever. A origem apagava os widgets e só depois descobria que os novos eram inválidos,
  # e aí o dashboard ficava vazio.
  class Save
    # Recusa da lista de widgets, com o que a tela precisa para apontar o card.
    class InvalidWidgets < StandardError
      attr_reader :code, :details

      def initialize(code, message, details: nil)
        @code = code
        @details = details
        super(message)
      end
    end

    # @param widgets [Array<Hash>, nil] nil deixa os widgets como estão; [] apaga todos
    def initialize(dashboard, attributes, widgets: nil)
      @dashboard = dashboard
      @attributes = attributes
      @widgets = widgets
    end

    # @return [CustomDashboard]
    # @raise [Mongoid::Errors::Validations] o dashboard em si não vale
    # @raise [InvalidWidgets]
    def call
      dashboard.assign_attributes(attributes)
      built = widgets&.map { |widget| CustomDashboardWidget.new(widget) }

      check_widgets!(built) if built
      dashboard.save!
      # Em documento salvo, a atribuição grava a lista de uma vez, num `$set` só.
      dashboard.widgets = built if built

      dashboard
    end

    private

    attr_reader :dashboard, :attributes, :widgets

    def check_widgets!(built)
      if built.size > CustomDashboard::MAX_WIDGETS
        raise InvalidWidgets.new("tooManyWidgets", I18n.t("insights.custom_dashboards.errors.too_many_widgets", max: CustomDashboard::MAX_WIDGETS))
      end

      built.each_with_index do |widget, index|
        next if widget.valid?

        raise InvalidWidgets.new(
          "invalidWidget",
          I18n.t("insights.custom_dashboards.errors.invalid_widget", position: index + 1, message: widget.errors.full_messages.first),
          details: { position: index, errors: widget.errors.group_by(&:attribute).to_h { |attribute, errors| [ attribute.to_s.camelize(:lower), errors.map(&:message) ] } }
        )
      end
    end
  end
end
