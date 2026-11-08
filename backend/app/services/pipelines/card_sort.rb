module Pipelines
  # A ordem de `GET /cards`, para a lista paginada: ordenar na tela só ordenaria a página aberta.
  #
  # Nenhum nome vindo de fora chega ao SQL: só as expressões daqui. Sem valor sempre por último, nos
  # dois sentidos, e a ordem do quadro desempata: sem ela, a mesma página mudaria a cada leitura.
  class CardSort
    PRIORITY = <<~SQL.squish.freeze
      CASE pipeline_cards.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END
    SQL

    COLUMNS = {
      "title" => "LOWER(pipeline_cards.title)",
      "stage" => "pipeline_stages.position",
      "assignee" => "LOWER(users.name)",
      "priority" => PRIORITY,
      "dueDate" => "pipeline_cards.due_date",
      "value" => "pipeline_cards.deal_value",
      "probability" => "pipeline_cards.deal_probability",
      "expectedClose" => "pipeline_cards.expected_close_date",
      "company" => "LOWER(pipeline_cards.company_name)",
      "createdAt" => "pipeline_cards.created_at",
      "updatedAt" => "pipeline_cards.updated_at"
    }.freeze

    TIE_BREAK = "pipeline_stages.position ASC, pipeline_cards.position ASC, pipeline_cards.id ASC".freeze

    # @param cards [ActiveRecord::Relation<Pipelines::Card>] vindo de `board.cards`, com as etapas juntas
    # @return [ActiveRecord::Relation<Pipelines::Card>] a mesma, sem mexer se a ordem é desconhecida
    def self.call(cards, board:, sort:, direction:)
      expression = sort.to_s == "leadScore" ? lead_score_expression(board) : COLUMNS[sort.to_s]
      return cards unless expression

      way = direction.to_s == "desc" ? "DESC" : "ASC"
      scope = sort.to_s == "assignee" ? cards.left_joins(assigned_to: :user) : cards
      scope.reorder(Arel.sql("#{expression} #{way} NULLS LAST, #{TIE_BREAK}"))
    end

    # A pontuação é um campo personalizado: o texto só vira número se parecer um.
    def self.lead_score_expression(board)
      key = board.lead_score_field_key
      return nil if key.blank?

      accessor = "pipeline_cards.custom_field_values->>#{Card.connection.quote(key)}"
      "CASE WHEN #{accessor} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (#{accessor})::numeric END"
    end
    private_class_method :lead_score_expression
  end
end
