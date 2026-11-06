module Outreach
  # Todos os estabelecimentos já encontrados pela organização, numa lista só e paginada.
  #
  # A origem carregava todas as extrações em memória a cada página. Aqui o trabalho é do Mongo, e
  # só os documentos da página voltam.
  class PlaceContacts
    Page = Struct.new(:rows, :total, keyword_init: true)

    # @param search [String, nil] nome, endereço, telefone ou categoria
    def initialize(organization_id, search: nil)
      @organization_id = organization_id.to_s
      @search = search.to_s.strip.presence
    end

    # @return [Page] rows: pares [lugar, extração], para o serializer juntar
    def page(offset:, limit:)
      result = PlaceExtraction.collection.aggregate(pipeline(offset, limit), allow_disk_use: true).first || {}
      docs = Array(result["rows"])

      Page.new(
        rows: docs.map { |doc| [ doc["results"], doc ] },
        total: Array(result["total"]).first&.fetch("count", 0).to_i
      )
    end

    private

    attr_reader :organization_id, :search

    def pipeline(offset, limit)
      stages = [
        { "$match" => { organization_id: organization_id, status: "completed" } },
        { "$sort" => { created_at: -1 } },
        { "$project" => { search_query: 1, location: 1, completed_at: 1, results: 1 } },
        { "$unwind" => "$results" }
      ]
      stages << { "$match" => search_filter } if search

      stages << {
        "$facet" => {
          "rows" => [ { "$skip" => offset }, { "$limit" => limit } ],
          "total" => [ { "$count" => "count" } ]
        }
      }
    end

    def search_filter
      pattern = { "$regex" => Regexp.escape(search), "$options" => "i" }

      { "$or" => %w[title address phone category_name].map { |field| { "results.#{field}" => pattern } } }
    end
  end
end
