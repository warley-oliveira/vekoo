# O que chegou pelos webhooks da organização. Fica 90 dias (índice TTL). Na origem, as estatísticas traziam todos os logs do período
# para a memória: aqui é uma agregação no banco.
class WebhookLogsController < PlatformController
  DEFAULT_STATS_DAYS = 30
  MAX_STATS_DAYS = 90

  require_permission :core_settings

  # GET /webhook-logs?webhookId=&status=&startDate=&endDate=&page=&perPage=
  def index
    records, meta = paginate(filtered_logs, per_page: 50)
    render json: { logs: HookLogSerializer.many(records), meta: meta }
  end

  def show
    log = HookLog.for_organization(current_organization.id).where(id: params[:id]).take
    return render_not_found unless log

    render json: { log: HookLogSerializer.one(log) }
  end

  # GET /webhook-logs/stats?webhookId=&days=
  def stats
    days = (params[:days].presence || DEFAULT_STATS_DAYS).to_i.clamp(1, MAX_STATS_DAYS)
    rows = daily_rows(days.days.ago.beginning_of_day)

    render json: { stats: summarize(rows, days) }
  end

  private

  def filtered_logs
    logs = HookLog.for_organization(current_organization.id).recent
    logs = logs.for_hook(params[:webhook_id]) if params[:webhook_id].present?
    logs = logs.where(status: params[:status]) if params[:status].present?

    start_date = parse_time(params[:start_date])
    end_date = parse_time(params[:end_date])
    logs = logs.where(:created_at.gte => start_date) if start_date
    logs = logs.where(:created_at.lte => end_date) if end_date
    logs
  end

  def parse_time(value)
    Time.zone.parse(value.to_s) if value.present?
  rescue ArgumentError
    nil
  end

  # Pelo prefixo de `{organization_id, hook_id, created_at}` ou `{organization_id, created_at}`, conforme o filtro.
  def daily_rows(since)
    match = { organization_id: current_organization.id.to_s, created_at: { "$gte" => since.utc } }
    match[:hook_id] = params[:webhook_id].to_s if params[:webhook_id].present?
    timezone = current_organization.timezone.presence || "America/Sao_Paulo"

    HookLog.collection.aggregate(
      [
        { "$match" => match },
        {
          "$group" => {
            _id: {
              day: { "$dateToString" => { format: "%Y-%m-%d", date: "$created_at", timezone: timezone } },
              status: "$status"
            },
            count: { "$sum" => 1 },
            elapsed: { "$sum" => { "$ifNull" => [ "$processing_time_ms", 0 ] } },
            timed: { "$sum" => { "$cond" => [ { "$gt" => [ "$processing_time_ms", nil ] }, 1, 0 ] } }
          }
        }
      ]
    ).to_a
  end

  def summarize(rows, days)
    counts = Hash.new(0)
    daily = {}
    elapsed = 0.0
    timed = 0

    rows.each do |row|
      day = row.dig("_id", "day")
      status = row.dig("_id", "status").to_s
      count = row["count"].to_i

      counts[status] += count
      elapsed += row["elapsed"].to_f
      timed += row["timed"].to_i

      daily[day] ||= { total: 0, success: 0, error: 0, skipped: 0 }
      daily[day][:total] += count
      daily[day][status.to_sym] += count if daily[day].key?(status.to_sym)
    end

    {
      periodDays: days,
      totalRequests: counts.values.sum,
      successCount: counts["success"],
      errorCount: counts["error"],
      skippedCount: counts["skipped"],
      avgProcessingTimeMs: timed.positive? ? (elapsed / timed).round(2) : 0,
      dailyStats: daily.sort.to_h
    }
  end
end
