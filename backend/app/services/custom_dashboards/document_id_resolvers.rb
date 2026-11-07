# frozen_string_literal: true

module CustomDashboards
  # Resolve filtros entre coleções para conjuntos de _id do próprio documento (ex.: "conversas com
  # agendamento em que a pessoa compareceu"). Cada resolver roda UMA consulta, escopada pela organização,
  # e devolve Array<BSON::ObjectId> para um $in sobre _id. Recebe quem consulta: o que a pessoa não
  # alcança na outra tela não pode decidir o que aparece aqui.
  module DocumentIdResolvers
    # Um $in maior que isto passa a pesar mais que a própria consulta.
    MAX_IDS = 50_000

    module_function

    def resolve(source, field, account, values)
      entry = DataSourceRegistry.document_id_filter(source, field)
      return [] unless entry

      public_send(entry[:resolver], account, Array(values))
    end

    # Conversas com agendamento cujo comparecimento casa com os valores. Cancelados ficam de fora:
    # remarcar pode gerar um documento cancelado mais um novo.
    def booking_attendance_ids(account, values)
      rows = Agenda::Booking.collection.aggregate(
        [
          { "$match" => Agenda::Booking.where(organization_id: account.organization_id.to_s, :attendance_status.in => values.map(&:to_s), :chat_id.ne => nil, :status.nin => %w[canceled archived]).selector },
          { "$group" => { "_id" => "$chat_id" } },
          { "$limit" => MAX_IDS + 1 }
        ]
      ).to_a

      raise QueryEngine::QueryError.new("tooManyMatches", field: "booking_attendance") if rows.size > MAX_IDS

      rows.map { |row| row["_id"] }
    end

    # Conversas com card ganho, perdido ou em aberto, nos quadros de CRM.
    def pipeline_status_ids(account, values)
      scope = crm_cards(account)
      conditions = values.map(&:to_s).filter_map do |value|
        case value
        when "won" then scope.where.not(won_at: nil)
        when "lost" then scope.where.not(lost_at: nil)
        when "open" then scope.where(won_at: nil, lost_at: nil)
        end
      end

      chat_ids(conditions.reduce { |all, condition| all.or(condition) }, "pipeline_status")
    end

    # Conversas com card nestas etapas, nos quadros de CRM.
    def pipeline_stage_ids(account, values)
      chat_ids(crm_cards(account).where(stage_id: values.map(&:to_s)), "pipeline_stage")
    end

    # `unscoped`: o `default_scope` ordena por posição, o que quebraria o `DISTINCT`. Card arquivado conta:
    # `mark_won!` pode arquivar o card ganho. O que a regra do quadro esconde desta pessoa não conta.
    def crm_cards(account)
      cards = Pipelines::Card.unscoped
        .joins(Sources::Pipelines::STAGES_JOIN)
        .joins("INNER JOIN pipeline_boards ON pipeline_boards.id = pipeline_stages.board_id")
        .where(organization_id: account.organization_id, pipeline_boards: { board_type: "crm" })
        .where.not(chat_id: nil)

      Sources::Pipelines.visible(cards, account)
    end

    def chat_ids(scope, field)
      return [] unless scope

      ids = scope.distinct.limit(MAX_IDS + 1).pluck(:chat_id)
      raise QueryEngine::QueryError.new("tooManyMatches", field: field) if ids.size > MAX_IDS

      # `chat_id` é o texto do ObjectId. O que não for um, não é conversa nenhuma.
      ids.filter_map { |id| BSON::ObjectId.from_string(id) if BSON::ObjectId.legal?(id) }
    end
  end
end
