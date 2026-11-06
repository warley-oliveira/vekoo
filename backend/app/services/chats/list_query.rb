module Chats
  # O critério da lista de conversas: o que a pessoa pode ver (`chat_list_to`), com a busca, os
  # atalhos e os filtros avançados por cima. Junta as duas listagens da origem, a v1 (etiquetas,
  # canais, atribuição) e a v2 (condições).
  class ListQuery
    # O que nenhuma lista lê e pode pesar: contexto de fluxo e do widget.
    HEAVY_FIELDS = %i[flow_data contact_storage external_fields widget_context].freeze

    # @param params [ActionController::Parameters] já em snake_case (ver CamelParams)
    def initialize(account:, params:, time_zone: Time.zone)
      @account = account
      @params = params
      @time_zone = time_zone
    end

    # @return [Mongoid::Criteria] da conversa mais recente para a mais antiga
    def criteria
      scope = Chat.visible_to(account).valid_records
      conditions.each { |condition| scope = scope.where("$and" => [ condition ]) }

      scope.without(*HEAVY_FIELDS).order_by(last_message_at: :desc)
    end

    private

    attr_reader :account, :params, :time_zone

    def conditions
      [
        Filters.query(Filters.conditions(params[:filter].presence || params[:filters]), time_zone: time_zone).presence,
        SearchTerm.clause(params[:q]),
        assigned_condition,
        status_condition,
        connector_condition,
        tag_condition
      ].compact
    end

    def assigned_condition
      return nil if params[:assigned_user].blank?

      case params[:assigned_user].to_s
      when "me" then { "assigned_account_id" => account.id.to_s }
      when "unassigned" then { "assigned_account_id" => nil }
      else { "assigned_account_id" => params[:assigned_user].to_s }
      end
    end

    def status_condition
      { "status" => params[:status].to_s } if Chat::STATUSES.include?(params[:status].to_s)
    end

    def connector_condition
      ids = object_ids(params[:connector_ids])
      { "connector_id" => { "$in" => ids } } if ids.any?
    end

    def tag_condition
      ids = object_ids(params[:tag_ids])
      { "chat_tag_ids" => { "$in" => ids } } if ids.any?
    end

    def object_ids(values)
      Array(values).filter_map { |value| Filters.cast_object_id(value) }
    end
  end
end
