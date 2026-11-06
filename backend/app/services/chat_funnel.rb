# Os números dos funis, para o dashboard e para o copiloto. Origem: `ConversationFunnel`, que percorria
# as conversas em Ruby, uma a uma, e o `count_steps_true_by_organization` do dashboard, que fazia o mesmo
# e buscava cada etiqueta numa consulta.
#
# Aqui é uma agregação só: as conversas do período passam uma vez, e cada funil tem as suas facetas. O
# funil é acumulado: quem está numa etapa passou pelas anteriores.
class ChatFunnel
  MAX_TIME_MS = 15_000
  TAG_LIMIT = 20

  # @param scope [Mongoid::Criteria] quais conversas valem: `Chat.visible_to(account)` em nome de uma
  #   pessoa
  # @param funnels [Array<Funnel>] com as etapas
  # @param date_field [String] o campo do período: `created_at` no dashboard, `last_message_at` no
  #   copiloto, como eram na origem
  # @return [Array<Hash>] um por funil
  def self.analyze(scope, funnels, from:, to:, date_field: "created_at")
    new(scope, funnels, from: from, to: to, date_field: date_field).call
  end

  # Quantos chegaram a cada etapa, a partir de quantos estão em cada uma.
  def self.reached(counts)
    total = 0
    counts.reverse.map { |count| total += count }.reverse
  end

  def self.rate(part, whole)
    whole.to_i.positive? ? (part.to_f / whole * 100).round(1) : 0.0
  end

  def initialize(scope, funnels, from:, to:, date_field:)
    @scope = scope
    @funnels = funnels
    @from = from
    @to = to
    @date_field = date_field
  end

  def call
    return [] if funnels.empty?

    tags = tags_for(result)

    funnels.each_with_index.map do |funnel, index|
      counts = result.fetch("stages_#{index}", []).to_h { |row| [ row["_id"], row["count"] ] }
      stages = funnel.stages.to_a
      reached = self.class.reached(stages.map { |stage| counts[stage.id].to_i })

      {
        funnel: funnel,
        total: reached.first.to_i,
        stages: stages.each_with_index.map { |stage, position| stage_row(stage, counts, reached, position) },
        tags: result.fetch("tags_#{index}", []).filter_map { |row| tag_row(tags[row["_id"]], row["count"]) }
      }
    end
  end

  private

  attr_reader :scope, :funnels, :from, :to, :date_field

  def stage_row(stage, counts, reached, position)
    previous = position.zero? ? nil : reached[position - 1]

    {
      id: stage.id,
      name: stage.name,
      count: counts[stage.id].to_i,
      reached: reached[position],
      # Da primeira etapa até esta, e de uma etapa para a seguinte.
      conversion_rate: self.class.rate(reached[position], reached.first),
      step_rate: previous ? self.class.rate(reached[position], previous) : 100.0,
      drop_off: previous ? previous - reached[position] : 0
    }
  end

  def tag_row(tag, count)
    tag && { id: tag.id.to_s, name: tag.name, color: tag.color, count: count }
  end

  def result
    @result ||= Chat.collection.aggregate(
      [
        { "$match" => scope.where(date_field.to_sym.gte => from, date_field.to_sym.lte => to).selector },
        { "$project" => { "funnel_stages" => 1, "chat_tag_ids" => 1 } },
        { "$facet" => facets }
      ],
      allow_disk_use: true,
      max_time_ms: MAX_TIME_MS
    ).first || {}
  end

  def facets
    funnels.each_with_index.each_with_object({}) do |(funnel, index), result|
      key = "funnel_stages.#{funnel.id}"
      in_funnel = { "$match" => { key => { "$in" => funnel.stages.map(&:id) } } }

      result["stages_#{index}"] = [ in_funnel, { "$group" => { "_id" => "$#{key}", "count" => { "$sum" => 1 } } } ]
      result["tags_#{index}"] = [
        in_funnel,
        { "$unwind" => "$chat_tag_ids" },
        { "$group" => { "_id" => "$chat_tag_ids", "count" => { "$sum" => 1 } } },
        { "$sort" => { "count" => -1, "_id" => 1 } },
        { "$limit" => TAG_LIMIT }
      ]
    end
  end

  def tags_for(rows)
    ids = rows.select { |key, _| key.start_with?("tags_") }.values.flatten.map { |row| row["_id"] }.uniq
    return {} if ids.empty?

    organization_id = funnels.first.organization_id.to_s
    ChatTag.where(organization_id: organization_id, :_id.in => ids).only(:name, :color).index_by(&:id)
  end
end
