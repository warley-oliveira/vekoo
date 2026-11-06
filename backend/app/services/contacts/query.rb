module Contacts
  # O critério da lista de contatos, com os filtros da tela. A mesma leitura serve à lista, à
  # seleção "todos" das ações em lote e à exportação.
  #
  # Contato aqui é a conversa, então vale a mesma regra de quem vê o quê (`chat_list_to`): a linha
  # mostra a última mensagem, e as ações em lote mudam a conversa. Na origem esta lista ignorava a
  # permissão.
  class Query
    # Em `team_ids`, "sem departamento": a coluna fica vazia, então não há id para pedir.
    NO_TEAM = "none".freeze

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
        team_condition,
        assigned_condition,
        status_condition,
        automation_condition,
        session_condition,
        created_at_condition,
        field_conditions
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

    def team_condition
      values = list_of(filters[:team_ids])
      return nil if values.empty?

      { "team_id" => { "$in" => values.map { |value| value == NO_TEAM ? nil : value } } }
    end

    # Um valor ou vários: `me`, `unassigned` ou o id da pessoa.
    def assigned_condition
      values = list_of(filters[:assigned_user])
      return nil if values.empty?

      ids = values.map do |value|
        case value
        when "me" then account.id.to_s
        when "unassigned" then nil
        else value
        end
      end

      { "assigned_account_id" => { "$in" => ids.uniq } }
    end

    # Segmentar por campo personalizado: as mesmas condições de `/chats`, com a mesma lista de
    # campos permitidos. Num parâmetro próprio porque, na ação em lote, `filters` já é este objeto.
    def field_conditions
      Chats::Filters.query(Chats::Filters.conditions(filters[:conditions]), time_zone: time_zone).presence
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

    def list_of(values)
      Array(values).map(&:to_s).compact_blank
    end
  end
end
