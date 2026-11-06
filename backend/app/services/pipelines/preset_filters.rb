module Pipelines
  # Filtros prontos, para qualquer quadro. Vivem no código, e não em linhas por organização: são
  # imutáveis, evoluem com o deploy e não pedem semente. `name_key` é traduzido na tela
  # (`pipelines.filters.presets.<chave>`). Cada definição é validada por spec contra um quadro real.
  class PresetFilters
    QUICK = "quick".freeze
    DATA_CLEANUP = "data_cleanup".freeze

    def self.cond(field, operator, value = nil)
      { "field" => field, "operator" => operator, "value" => value }
    end

    def self.relative(token, amount: nil)
      value = { "type" => "relative", "token" => token }
      value["n"] = amount if amount
      value
    end

    def self.definition(all)
      { "version" => 1, "all" => all, "any" => [] }
    end

    PRESETS = [
      {
        key: "open_deals", name_key: "pipelines.filters.presets.open_deals", section: QUICK,
        definition: definition([ cond("deal_status", "eq", "open") ])
      },
      {
        key: "won_deals", name_key: "pipelines.filters.presets.won_deals", section: QUICK,
        definition: definition([ cond("deal_status", "eq", "won") ])
      },
      {
        key: "lost_deals", name_key: "pipelines.filters.presets.lost_deals", section: QUICK,
        definition: definition([ cond("deal_status", "eq", "lost") ])
      },
      {
        key: "rotten_deals", name_key: "pipelines.filters.presets.rotten_deals", section: QUICK,
        definition: definition([ cond("is_rotting", "eq", true) ])
      },
      {
        key: "my_deals", name_key: "pipelines.filters.presets.my_deals", section: QUICK,
        definition: definition([ cond("assigned_to_id", "eq", { "type" => "me" }) ])
      },
      {
        key: "won_this_week", name_key: "pipelines.filters.presets.won_this_week", section: QUICK,
        definition: definition([ cond("deal_status", "eq", "won"), cond("won_at", "within", relative("this_week")) ])
      },
      {
        key: "won_this_month", name_key: "pipelines.filters.presets.won_this_month", section: QUICK,
        definition: definition([ cond("deal_status", "eq", "won"), cond("won_at", "within", relative("this_month")) ])
      },
      {
        key: "won_this_year", name_key: "pipelines.filters.presets.won_this_year", section: QUICK,
        definition: definition([ cond("deal_status", "eq", "won"), cond("won_at", "within", relative("this_year")) ])
      },
      {
        key: "created_this_week", name_key: "pipelines.filters.presets.created_this_week", section: QUICK,
        definition: definition([ cond("created_at", "within", relative("this_week")) ])
      },
      {
        key: "older_than_3_months", name_key: "pipelines.filters.presets.older_than_3_months", section: QUICK,
        definition: definition([ cond("created_at", "before", relative("more_than_n_months_ago", amount: 3)) ])
      },
      {
        key: "stale_first_stage_12_months", name_key: "pipelines.filters.presets.stale_first_stage_12_months",
        section: DATA_CLEANUP,
        definition: definition([
          cond("updated_at", "before", relative("more_than_n_months_ago", amount: 12)),
          cond("in_first_stage", "eq", true)
        ])
      },
      {
        key: "expected_close_in_past", name_key: "pipelines.filters.presets.expected_close_in_past",
        section: DATA_CLEANUP,
        definition: definition([
          cond("deal_status", "eq", "open"),
          cond("expected_close_date", "before", relative("today"))
        ])
      },
      {
        key: "assigned_to_deactivated", name_key: "pipelines.filters.presets.assigned_to_deactivated",
        section: DATA_CLEANUP,
        definition: definition([ cond("assigned_to_deactivated", "eq", true) ])
      }
    ].freeze

    class << self
      def all
        PRESETS
      end

      def keys
        @keys ||= PRESETS.map { |preset| preset[:key] }.freeze
      end

      def key?(value)
        keys.include?(value.to_s)
      end

      def find(key)
        PRESETS.find { |preset| preset[:key] == key.to_s }
      end

      def definition_for(key)
        find(key)&.fetch(:definition)
      end
    end
  end
end
