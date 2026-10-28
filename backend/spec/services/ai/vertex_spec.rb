require "rails_helper"

# Em produção a credencial é a chave de uma conta de serviço dedicada, em
# base64 num segredo do Kamal. Nada aqui toca a rede: montar a credencial não
# pede token.
RSpec.describe Ai::Vertex do
  def with_env(values)
    previous = values.keys.index_with { |key| ENV[key] }
    values.each { |key, value| ENV[key] = value }
    described_class.forget_credentials!
    yield
  ensure
    previous.each { |key, value| ENV[key] = value }
    described_class.forget_credentials!
  end

  let(:key) do
    {
      "type" => "service_account", "project_id" => "vekoo-teste", "private_key_id" => "abc123",
      "private_key" => OpenSSL::PKey::RSA.new(2048).to_pem, "client_email" => "vekoo-api-vertex@vekoo-teste.iam.gserviceaccount.com",
      "client_id" => "1", "token_uri" => "https://oauth2.googleapis.com/token"
    }
  end

  it "usa a conta de serviço do segredo, e não o ADC" do
    allow(Google::Auth).to receive(:get_application_default)

    with_env("GOOGLE_CREDENTIALS_BASE64" => Base64.strict_encode64(JSON.generate(key))) do
      credentials = described_class.credentials

      expect(credentials).to be_a(Google::Auth::ServiceAccountCredentials)
      expect(credentials.issuer).to eq("vekoo-api-vertex@vekoo-teste.iam.gserviceaccount.com")
      expect(Google::Auth).not_to have_received(:get_application_default)
    end
  end

  it "segredo inválido deixa indisponível — não cai em outra identidade" do
    allow(Google::Auth).to receive(:get_application_default)

    with_env("GOOGLE_CREDENTIALS_BASE64" => "isso não é base64", "GOOGLE_GENAI_USE_VERTEXAI" => "True", "GOOGLE_CLOUD_PROJECT" => "vekoo-teste") do
      expect(described_class.credentials).to be_nil
      expect(described_class).not_to be_available
      expect(Google::Auth).not_to have_received(:get_application_default)
    end
  end

  it "sem o segredo, usa o ADC do dev" do
    adc = Object.new
    allow(Google::Auth).to receive(:get_application_default).and_return(adc)

    with_env("GOOGLE_CREDENTIALS_BASE64" => nil) do
      expect(described_class.credentials).to be(adc)
    end
  end

  it "monta o endereço do modelo: sem região no global, regional nas demais" do
    with_env("GOOGLE_CLOUD_PROJECT" => "vekoo-teste") do
      expect(described_class.model_url("gemini-embedding-001", "predict", location: "us-central1").to_s)
        .to eq("https://us-central1-aiplatform.googleapis.com/v1/projects/vekoo-teste/locations/us-central1/publishers/google/models/gemini-embedding-001:predict")
      expect(described_class.model_url("m", "generateContent", location: "global").host).to eq("aiplatform.googleapis.com")
    end
  end
end
