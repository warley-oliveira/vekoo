module Contacts
  # As conversas escolhidas para uma ação em lote ou para a exportação: os ids marcados, ou "todos"
  # os do filtro menos os desmarcados. Sempre dentro do que a pessoa pode ver: na origem os ids
  # marcados iam direto, sem escopo, e alcançavam conversa de qualquer organização.
  class Selection
    MAX_IDS = 5_000

    class TooMany < StandardError; end

    # @param select_all [Boolean]
    # @param chat_ids [Array<String>] ids marcados, quando não é "todos"
    # @param excluded_ids [Array<String>] desmarcados, quando é "todos"
    # @param filters [Hash] os filtros da tela
    def initialize(account:, select_all: false, chat_ids: [], excluded_ids: [], filters: {}, time_zone: Time.zone)
      @account = account
      @select_all = ActiveModel::Type::Boolean.new.cast(select_all)
      @chat_ids = ids_from(chat_ids)
      @excluded_ids = ids_from(excluded_ids)
      @filters = filters
      @time_zone = time_zone
    end

    # @return [Mongoid::Criteria, nil] nil quando nada foi escolhido
    # @raise [TooMany]
    def criteria
      raise TooMany if chat_ids.size > MAX_IDS || excluded_ids.size > MAX_IDS

      if select_all
        scope = filtered
        excluded_ids.any? ? scope.where(:_id.nin => excluded_ids) : scope
      elsif chat_ids.any?
        Chat.visible_to(account).valid_records.where(:_id.in => chat_ids)
      end
    end

    # Para a exportação: sem nada marcado, vale o filtro inteiro.
    def criteria_or_filtered
      criteria || filtered
    end

    private

    attr_reader :account, :select_all, :chat_ids, :excluded_ids, :filters, :time_zone

    def filtered
      Query.new(account: account, filters: filters, time_zone: time_zone).criteria
    end

    # Id que não é id não casa com nada, então nem entra.
    def ids_from(values)
      Array(values).filter_map { |value| Chats::Filters.cast_object_id(value) }
    end
  end
end
