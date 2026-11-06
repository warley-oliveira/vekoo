module Flows
  # O que a lista de fluxos mostra de cada um: quando rodou pela última vez, os últimos resultados e quanto rodou na semana.
  # Fica fora do serializer porque é uma consulta por página, e não uma por fluxo. Só execuções de verdade: as do teste
  # do editor não contam como uso.
  class ListStats
    RECENT_LIMIT = 8
    WINDOW = 7.days
    EMPTY_WEEK = { total: 0, failed: 0, waiting: 0 }.freeze

    def self.for(flow_ids)
      new(flow_ids).call
    end

    def initialize(flow_ids)
      @flow_ids = flow_ids
    end

    # @return [Hash{String => Hash}] por id de fluxo. Fluxo que nunca rodou não aparece.
    def call
      return {} if @flow_ids.empty?

      counts = weekly_counts
      recent.to_h do |flow_id, runs|
        [ flow_id, { lastExecutedAt: runs.first[:at], recent: runs.pluck(:status), last7Days: counts.fetch(flow_id, EMPTY_WEEK) } ]
      end
    end

    private

    # LATERAL: para cada fluxo, o índice (flow_id, playground, created_at) entrega as últimas de trás para frente, sem
    # varrer o histórico inteiro de quem roda muito.
    def recent
      sql = ActiveRecord::Base.sanitize_sql_array([ <<~SQL.squish, { ids: @flow_ids, limit: RECENT_LIMIT } ])
        SELECT flows.id AS flow_id, runs.status, runs.created_at
        FROM flows
        CROSS JOIN LATERAL (
          SELECT status, created_at FROM flow_executions
          WHERE flow_executions.flow_id = flows.id AND flow_executions.playground = FALSE
          ORDER BY created_at DESC
          LIMIT :limit
        ) runs
        WHERE flows.id IN (:ids)
        ORDER BY flows.id, runs.created_at DESC
      SQL

      FlowExecution.connection.select_all(sql).cast_values.each_with_object({}) do |(flow_id, status, created_at), result|
        (result[flow_id] ||= []) << { status: status, at: (created_at.to_f * 1000).to_i }
      end
    end

    def weekly_counts
      rows = FlowExecution.real_runs.where(flow_id: @flow_ids, created_at: WINDOW.ago..).group(:flow_id, :status).count

      rows.each_with_object({}) do |((flow_id, status), count), result|
        entry = (result[flow_id] ||= EMPTY_WEEK.dup)
        entry[:total] += count
        entry[:failed] += count if status == "failed"
        entry[:waiting] += count if status.in?(%w[waiting waiting_for_message])
      end
    end
  end
end
