require "rails_helper"

RSpec.describe Outreach::GoogleSheetImport do
  include ConnectorHelpers

  let(:url) { "https://docs.google.com/spreadsheets/d/planilha-1/export?format=csv&gid=0" }

  around { |example| with_env("GOOGLE_SHEETS_CLIENT_ID" => "cliente.apps.googleusercontent.com") { example.run } }

  def import(file_id: "planilha-1", sheet_gid: "0", access_token: "token-google")
    described_class.new(file_id: file_id, sheet_gid: sheet_gid, access_token: access_token).call
  end

  def refusal_code
    yield
    nil
  rescue Outreach::RefusedError => e
    e.code
  end

  it "devolve cabeçalhos e linhas, para a tela mapear" do
    stub_request(:get, url).to_return(status: 200, body: "nome,telefone\nAna,5531971810932\nBia,5531971810933\n")

    result = import

    expect(result.headers).to eq(%w[nome telefone])
    expect(result.rows).to eq([ { "nome" => "Ana", "telefone" => "5531971810932" }, { "nome" => "Bia", "telefone" => "5531971810933" } ])
  end

  it "manda o token da pessoa" do
    stub_request(:get, url).to_return(status: 200, body: "a\n1\n")

    import

    expect(a_request(:get, url).with(headers: { "Authorization" => "Bearer token-google" })).to have_been_made.once
  end

  it "célula vazia vira texto vazio" do
    stub_request(:get, url).to_return(status: 200, body: "nome,telefone\nAna,\n")

    expect(import.rows).to eq([ { "nome" => "Ana", "telefone" => "" } ])
  end

  it "lê acentos, mesmo com um byte inválido no meio" do
    stub_request(:get, url).to_return(status: 200, body: "nome\nJoão\xFF\n".b)

    expect(import.rows.first["nome"]).to start_with("João")
  end

  describe "parâmetros" do
    # Sem isto, um id montado subiria de caminho dentro de docs.google.com com o token da pessoa.
    it "recusa um id de arquivo fora do formato, sem chamar o Google" do
      expect(refusal_code { import(file_id: "../../drive/v3/files") }).to eq("googleSheetParamsRequired")
      expect(a_request(:any, /google/)).not_to have_been_made
    end

    it "recusa uma aba que não seja número" do
      expect(refusal_code { import(sheet_gid: "0&format=xlsx") }).to eq("googleSheetParamsRequired")
    end

    it "exige o token" do
      expect(refusal_code { import(access_token: " ") }).to eq("googleSheetParamsRequired")
    end

    it "aceita a aba como número, como a tela manda" do
      stub_request(:get, url).to_return(status: 200, body: "a\n1\n")

      expect(import(sheet_gid: 0).rows.size).to eq(1)
    end

    it "diz qual parâmetro faltou" do
      expect { import(file_id: "") }.to raise_error(Outreach::RefusedError) { |error| expect(error.field).to eq("fileId") }
    end
  end

  it "sem a configuração do Google, recusa sem chamar" do
    with_env("GOOGLE_SHEETS_CLIENT_ID" => nil) do
      expect(refusal_code { import }).to eq("googleSheetsNotConfigured")
    end

    expect(a_request(:any, /google/)).not_to have_been_made
  end

  describe "respostas do Google" do
    {
      401 => "googleTokenExpired",
      403 => "googleForbidden",
      404 => "googleSheetNotFound",
      500 => "googleSheetFailed"
    }.each do |status, code|
      it "#{status} vira #{code}" do
        stub_request(:get, url).to_return(status: status, body: "")

        expect(refusal_code { import }).to eq(code)
      end
    end
  end

  describe "o conteúdo" do
    it "planilha sem linhas" do
      stub_request(:get, url).to_return(status: 200, body: "nome,telefone\n")

      expect(refusal_code { import }).to eq("googleSheetEmpty")
    end

    it "planilha vazia" do
      stub_request(:get, url).to_return(status: 200, body: "")

      expect(refusal_code { import }).to eq("googleSheetEmpty")
    end

    it "mais linhas que o limite" do
      stub_const("#{described_class}::MAX_ROWS", 1)
      stub_request(:get, url).to_return(status: 200, body: "nome\nAna\nBia\n")

      expect(refusal_code { import }).to eq("googleSheetTooLarge")
    end

    it "CSV que não dá para ler" do
      stub_request(:get, url).to_return(status: 200, body: "nome,telefone\nAna,\"sem fechar\n")

      expect(refusal_code { import }).to eq("googleSheetInvalid")
    end
  end
end
