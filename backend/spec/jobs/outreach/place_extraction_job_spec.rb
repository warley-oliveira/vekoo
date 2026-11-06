require "rails_helper"

RSpec.describe Outreach::PlaceExtractionJob do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:extraction) { create(:outreach_place_extraction, organization: organization) }
  let(:url) { "https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items" }
  let(:stream) { PlaceExtractionChannel.organization_stream(organization.id, PlaceExtractionChannel::STREAM) }
  let(:place) { { title: "Padaria Pão Quente", phone: "(41) 3333-0000", phoneUnformatted: "554133330000", placeId: "lugar-1" } }

  around { |example| with_env("APIFY_API_TOKEN" => "chave-do-apify") { example.run } }

  def perform
    described_class.perform_now(extraction.id.to_s, organization.id)
    extraction.reload
  end

  it "fica na fila de campanhas" do
    expect(described_class.new.queue_name).to eq("campaigns")
  end

  context "quando o Apify responde" do
    before { stub_request(:post, url).to_return(json_reply([ place ])) }

    it "guarda os resultados" do
      expect(perform).to have_attributes(status: "completed", results_count: 1, started_at: be_present, completed_at: be_present)
      expect(extraction.results.first).to include("title" => "Padaria Pão Quente", "phone_unformatted" => "554133330000", "place_id" => "lugar-1")
    end

    it "manda a busca e os filtros guardados" do
      extraction.set(max_places: 50, filters: { "min_score" => 4.5 })

      perform

      expect(a_request(:post, url).with(body: hash_including("maxCrawledPlacesPerSearch" => 50, "minScore" => 4.5, "locationQuery" => "Curitiba, PR"))).to have_been_made.once
    end

    it "avisa que começou e que terminou" do
      expect { perform }.to have_broadcasted_to(stream).with(hash_including(action: "status_update", data: hash_including(status: "running")))
      expect { described_class.perform_now(create(:outreach_place_extraction, organization: organization).id.to_s, organization.id) }
        .to have_broadcasted_to(stream).with(hash_including(action: "extraction_completed", data: hash_including(status: "completed", resultsCount: 1)))
    end

    # São centenas de lugares indo para todo mundo da organização que estiver na tela.
    it "o evento não leva os resultados" do
      expect { perform }.to(have_broadcasted_to(stream).with { |payload| expect(payload[:data] || payload["data"]).not_to have_key(:results) }.at_least(:once))
    end
  end

  describe "repetição" do
    before { stub_request(:post, url).to_return(json_reply([ place ])) }

    it "a concluída não roda de novo" do
      extraction.set(status: "completed")

      perform

      expect(a_request(:post, url)).not_to have_been_made
    end

    it "a que falhou não roda de novo" do
      extraction.set(status: "failed")

      perform

      expect(a_request(:post, url)).not_to have_been_made
    end

    it "de outra organização não é alcançada" do
      described_class.perform_now(extraction.id.to_s, create(:organization).id)

      expect(a_request(:post, url)).not_to have_been_made
    end
  end

  describe "falhas" do
    it "chave inválida" do
      stub_request(:post, url).to_return(json_reply({}, status: 401))

      expect(perform).to have_attributes(status: "failed", error_code: "apifyInvalidToken", error_message: nil, completed_at: be_present)
    end

    it "sem créditos" do
      stub_request(:post, url).to_return(json_reply({}, status: 402))

      expect(perform.error_code).to eq("apifyQuotaExceeded")
    end

    it "guarda o que o Apify disse" do
      stub_request(:post, url).to_return(json_reply({ error: { message: "Ator fora do ar" } }, status: 500))

      expect(perform).to have_attributes(error_code: "apifyFailed", error_message: "Ator fora do ar")
    end

    it "tempo esgotado" do
      stub_request(:post, url).to_raise(Net::ReadTimeout)

      expect(perform.error_code).to eq("apifyTimeout")
    end

    it "erro inesperado não fica preso em andamento" do
      allow(Outreach::ApifyPlacesSearchService).to receive(:new).and_raise(StandardError, "boom")

      expect(perform).to have_attributes(status: "failed", error_code: "apifyFailed")
    end

    it "avisa pelo canal" do
      stub_request(:post, url).to_return(json_reply({}, status: 401))

      expect { perform }.to have_broadcasted_to(stream).with(hash_including(action: "status_update", data: hash_including(status: "failed", errorCode: "apifyInvalidToken")))
    end

    it "sem a chave, falha com o motivo" do
      with_env("APIFY_API_TOKEN" => nil) do
        expect(perform).to have_attributes(status: "failed", error_code: "apifyNotConfigured")
      end
    end
  end

  # As 5 threads do Sidekiq são as mesmas do caminho das mensagens.
  describe "limite de buscas ao mesmo tempo" do
    before { stub_request(:post, url).to_return(json_reply([ place ])) }

    def fill_slots
      described_class::MAX_CONCURRENT.times do
        create(:outreach_place_extraction, organization: organization, status: "running", started_at: 1.minute.ago)
      end
    end

    it "com as vagas ocupadas, espera sem chamar o Apify" do
      fill_slots

      expect { perform }.to have_enqueued_job(described_class).with(extraction.id.to_s, organization.id)
      expect(a_request(:post, url)).not_to have_been_made
      expect(extraction.reload.status).to eq("pending")
    end

    it "esperar conta como vida, para a varredura de paradas não matar quem está na fila" do
      fill_slots
      extraction.set(updated_at: 1.hour.ago)

      perform

      expect(extraction.reload.updated_at).to be > 1.minute.ago
    end

    it "uma busca que morreu não ocupa vaga" do
      described_class::MAX_CONCURRENT.times do
        create(:outreach_place_extraction, organization: organization, status: "running", started_at: 1.hour.ago)
      end

      expect(perform.status).to eq("completed")
    end
  end
end
