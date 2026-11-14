require "rails_helper"

# A geração de imagens, de ponta a ponta, sem rede: `Ai::GeminiImage` é a
# costura, e o dublê devolve imagens (ou recusas) como o Gemini devolveria.
RSpec.describe "Geração de imagens", type: :request do
  include ActiveJob::TestHelper

  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let(:brand) { create(:brand_core, :published, organization: organization) }
  let(:base) { "/brands/#{brand.id}/image-generations" }
  let(:png) { Vips::Image.black(40, 50).new_from_image([ 200, 120, 60 ]).copy(interpretation: :srgb).write_to_buffer(".png") }

  # O Vertex "ligado" sem credencial de verdade; o dublê abaixo nunca chama a rede.
  before { allow(Ai::GeminiImage).to receive(:available?).and_return(true) }

  # Cada chamada pega a próxima resposta: `:ok`, `:blocked` ou `:failed`.
  def fake_gemini(*answers)
    calls = []
    queue = answers.dup
    lock = Mutex.new
    client = instance_double(Ai::GeminiImage)
    allow(client).to receive(:generate) do |**params|
      answer = lock.synchronize { calls << params; queue.shift || answers.last }
      case answer
      when :blocked then raise Ai::GeminiImage::Blocked, "safety"
      when :failed then raise Ai::GeminiImage::Failed, "HTTP 500"
      else Ai::GeminiImage::Result.new(image: Ai::GeminiImage::Image.new(data: png, mime_type: "image/png"), usage: { input: 10, output: 1290 }, model: "gemini-3.1-flash-image")
      end
    end
    allow(Ai::GeminiImage).to receive(:new).and_return(client)
    calls
  end

  def request_images(**attrs)
    post base, headers: headers, as: :json, params: { generation: { prompt: "pão de queijo saindo do forno", format: "feed_portrait", count: 3 }.merge(attrs) }
  end

  it "reserva o crédito por imagem, gera e guarda cada uma como foto da marca" do
    calls = fake_gemini(:ok)
    expect { request_images }.to change { organization.reload.credits_used }.by(3 * CatalogSerializer::AI_COSTS[:image])
    expect(response).to have_http_status(:accepted)
    expect(json).to include("status" => "queued", "aspectRatio" => "4:5", "count" => 3)

    perform_enqueued_jobs(only: GenerateImagesJob)
    generation = ImageGeneration.order(:created_at).last
    expect(generation).to have_attributes(status: "done", cost_micro_usd: 3 * 67_000)
    expect(generation.assets.map(&:kind)).to eq(%w[photo photo photo])
    expect(generation.assets.first).to have_attributes(generated: true, width: 40, height: 50)
    expect(generation.assets.first.meta).to include("origin" => "generated", "prompt" => "pão de queijo saindo do forno")

    # O pedido leva a marca e a regra de não escrever na imagem.
    prompt = calls.first[:prompt]
    expect(prompt).to include("Pão da Vila", "pão de queijo saindo do forno", "Não escreva nenhum texto")
    expect(calls.first[:aspect_ratio]).to eq("4:5")
  end

  it "devolve o crédito das que não saíram; recusa do filtro vira código próprio" do
    fake_gemini(:ok, :blocked, :failed)
    request_images
    perform_enqueued_jobs(only: GenerateImagesJob)

    generation = ImageGeneration.order(:created_at).last
    expect(generation.status).to eq("done")
    expect(generation.assets.count).to eq(1)
    expect(organization.reload.credits_used).to eq(CatalogSerializer::AI_COSTS[:image])

    fake_gemini(:blocked)
    request_images(count: 2)
    perform_enqueued_jobs(only: GenerateImagesJob)
    expect(ImageGeneration.order(:created_at).last).to have_attributes(status: "failed", error: { "code" => "blocked" })
    expect(organization.reload.credits_used).to eq(CatalogSerializer::AI_COSTS[:image])
  end

  it "usa a foto da marca como referência, e recusa foto de outra marca" do
    photo = create(:brand_asset, :photo, brand_core: brand)
    calls = fake_gemini(:ok)
    request_images(count: 1, referenceAssetId: photo.id)
    perform_enqueued_jobs(only: GenerateImagesJob)
    expect(calls.first[:references].first).to include(mime_type: "image/png")
    expect(calls.first[:prompt]).to include("referência")

    other = create(:brand_asset, :photo)
    request_images(referenceAssetId: other.id)
    expect(json.dig("error", "field")).to eq("referenceAssetId")
  end

  it "sem o Vertex configurado, diz que não está disponível e não cobra" do
    allow(Ai::GeminiImage).to receive(:available?).and_return(false)
    expect { request_images }.not_to change { organization.reload.credits_used }
    expect(response).to have_http_status(:service_unavailable)
    expect(json.dig("error", "code")).to eq("imageUnavailable")
  end

  it "sem saldo, recusa antes de criar o pedido" do
    organization.update!(credits_used: organization.credits_total)
    expect { request_images }.not_to change(ImageGeneration, :count)
    expect(json.dig("error", "code")).to eq("noCredits")
  end

  it "o custo das imagens entra no teto mensal da Vekoo, junto com o agente" do
    ENV["AGENT_MONTHLY_COST_CENTS_CAP"] = "10"
    ImageGeneration.create!(organization: organization, brand_core: brand, prompt: "x", aspect_ratio: "4:5", count: 1,
      status: "done", cost_micro_usd: 200_000)
    request_images
    expect(json.dig("error", "code")).to eq("costCapReached")
  ensure
    ENV.delete("AGENT_MONTHLY_COST_CENTS_CAP")
  end

  it "lista as gerações recentes da marca, com as fotos" do
    fake_gemini(:ok)
    request_images(count: 1)
    request_images(count: 1, prompt: "vitrine da padaria", origin: "editor")
    perform_enqueued_jobs(only: GenerateImagesJob)

    get base, headers: headers
    expect(json["generations"].map { |g| g["prompt"] }).to eq([ "vitrine da padaria", "pão de queijo saindo do forno" ])
    expect(json["available"]).to be(true)
    expect(json["costPerImage"]).to eq(CatalogSerializer::AI_COSTS[:image])
    expect(json["generations"].first["assets"].first).to include("kind" => "photo")

    get base, headers: headers, params: { origin: "editor", limit: 5 }
    expect(json["generations"].map { |g| g["origin"] }).to eq([ "editor" ])
  end

  describe Ai::GeminiImage do
    before { allow(described_class).to receive(:available?).and_call_original }

    def with_env(values)
      previous = values.keys.index_with { |key| ENV[key] }
      values.each { |key, value| ENV[key] = value }
      yield
    ensure
      previous.each { |key, value| ENV[key] = value }
    end

    it "acha a imagem em candidates[].content.parts[].inlineData" do
      data = Base64.strict_encode64("png!")
      payload = { "candidates" => [ { "content" => { "parts" => [ { "text" => "ok" }, { "inlineData" => { "mimeType" => "image/png", "data" => data } } ] } } ] }

      expect(described_class.image_from(payload).data).to eq("png!")
      expect(described_class.image_from({ "candidates" => [] })).to be_nil
      expect(described_class.refusal_from({ "promptFeedback" => { "blockReason" => "SAFETY" } })).to eq("SAFETY")
    end

    it "monta o endereço do Vertex: host sem região no global, regional nas demais" do
      with_env("GOOGLE_CLOUD_PROJECT" => "meu-projeto", "GOOGLE_CLOUD_LOCATION" => "global") do
        expect(described_class.endpoint.to_s).to eq("https://aiplatform.googleapis.com/v1/projects/meu-projeto/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent")
      end
      with_env("GOOGLE_CLOUD_PROJECT" => "meu-projeto", "GOOGLE_CLOUD_LOCATION" => "us-central1") do
        expect(described_class.endpoint.host).to eq("us-central1-aiplatform.googleapis.com")
      end
    end

    it "só liga com o Vertex pedido, o projeto e credenciais" do
      allow(described_class).to receive(:credentials).and_return(Object.new)
      with_env("GOOGLE_GENAI_USE_VERTEXAI" => "True", "GOOGLE_CLOUD_PROJECT" => "meu-projeto") do
        expect(described_class.available?).to be(true)
      end
      with_env("GOOGLE_GENAI_USE_VERTEXAI" => nil, "GOOGLE_CLOUD_PROJECT" => "meu-projeto") do
        expect(described_class.available?).to be(false)
      end
      allow(described_class).to receive(:credentials).and_return(nil)
      with_env("GOOGLE_GENAI_USE_VERTEXAI" => "True", "GOOGLE_CLOUD_PROJECT" => "meu-projeto") do
        expect(described_class.available?).to be(false)
      end
    end
  end
end
