# frozen_string_literal: true

module CustomDashboards
  # Resolve filtros entre coleções para conjuntos de _id do próprio documento (ex.: "conversas com
  # agendamento em que a pessoa compareceu"). Cada resolver roda UMA consulta, escopada pela organização,
  # e devolve Array<BSON::ObjectId> para um $in sobre _id.
  #
  # Os filtros de pipeline da origem (`pipeline_status`, `pipeline_stage`) entram aqui quando a fonte de
  # pipelines for registrada: ver docs/migration/api/insights.md.
  module DocumentIdResolvers
    # Um $in maior que isto passa a pesar mais que a própria consulta.
    MAX_IDS = 50_000

    module_function

    def resolve(source, field, organization_id, values)
      entry = DataSourceRegistry.document_id_filter(source, field)
      return [] unless entry

      public_send(entry[:resolver], organization_id, Array(values))
    end

    # Conversas com agendamento cujo comparecimento casa com os valores. Cancelados ficam de fora:
    # remarcar pode gerar um documento cancelado mais um novo.
    def booking_attendance_ids(organization_id, values)
      rows = Agenda::Booking.collection.aggregate(
        [
          { "$match" => Agenda::Booking.where(organization_id: organization_id.to_s, :attendance_status.in => values.map(&:to_s), :chat_id.ne => nil, :status.nin => %w[canceled archived]).selector },
          { "$group" => { "_id" => "$chat_id" } },
          { "$limit" => MAX_IDS + 1 }
        ]
      ).to_a

      raise QueryEngine::QueryError.new("tooManyMatches", field: "booking_attendance") if rows.size > MAX_IDS

      rows.map { |row| row["_id"] }
    end
  end
end
