# Consolidação diária das conversas de uma organização. Quem calcula é o domínio
# insights; aqui é só o modelo.
class DailyChatStat < ApplicationRecord
  belongs_to :organization

  scope :between, ->(start_date, end_date) { where(day: start_date..end_date) }
  scope :sum_stat, ->(key) { sum(Arel.sql("(metrics->>#{connection.quote(key.to_s)})::float")) }
  default_scope { order(day: :asc) }

  # helper "tipado" (evita repetir strings mágicas)
  def [](key)
    return super if self.class.column_names.include?(key.to_s)

    metrics[key.to_s]
  end

  def total_tokens = self["prompt_tokens_total"].to_i + self["completion_tokens_total"].to_i
end
