require "rails_helper"

RSpec.describe Outreach::ApifyPlacesSearchService do
  include ConnectorHelpers

  let(:url) { "https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items" }
  let(:place) do
    {
      title: "Padaria Pão Quente",
      phone: "(41) 3333-0000",
      phoneUnformatted: "+554133330000",
      address: "Rua XV de Novembro, 100",
      street: "Rua XV de Novembro",
      city: "Curitiba",
      state: "PR",
      postalCode: "80020-310",
      countryCode: "BR",
      neighborhood: "Centro",
      website: "https://paoquente.exemplo.com.br",
      categoryName: "Padaria",
      categories: %w[Padaria Confeitaria],
      totalScore: 4.7,
      reviewsCount: 312,
      imageUrl: "https://cdn.exemplo.com.br/pao.jpg",
      url: "https://maps.google.com/?cid=1",
      placeId: "lugar-1",
      location: { lat: -25.42, lng: -49.27 },
      instagrams: [ "https://instagram.com/paoquente" ],
      facebooks: [],
      openingHours: [ { day: "segunda", hours: "7h às 19h" } ]
    }
  end

  around { |example| with_env("APIFY_API_TOKEN" => "chave-do-apify") { example.run } }

  def stub_apify(items: [ place ], status: 200)
    stub_request(:post, url).to_return(json_reply(items, status: status))
  end

  def search(**options)
    described_class.new(search_query: "padaria", **options).call
  end

  it "normaliza o que o Apify devolve" do
    stub_apify

    expect(search.first).to include(
      title: "Padaria Pão Quente",
      phone: "(41) 3333-0000",
      phone_unformatted: "554133330000",
      postal_code: "80020-310",
      category_name: "Padaria",
      categories: %w[Padaria Confeitaria],
      total_score: 4.7,
      reviews_count: 312,
      place_id: "lugar-1",
      latitude: -25.42,
      longitude: -49.27,
      instagram: "https://instagram.com/paoquente",
      facebook: "",
      opening_hours: [ { day: "segunda", hours: "7h às 19h" } ]
    )
  end

  it "descarta quem não tem telefone: sem ele não dá para disparar" do
    stub_apify(items: [ place, place.except(:phone, :phoneUnformatted).merge(title: "Sem telefone") ])

    expect(search.map { |result| result[:title] }).to eq([ "Padaria Pão Quente" ])
  end

  it "usa o telefone formatado quando não vem o outro" do
    stub_apify(items: [ place.except(:phoneUnformatted) ])

    expect(search.first[:phone_unformatted]).to eq("4133330000")
  end

  it "resposta que não é lista vira lista vazia" do
    stub_request(:post, url).to_return(json_reply({ estranho: true }))

    expect(search).to eq([])
  end

  describe "o pedido" do
    before { stub_apify }

    it "leva a chave no cabeçalho, nunca na URL: URL acaba em log" do
      search

      expect(a_request(:post, url).with(headers: { "Authorization" => "Bearer chave-do-apify" })).to have_been_made.once
    end

    it "leva a busca e o limite" do
      search(max_places: 50)

      expect(a_request(:post, url).with(body: hash_including("searchStringsArray" => [ "padaria" ], "maxCrawledPlacesPerSearch" => 50))).to have_been_made.once
    end

    it "leva a localização quando vem" do
      search(location: "Curitiba, PR")

      expect(a_request(:post, url).with(body: hash_including("locationQuery" => "Curitiba, PR"))).to have_been_made.once
    end

    it "não leva a localização em branco" do
      search(location: "  ")

      expect(a_request(:post, url).with { |request| !JSON.parse(request.body).key?("locationQuery") }).to have_been_made.once
    end

    it "limita a quantidade a 200" do
      search(max_places: 5_000)

      expect(a_request(:post, url).with(body: hash_including("maxCrawledPlacesPerSearch" => 200))).to have_been_made.once
    end

    it "uma quantidade inválida vira 1" do
      search(max_places: "abc")

      expect(a_request(:post, url).with(body: hash_including("maxCrawledPlacesPerSearch" => 1))).to have_been_made.once
    end

    it "leva os filtros" do
      search(filters: { reviews_sort: "newest", min_score: "4.5", category_filter: "padaria", skip_closed_places: "true" })

      expect(a_request(:post, url).with(body: hash_including(
        "reviewsSort" => "newest",
        "minScore" => 4.5,
        "categoryFilterWords" => "padaria",
        "skipClosedPlaces" => true
      ))).to have_been_made.once
    end

    it "aceita os filtros como vêm do Mongo, com chave em texto" do
      search(filters: { "min_score" => 4.0 })

      expect(a_request(:post, url).with(body: hash_including("minScore" => 4.0))).to have_been_made.once
    end
  end

  describe "erros" do
    it "sem a busca, recusa" do
      expect { described_class.new(search_query: " ").call }.to raise_error(ArgumentError)
    end

    it "sem a chave, não chama o Apify" do
      with_env("APIFY_API_TOKEN" => nil) do
        expect { search }.to raise_error(described_class::ApifyAuthError) { |error| expect(error.code).to eq("apifyNotConfigured") }
      end

      expect(a_request(:post, url)).not_to have_been_made
    end

    it "chave inválida" do
      stub_apify(status: 401)

      expect { search }.to raise_error(described_class::ApifyAuthError) { |error| expect(error.code).to eq("apifyInvalidToken") }
    end

    it "sem créditos" do
      stub_apify(status: 402)

      expect { search }.to raise_error(described_class::ApifyQuotaError) { |error| expect(error.code).to eq("apifyQuotaExceeded") }
    end

    it "tempo esgotado do lado deles" do
      stub_apify(status: 408)

      expect { search }.to raise_error(described_class::ApifyError) { |error| expect(error.code).to eq("apifyTimeout") }
    end

    it "outros erros levam a mensagem deles" do
      stub_request(:post, url).to_return(json_reply({ error: { message: "Ator não encontrado" } }, status: 404))

      expect { search }.to raise_error(described_class::ApifyError, "Ator não encontrado") { |error| expect(error.code).to eq("apifyFailed") }
    end
  end
end
