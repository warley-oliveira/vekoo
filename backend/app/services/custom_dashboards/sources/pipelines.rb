module CustomDashboards
  module Sources
    # Os cards dos pipelines, no Postgres. Quem não vê um card no quadro também não o conta aqui: quadro em modo `assigned`
    # só entrega à pessoa o que está atribuído a ela (ver `::Pipelines::CardVisibility`).
    #
    # **Arquivados contam**, como na origem: `mark_won!` pode arquivar o card ganho, e um "vendido no trimestre" que
    # perde o que foi arquivado mente. Quem quer só os ativos filtra por `archived`.
    #
    # `::Pipelines`, sempre com os dois pontos: aqui dentro, `Pipelines` é este módulo.
    module Pipelines
      STAGES_JOIN = "INNER JOIN pipeline_stages ON pipeline_stages.id = pipeline_cards.stage_id".freeze
      # O quadro é da etapa, e não do card: o campo vem da junção, e fica disponível para agrupar e filtrar.
      BOARD_ID_SQL = '"pipeline_stages"."board_id"::text'.freeze
      # Em aberto, ganho ou perdido: o que a tela do quadro mostra, mas que no banco são duas datas.
      DEAL_STATUS_SQL = <<~SQL.squish.freeze
        (CASE WHEN "pipeline_cards"."won_at" IS NOT NULL THEN 'won'
              WHEN "pipeline_cards"."lost_at" IS NOT NULL THEN 'lost'
              ELSE 'open' END)
      SQL
      DEAL_STATUSES = %w[open won lost].freeze

      module_function

      # `unscoped`: o `default_scope` ordena por posição, o que quebraria o agrupamento.
      def cards_for(account)
        visible(
          ::Pipelines::Card.unscoped.joins(STAGES_JOIN).where(organization_id: account.organization_id),
          account
        )
      end

      # A regra é uma só, a de `CardVisibility`: aqui só se descobre em quais quadros ela restringe esta pessoa. Espera o
      # `STAGES_JOIN` na consulta.
      def visible(cards, account)
        restricted = restricted_board_ids(account)
        return cards if restricted.empty?

        cards.where("pipeline_stages.board_id NOT IN (?) OR pipeline_cards.assigned_to_id = ?", restricted, account.id)
      end

      def restricted_board_ids(account)
        ::Pipelines::Board.where(organization_id: account.organization_id, card_visibility: "assigned")
          .reject { |board| ::Pipelines::CardVisibility.new(board, account).unrestricted? }
          .map(&:id)
      end

      DEFINITION = {
        model_class: "Pipelines::Card",
        orm: :active_record,
        permission: :pipelines,
        default_time_field: "created_at",
        scope: ->(account) { cards_for(account) },
        fields: [
          { key: "title", type: "string" },
          { key: "board_id", type: "string", sql: BOARD_ID_SQL, label_from: :pipeline_boards, options_from: :active_pipeline_boards },
          { key: "stage_id", type: "string", label_from: :pipeline_stages, options_from: :active_pipeline_stages },
          { key: "assigned_to_id", type: "string", label_from: :accounts, options_from: :accounts },
          { key: "deal_status", type: "enum", enum_values: DEAL_STATUSES, sql: DEAL_STATUS_SQL, labels: DEAL_STATUSES },
          { key: "priority", type: "enum", enum_values: ::Pipelines::Card::PRIORITIES, labels: ::Pipelines::Card::PRIORITIES },
          { key: "archived", type: "boolean", labels: { "true" => "yes", "false" => "no" } },
          { key: "company_name", type: "string" },
          { key: "lost_reason", type: "string" },
          { key: "deal_value", type: "number" },
          { key: "deal_probability", type: "number" },
          { key: "created_at", type: "date" },
          { key: "updated_at", type: "date" },
          { key: "stage_entered_at", type: "date" },
          { key: "won_at", type: "date" },
          { key: "lost_at", type: "date" },
          { key: "completed_at", type: "date" },
          { key: "due_date", type: "date" },
          { key: "expected_close_date", type: "date" }
        ],
        allowed_metrics: %w[count sum avg min max],
        allowed_dimensions: %w[board_id stage_id assigned_to_id deal_status priority created_at won_at lost_at]
      }.freeze
    end
  end
end
