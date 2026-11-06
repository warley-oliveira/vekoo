require "rails_helper"

RSpec.describe OauthCredential do
  include ActiveSupport::Testing::TimeHelpers
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:endpoint) { "https://erp.exemplo.com.br/oauth/token" }

  def valid_token_data(token = "token-valido")
    { access_token: token, token_type: "Bearer" }.to_json
  end

  def credential_with_token(token: "token-valido", expires_at: 1.hour.from_now, **attributes)
    create(:oauth_credential, organization: organization, token_data: valid_token_data(token), expires_at: expires_at, **attributes)
  end

  def stub_renewal(token: "token-novo", expires_in: 3600)
    stub_request(:post, endpoint).to_return(json_reply({ access_token: token, expires_in: expires_in }.compact))
  end

  # O valor na coluna, sem passar pelos acessores do modelo.
  def raw_column(credential, column)
    described_class.connection.select_value("SELECT #{column} FROM oauth_credentials WHERE id = #{described_class.connection.quote(credential.id)}")
  end

  describe "validações" do
    it "exige nome, endereço, id e segredo do cliente" do
      credential = described_class.new(organization: organization)

      expect(credential).not_to be_valid
      expect(credential.errors.attribute_names).to include(:key_name, :endpoint, :client_id, :client_secret)
    end

    it "exige a organização" do
      credential = build(:oauth_credential, organization: nil)

      expect(credential).not_to be_valid
      expect(credential.errors[:organization]).to be_present
    end

    it "não repete o nome na mesma organização" do
      create(:oauth_credential, organization: organization, key_name: "erp")

      expect(build(:oauth_credential, organization: organization, key_name: "erp")).not_to be_valid
    end

    it "deixa repetir o nome em outra organização" do
      create(:oauth_credential, organization: organization, key_name: "erp")

      expect(build(:oauth_credential, organization: create(:organization), key_name: "erp")).to be_valid
    end

    it "só aceita endereço http ou https" do
      expect(build(:oauth_credential, endpoint: "http://erp.local/token")).to be_valid
      expect(build(:oauth_credential, endpoint: "https://erp.local/token")).to be_valid
      expect(build(:oauth_credential, endpoint: "ftp://erp.local/token")).not_to be_valid
      expect(build(:oauth_credential, endpoint: "não é url")).not_to be_valid
    end
  end

  describe "cifra em repouso" do
    let(:credential) { credential_with_token(client_secret: "segredo-do-cliente", token: "token-secreto") }

    it "guarda o segredo cifrado na coluna" do
      stored = raw_column(credential, "client_secret")

      expect(stored).to be_present
      expect(stored).not_to include("segredo-do-cliente")
    end

    it "guarda o token cifrado na coluna" do
      stored = raw_column(credential, "token_data")

      expect(stored).to be_present
      expect(stored).not_to include("token-secreto")
    end

    it "devolve os valores originais ao ler do banco" do
      loaded = described_class.find(credential.id)

      expect(loaded.client_secret).to eq("segredo-do-cliente")
      expect(JSON.parse(loaded.token_data)).to include("access_token" => "token-secreto")
    end

    it "valida a presença pelo valor decifrado" do
      expect(build(:oauth_credential, client_secret: "")).not_to be_valid
    end

    it "não devolve lixo com texto cifrado adulterado" do
      described_class.connection.execute("UPDATE oauth_credentials SET token_data = 'adulterado' WHERE id = #{described_class.connection.quote(credential.id)}")

      expect(described_class.find(credential.id).token_data).to be_nil
    end

    it "guarda nil sem cifrar" do
      credential.update!(token_data: nil)

      expect(raw_column(credential, "token_data")).to be_nil
    end
  end

  describe "#access_token" do
    context "com token válido" do
      it "devolve o que tem, sem chamar o servidor" do
        credential = credential_with_token

        expect(credential.access_token).to eq("token-valido")
        expect(a_request(:post, endpoint)).not_to have_been_made
      end
    end

    context "sem token ou com token vencido" do
      it "renova quando nunca teve token" do
        credential = create(:oauth_credential, organization: organization)
        stub_renewal

        expect(credential.access_token).to eq("token-novo")
      end

      it "renova o que venceu" do
        credential = credential_with_token(expires_at: 1.minute.ago)
        stub_renewal

        expect(credential.access_token).to eq("token-novo")
      end

      it "renova quando falta menos que a folga: ninguém recebe token prestes a vencer" do
        credential = credential_with_token(expires_at: 4.minutes.from_now)
        stub_renewal

        expect(credential.access_token).to eq("token-novo")
      end

      it "não renova com folga de sobra" do
        credential = credential_with_token(expires_at: 6.minutes.from_now)

        expect(credential.access_token).to eq("token-valido")
      end

      it "manda as credenciais do cliente em JSON" do
        credential = create(:oauth_credential, organization: organization, client_id: "cliente", client_secret: "segredo")
        request = stub_request(:post, endpoint)
          .with(headers: { "Content-Type" => "application/json" }, body: { client_id: "cliente", client_secret: "segredo", grant_type: "client_credentials" }.to_json)
          .to_return(json_reply({ access_token: "token-novo", expires_in: 60 }))

        credential.access_token

        expect(request).to have_been_requested
      end
    end

    # Regressão: o token ficava memoizado no objeto, e quem já o tinha lido continuava com o
    # antigo depois de renovar.
    context "depois de renovar" do
      it "devolve o novo na mesma instância que já tinha lido o antigo" do
        credential = credential_with_token(token: "token-antigo", expires_at: 10.minutes.from_now)
        expect(credential.access_token).to eq("token-antigo")
        stub_renewal(token: "token-novo", expires_in: 7200)

        travel(9.minutes) do
          expect(credential.access_token).to eq("token-novo")
          expect(credential.access_token).to eq("token-novo")
        end

        expect(a_request(:post, endpoint)).to have_been_made.once
      end

      it "#refresh_token! também não deixa o antigo para trás" do
        credential = credential_with_token(token: "token-antigo")
        expect(credential.access_token).to eq("token-antigo")
        stub_renewal(token: "token-novo")

        credential.refresh_token!

        expect(credential.access_token).to eq("token-novo")
      end

      it "grava o token novo cifrado e a validade" do
        credential = create(:oauth_credential, organization: organization)
        stub_renewal(token: "token-novo", expires_in: 7200)

        credential.access_token

        loaded = described_class.find(credential.id)
        expect(JSON.parse(loaded.token_data)).to include("access_token" => "token-novo")
        expect(loaded.expires_at).to be_within(5.seconds).of(2.hours.from_now)
        expect(raw_column(credential, "token_data")).not_to include("token-novo")
      end

      it "vale uma hora quando o servidor não diz a validade" do
        credential = create(:oauth_credential, organization: organization)
        stub_renewal(expires_in: nil)

        credential.access_token

        expect(credential.reload.expires_at).to be_within(5.seconds).of(1.hour.from_now)
      end
    end

    # Regressão: dois processos com o mesmo registro. O bloqueio relê a linha, mas o token
    # memoizado sobrevivia à releitura.
    context "quando outro processo renovou" do
      it "devolve o token renovado por ele, sem renovar de novo" do
        here = credential_with_token(token: "token-antigo", expires_at: 10.minutes.from_now)
        expect(here.access_token).to eq("token-antigo")

        there = described_class.find(here.id)
        there.update!(token_data: valid_token_data("token-do-outro"), expires_at: 1.hour.from_now)

        expect(here.access_token).to eq("token-do-outro")
        expect(a_request(:post, endpoint)).not_to have_been_made
      end
    end

    it "lê a linha com bloqueio: dois processos não renovam ao mesmo tempo" do
      credential = credential_with_token
      statements = []
      subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") { |*, payload| statements << payload[:sql] }

      credential.access_token

      expect(statements.grep(/FOR UPDATE/)).not_to be_empty
    ensure
      ActiveSupport::Notifications.unsubscribe(subscriber)
    end

    context "quando a renovação falha" do
      let(:credential) { credential_with_token(expires_at: 1.minute.ago) }

      it "levanta com o status" do
        stub_request(:post, endpoint).to_return(status: 401, body: "credencial ruim")

        expect { credential.access_token }.to raise_error(StandardError, /Status: 401/)
      end

      it "não põe o corpo da resposta no erro: ele pode ecoar a credencial" do
        stub_request(:post, endpoint).to_return(status: 400, body: "client_secret=segredo-do-cliente inválido")

        expect { credential.access_token }.to raise_error { |error| expect(error.message).not_to include("segredo-do-cliente") }
      end

      it "não escreve credencial nem token no log" do
        stub_request(:post, endpoint).to_return(status: 400, body: "client_secret=segredo-do-cliente inválido")

        log = captured_log do
          expect { credential.access_token }.to raise_error(StandardError)
        end

        expect(log).to include("Status: 400")
        expect(log).not_to include("segredo-do-cliente", "token-valido")
      end

      it "propaga a falha de rede" do
        stub_request(:post, endpoint).to_timeout

        expect { credential.access_token }.to raise_error(Net::OpenTimeout)
      end

      it "não apaga o que estava guardado" do
        stub_request(:post, endpoint).to_return(status: 500, body: "")

        expect { credential.access_token }.to raise_error(StandardError)

        expect(JSON.parse(described_class.find(credential.id).token_data)).to include("access_token" => "token-valido")
      end
    end

    it "lê a resposta do servidor mesmo sem o cabeçalho de JSON" do
      credential = create(:oauth_credential, organization: organization)
      stub_request(:post, endpoint).to_return(status: 200, body: { access_token: "token-novo", expires_in: 3600 }.to_json, headers: { "Content-Type" => "text/plain" })

      expect(credential.access_token).to eq("token-novo")
      expect(credential.reload.expires_at).to be_within(5.seconds).of(1.hour.from_now)
    end

    it "não escreve o token novo no log" do
      credential = create(:oauth_credential, organization: organization)
      stub_renewal(token: "token-novo")

      log = captured_log { credential.access_token }

      expect(log).to include("Token renovado")
      expect(log).not_to include("token-novo")
    end
  end

  describe "#token_valid?" do
    it "é falso sem dados" do
      expect(build(:oauth_credential).token_valid?).to be(false)
    end

    it "é falso com dados sem access_token" do
      expect(build(:oauth_credential, token_data: { token_type: "Bearer" }.to_json, expires_at: 1.hour.from_now).token_valid?).to be(false)
    end

    it "é falso com JSON quebrado" do
      expect(build(:oauth_credential, token_data: "não é json", expires_at: 1.hour.from_now).token_valid?).to be(false)
    end

    it "é falso sem validade" do
      expect(build(:oauth_credential, token_data: valid_token_data).token_valid?).to be(false)
    end

    it "é verdadeiro dentro da validade, descontada a folga" do
      expect(build(:oauth_credential, token_data: valid_token_data, expires_at: 6.minutes.from_now).token_valid?).to be(true)
      expect(build(:oauth_credential, token_data: valid_token_data, expires_at: 4.minutes.from_now).token_valid?).to be(false)
    end
  end

  describe "#clear_token!" do
    it "apaga o token e a validade, e a próxima leitura renova" do
      credential = credential_with_token
      expect(credential.access_token).to eq("token-valido")

      credential.clear_token!

      expect(credential.reload).to have_attributes(token_data: nil, expires_at: nil)
      stub_renewal(token: "token-novo")
      expect(credential.access_token).to eq("token-novo")
    end
  end

  describe "escopos" do
    let!(:valid) { credential_with_token(expires_at: 1.hour.from_now) }
    let!(:expired) { credential_with_token(expires_at: 1.hour.ago) }
    let!(:never) { create(:oauth_credential, organization: organization) }

    it ".valid lista o que ainda não venceu" do
      expect(described_class.valid).to contain_exactly(valid)
    end

    it ".expired lista o que venceu ou nunca teve token" do
      expect(described_class.expired).to contain_exactly(expired, never)
    end
  end

  it "some junto com a organização" do
    credential = credential_with_token

    organization.oauth_credentials.destroy_all

    expect(described_class.where(id: credential.id)).to be_empty
    expect(organization.oauth_credentials).to be_empty
  end
end
