# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::Workers::Maps do
  let(:endpoint) { described_class::ENDPOINT }

  around do |example|
    original = ENV["GOOGLE_MAPS_API_KEY"]
    ENV["GOOGLE_MAPS_API_KEY"] = "chave-de-teste"
    example.run
  ensure
    ENV["GOOGLE_MAPS_API_KEY"] = original
  end

  # Pelo script, como quem usa: `maps.routes(...)` em V8 de verdade.
  def routes(origin = "Av. Paulista, 1000, São Paulo", destination = "Rua Augusta, 500, São Paulo", options = nil)
    args = [ origin, destination, options ].to_json
    run_script("return maps.routes(...#{args});")
  end

  def stub_routes(body:, status: 200, content_type: "application/json")
    stub_request(:post, endpoint).to_return(
      status: status,
      body: body.is_a?(String) ? body : body.to_json,
      headers: { "Content-Type" => content_type }
    )
  end

  # Rota "crua" no formato da Routes API v2.
  def google_route(distance:, duration:, description: nil, polyline: "abc123", warnings: [])
    {
      "description" => description,
      "distanceMeters" => distance,
      "duration" => "#{duration}s",
      "staticDuration" => "#{duration}s",
      "polyline" => { "encodedPolyline" => polyline },
      "warnings" => warnings
    }
  end

  def sent_body
    body = nil
    assert_requested(:post, endpoint) { |request| body = JSON.parse(request.body) }
    body
  end

  describe "#routes — sucesso" do
    before do
      stub_routes(body: { "routes" => [ google_route(distance: 2400, duration: 480, description: "Av. Paulista") ] })
    end

    it "retorna ok: true" do
      expect(routes["ok"]).to be true
    end

    it "retorna a contagem de rotas" do
      expect(routes["count"]).to eq(1)
    end

    it "ecoa origem, destino e modo de transporte" do
      expect(routes).to include(
        "origin" => "Av. Paulista, 1000, São Paulo",
        "destination" => "Rua Augusta, 500, São Paulo",
        "travelMode" => "DRIVE",
        "sortBy" => "distance"
      )
    end

    it "mapeia os campos da rota" do
      expect(routes["routes"].first).to include(
        "index" => 0,
        "summary" => "Av. Paulista",
        "distanceMeters" => 2400,
        "distanceText" => "2,4 km",
        "durationSeconds" => 480,
        "durationText" => "8 min",
        "staticDurationSeconds" => 480,
        "encodedPolyline" => "abc123",
        "warnings" => []
      )
    end
  end

  describe "#routes — ordenação" do
    before do
      stub_routes(body: {
                    "routes" => [
                      google_route(distance: 9000, duration: 600, description: "Marginal"),
                      google_route(distance: 2400, duration: 900, description: "Centro"),
                      google_route(distance: 5000, duration: 700, description: "Radial")
                    ]
                  })
    end

    it "ordena da mais curta à mais longa por padrão" do
      expect(routes["routes"].map { |r| r["distanceMeters"] }).to eq([ 2400, 5000, 9000 ])
    end

    it "reatribui o index após a ordenação" do
      expect(routes["routes"].map { |r| r["index"] }).to eq([ 0, 1, 2 ])
    end

    it "ordena por duração quando sortBy é duration" do
      result = routes("A", "B", { "sortBy" => "duration" })

      expect(result["routes"].map { |r| r["durationSeconds"] }).to eq([ 600, 700, 900 ])
      expect(result["sortBy"]).to eq("duration")
    end

    it "trunca em maxRoutes" do
      result = routes("A", "B", { "maxRoutes" => 2 })

      expect(result["routes"].map { |r| r["summary"] }).to eq(%w[Centro Radial])
    end

    it "limita maxRoutes ao teto do worker" do
      expect(routes("A", "B", { "maxRoutes" => 99 })["count"]).to eq(3)
    end
  end

  describe "#routes — payload enviado à Google" do
    before { stub_routes(body: { "routes" => [] }) }

    it "pede rotas alternativas com os endereços informados" do
      routes

      expect(sent_body).to include(
        "computeAlternativeRoutes" => true,
        "origin" => { "address" => "Av. Paulista, 1000, São Paulo" },
        "destination" => { "address" => "Rua Augusta, 500, São Paulo" },
        "travelMode" => "DRIVE",
        "languageCode" => "pt-BR",
        "regionCode" => "br"
      )
    end

    it "envia a API key e o FieldMask nos headers" do
      routes

      assert_requested(:post, endpoint, headers: { "X-Goog-Api-Key" => "chave-de-teste", "Content-Type" => "application/json" }) do |request|
        expect(request.headers["X-Goog-Fieldmask"]).to include("routes.distanceMeters", "routes.duration")
      end
    end

    it "traduz avoidTolls em routeModifiers" do
      routes("A", "B", { "avoidTolls" => true })

      expect(sent_body["routeModifiers"]).to eq("avoidTolls" => true)
    end

    it "usa TRAFFIC_AWARE quando departureTime é informado" do
      routes("A", "B", { "departureTime" => "2026-08-03T10:00:00Z" })

      expect(sent_body).to include("routingPreference" => "TRAFFIC_AWARE", "departureTime" => "2026-08-03T10:00:00Z")
    end

    it "não envia routingPreference para modos sem trânsito" do
      routes("A", "B", { "travelMode" => "WALK" })

      expect(sent_body).not_to have_key("routingPreference")
    end

    it "aceita opções em snake_case" do
      routes("A", "B", { "travel_mode" => "bicycle", "avoid_highways" => true })

      expect(sent_body).to include("travelMode" => "BICYCLE", "routeModifiers" => { "avoidHighways" => true })
    end
  end

  describe "#routes — sem resultados" do
    it "retorna ok: true com lista vazia quando a Google não acha rota" do
      stub_routes(body: {})

      expect(routes).to include("ok" => true, "count" => 0, "routes" => [])
    end
  end

  describe "#routes — validações" do
    it "exige origem" do
      expect(routes("  ")).to include("ok" => false, "status" => 400, "error" => "Missing origin")
    end

    it "exige destino" do
      expect(routes("A", nil)).to include("ok" => false, "status" => 400, "error" => "Missing destination")
    end

    it "rejeita travelMode inválido" do
      result = routes("A", "B", { "travelMode" => "TELEPORT" })

      expect(result["status"]).to eq(400)
      expect(result["error"]).to include("Invalid travelMode")
    end

    it "rejeita sortBy inválido" do
      expect(routes("A", "B", { "sortBy" => "price" })["error"]).to include("Invalid sortBy")
    end

    it "rejeita units inválido" do
      expect(routes("A", "B", { "units" => "LEGUAS" })["error"]).to include("Invalid units")
    end

    it "não chama a Google quando a validação falha" do
      routes("  ")

      expect(a_request(:any, /.*/)).not_to have_been_made
    end
  end

  describe "#routes — erros" do
    it "retorna 500 quando a chave não está configurada" do
      ENV["GOOGLE_MAPS_API_KEY"] = nil

      expect(routes).to include("ok" => false, "status" => 500, "error" => "Google Maps API key not configured")
      expect(a_request(:any, /.*/)).not_to have_been_made
    end

    it "propaga a mensagem de erro da Google em HTTP não-2xx" do
      stub_routes(status: 403, body: { "error" => { "message" => "API key not valid" } })

      expect(routes).to include("ok" => false, "status" => 403, "error" => "API key not valid")
    end

    it "usa mensagem genérica quando a Google não detalha o erro" do
      stub_routes(status: 500, body: "internal error", content_type: "text/plain")

      expect(routes["error"]).to eq("Google Maps request failed: HTTP 500")
    end

    it "devolve objeto (nunca texto) quando a requisição levanta exceção" do
      stub_request(:post, endpoint).to_raise(Errno::ECONNREFUSED)

      result = routes

      expect(result).to be_a(Hash)
      expect(result).to include("ok" => false, "status" => 500)
    end

    it "o script nunca vê a chave" do
      stub_routes(status: 403, body: { "error" => { "message" => "negado" } })

      expect(routes.to_json).not_to include("chave-de-teste")
    end
  end

  describe "#routes — limites" do
    before { stub_routes(body: { "routes" => [] }) }

    it "cada chamada conta na cota de rede: custa dinheiro na conta do servidor" do
      stub_const("MiniRacerEngine::Limits::MAX_FETCHES", 1)

      expect { run_script("maps.routes('A', 'B'); maps.routes('A', 'B');") }
        .to raise_error(MiniRacer::RuntimeError, /network calls/)
      expect(a_request(:post, endpoint)).to have_been_made.once
    end

    it "não passa do prazo da execução" do
      allow(HTTParty).to receive(:post).and_call_original

      run_script("maps.routes('A', 'B');", timeout_ms: 2_000)

      expect(HTTParty).to have_received(:post).with(endpoint, hash_including(timeout: be <= 2.0))
    end
  end

  describe "#routes — formatação" do
    it "formata distâncias abaixo de 1 km em metros" do
      stub_routes(body: { "routes" => [ google_route(distance: 850, duration: 45) ] })

      expect(routes["routes"].first).to include("distanceText" => "850 m", "durationText" => "45 s")
    end

    it "formata durações longas em horas e minutos" do
      stub_routes(body: { "routes" => [ google_route(distance: 120_000, duration: 4800) ] })

      expect(routes["routes"].first).to include("distanceText" => "120,0 km", "durationText" => "1 h 20 min")
    end
  end
end
