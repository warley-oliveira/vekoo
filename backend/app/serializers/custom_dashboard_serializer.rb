# frozen_string_literal: true

class CustomDashboardSerializer < ApplicationSerializer
  def self.one(dashboard)
    fields(dashboard).merge(widgets: dashboard.widgets.map { |widget| widget(widget) })
  end

  # A listagem: sem os widgets, que podem ser pesados, com a contagem e o nome de quem criou.
  # @param creators [Hash] id => nome, já buscados em lote
  def self.summary(dashboard, creators: {})
    fields(dashboard).merge(widgetsCount: dashboard.widgets.size, createdByName: creators[dashboard.created_by_account_id])
  end

  def self.fields(dashboard)
    {
      id: dashboard.id.to_s,
      name: dashboard.name,
      description: dashboard.description,
      icon: dashboard.icon,
      isFavorite: dashboard.is_favorite,
      isDefault: dashboard.is_default,
      globalFilters: dashboard.global_filters,
      createdByAccountId: dashboard.created_by_account_id,
      createdAt: epoch_ms(dashboard.created_at),
      updatedAt: epoch_ms(dashboard.updated_at)
    }
  end
  private_class_method :fields

  def self.widget(widget)
    {
      id: widget.id.to_s,
      widgetType: widget.widget_type,
      title: widget.title,
      dataSource: widget.data_source,
      query: widget.query,
      visualConfig: widget.visual_config,
      layout: widget.layout,
      position: widget.position
    }
  end
  private_class_method :widget
end
