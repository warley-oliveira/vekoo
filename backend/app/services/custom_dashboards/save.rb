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
      built = build_widgets

      check_widgets!(built) if built
      dashboard.save!
      replace_widgets(built) if built

      dashboard
    end

    private

    attr_reader :dashboard, :attributes, :widgets

    # O card mantém o `id` entre um salvar e outro, e a tela consegue dar o id a um card novo: sem isso, salvar
    # recriaria todos os cards na tela. O widget mora dentro do documento: o id só precisa valer aqui dentro.
    def build_widgets
      return nil unless widgets

      used = Set.new
      widgets.map do |widget|
        attributes = widget.to_h.with_indifferent_access
        id = attributes.delete(:id).to_s
        attributes[:_id] = BSON::ObjectId.from_string(id) if BSON::ObjectId.legal?(id) && used.add?(id)

        CustomDashboardWidget.new(attributes)
      end
    end

    # A lista inteira de uma vez, num `$set` só. Não por `dashboard.widgets =`: o Mongoid compara documento
    # pelo id, e uma lista de cards com os mesmos ids passaria por igual e não seria gravada. E o dashboard
    # muda de `updated_at`, para a tela saber que alguém salvou por cima.
    def replace_widgets(built)
      now = Time.current
      documents = built.map do |widget|
        widget.created_at ||= now
        widget.updated_at = now
        widget.as_document
      end

      dashboard.collection.update_one({ _id: dashboard.id }, { "$set" => { widgets: documents, updated_at: now } })
      dashboard.reload
    end

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
