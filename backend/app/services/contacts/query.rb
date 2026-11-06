module Contacts
  # O critério da lista de contatos, com os filtros da tela. A mesma leitura serve à lista, à
  # seleção "todos" das ações em lote e à exportação.
  #
  # Contato aqui é a conversa, então vale a mesma regra de quem vê o quê (`chat_list_to`): a linha
  # mostra a última mensagem, e as ações em lote mudam a conversa. Na origem esta lista ignorava a
  # permissão.
  class Query
    # @param filters [Hash, ActionController::Parameters] em snake_case
    def initialize(account:, filters:, time_zone: Time.zone)
      @account = account
      @filters = filters.respond_to?(:to_unsafe_h) ? filters.to_unsafe_h : filters.to_h.with_indifferent_access
      @time_zone = time_zone
    end

    # @return [Mongoid::Criteria]
    def criteria
      conditions.reduce(Chat.visible_to(account).valid_records) do |scope, condition|
        scope.where("$and" => [ condition ])
      end
    end

    private

    attr_reader :account, :filters, :time_zone

    def conditions
      [
        Chats::SearchTerm.clause(filters[:q]),
        tag_condition,
        connector_condition,
        assigned_condition,
        status_condition,
        automation_condition,
        session_condition,
        created_at_condition
      ].compact
    end

    def tag_condition
      ids = object_ids(filters[:tag_ids])
      { "chat_tag_ids" => { "$in" => ids } } if ids.any?
    end

    def connector_condition
      ids = object_ids(filters[:connector_ids])
      { "connector_id" => { "$in" => ids } } if ids.any?
    end

    def assigned_condition
      value = filters[:assigned_user].to_s
      return nil if value.blank?

      case value
      when "me" then { "assigned_account_id" => account.id.to_s }
      when "unassigned" then { "assigned_account_id" => nil }
      else { "assigned_account_id" => value }
      end
    end

    def status_condition
      { "status" => filters[:status].to_s } if Chat::STATUSES.include?(filters[:status].to_s)
    end

    def automation_condition
      return nil if filters[:automation_enabled].nil? || filters[:automation_enabled].to_s.empty?

      { "automation_enabled" => ActiveModel::Type::Boolean.new.cast(filters[:automation_enabled]) }
    end

    # Só filtra quando pedem `true`, como na origem: `false` traz todo mundo.
    def session_condition
      return nil unless ActiveModel::Type::Boolean.new.cast(filters[:has_session])

      { "session_start_at" => { "$gte" => 24.hours.ago } }
    end

    def created_at_condition
      range = {}
      from = parse_time(filters[:date_from])
      to = parse_time(filters[:date_to])
      range["$gte"] = from if from
      range["$lte"] = to.end_of_day if to

      { "created_at" => range } if range.any?
    end

    # Data que não é data é ignorada: filtro da tela não derruba a lista.
    def parse_time(value)
      return nil if value.blank?

      time_zone.parse(value.to_s)
    rescue ArgumentError
      nil
    end

    def object_ids(values)
      Array(values).filter_map { |value| Chats::Filters.cast_object_id(value) }
    end
  end
end
