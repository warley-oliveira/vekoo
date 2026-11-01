require "rails_helper"

# O `global` do Vertex recusa por capacidade com frequência (429) e às vezes
# cai (503): duas novas tentativas, em 5 s e 15 s. Nada aqui toca a rede nem
# espera de verdade.
RSpec.describe Ai::GeminiImage do
  subject(:generator) { described_class.new }

  let(:image_payload) do
    {
      "candidates" => [ { "content" => { "parts" => [ { "inlineData" => { "mimeType" => "image/png", "data" => Base64.strict_encode64("png") } } ] } } ],
      "usageMetadata" => { "promptTokenCount" => 10, "candidatesTokenCount" => 1290 },
      "modelVersion" => "gemini-3.1-flash-image"
    }
  end

  def response(code, body)
    Net::HTTPResponse::CODE_TO_OBJ.fetch(code.to_s).new("1.1", code.to_s, "").tap do |http|
      http.instance_variable_set(:@read, true)
      http.instance_variable_set(:@body, body.is_a?(String) ? body : JSON.generate(body))
    end
  end

  def busy(code = 429) = response(code, { "error" => { "message" => "Resource has been exhausted (e.g. check quota)." } })

  def generate = generator.generate(prompt: "pão de fermentação natural", aspect_ratio: "4:5")

  before do
    allow(described_class).to receive_messages(
      vertex?: true, project: "vekoo-teste", authorization: "Bearer teste",
      endpoint: URI("https://aiplatform.googleapis.com/v1/projects/vekoo-teste/locations/global/publishers/google/models/m:generateContent")
    )
    allow(generator).to receive(:sleep)
  end

  it "429 e depois imagem: tenta de novo em 5 s" do
    allow(Net::HTTP).to receive(:start).and_return(busy, response(200, image_payload))

    expect(generate.image.data).to eq("png")
    expect(Net::HTTP).to have_received(:start).twice
    expect(generator).to have_received(:sleep).once.with(5)
  end

  it "dois 503 seguidos: espera 5 s e depois 15 s" do
    allow(Net::HTTP).to receive(:start).and_return(busy(503), busy(503), response(200, image_payload))

    expect(generate.image.mime_type).to eq("image/png")
    expect(generator).to have_received(:sleep).with(5).ordered
    expect(generator).to have_received(:sleep).with(15).ordered
  end

  it "o 503 em HTML do balanceador também conta como ocupado" do
    allow(Net::HTTP).to receive(:start).and_return(response(503, "<html>Service Unavailable</html>"), response(200, image_payload))

    expect(generate.image.data).to eq("png")
    expect(generator).to have_received(:sleep).once.with(5)
  end

  it "ocupado nas três: desiste com Busy, que ainda é um Failed" do
    allow(Net::HTTP).to receive(:start).and_return(busy, busy, busy)

    expect { generate }.to raise_error(described_class::Busy, /HTTP 429/) { |error| expect(error).to be_a(described_class::Failed) }
    expect(Net::HTTP).to have_received(:start).exactly(3).times
    expect(generator).to have_received(:sleep).twice
  end

  it "outros erros não esperam: 400 falha na hora e filtro de segurança vira Blocked" do
    allow(Net::HTTP).to receive(:start).and_return(response(400, { "error" => { "message" => "Invalid aspect ratio" } }))
    expect { generate }.to raise_error(described_class::Failed, /HTTP 400/) { |error| expect(error).not_to be_a(described_class::Busy) }

    allow(Net::HTTP).to receive(:start).and_return(response(400, { "error" => { "message" => "Blocked by safety filters" } }))
    expect { generate }.to raise_error(described_class::Blocked)

    expect(generator).not_to have_received(:sleep)
  end
end
