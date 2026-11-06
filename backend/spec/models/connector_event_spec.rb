require "rails_helper"

RSpec.describe ConnectorEvent do
  include ConnectorHelpers

  let(:organization_id) { SecureRandom.uuid }

  def build_event(parameters_json = '{"id": {employee.id}}', **attributes)
    build(:connector_event, organization_id: organization_id, parameters_json: parameters_json, **attributes)
  end

  describe "validações" do
    %i[name event_name description method url].each do |field|
      it "exige #{field}" do
        event = build_event(field => "")

        expect(event).not_to be_valid
        expect(event.errors[field]).to be_present
      end
    end

    it "só aceita os eventos da lista" do
      event = build_event(event_name: "create_appointment")

      expect(event).not_to be_valid
      expect(event.errors[:event_name]).to be_present
    end

    described_class::EVENTS_PARAMETERS.each_key do |name|
      it "aceita #{name}" do
        expect(build_event(event_name: name.to_s)).to be_valid
      end
    end

    it "grava com tudo certo" do
      expect(build_event.tap(&:save!)).to be_persisted
    end
  end

  describe "padrões" do
    it "manda JSON e traz um exemplo de corpo para a tela" do
      event = described_class.new

      expect(event.headers).to eq([ [ "Content-Type", "application/json" ] ])
      expect(event.variables_path).to eq({})
      expect(JSON.parse(event.parameters_json)).to include("parameter_string" => "string value")
    end
  end

  describe "corpo com variáveis" do
    it "aceita variável sem aspas e mantém no corpo interpretado" do
      event = build_event('{"id": {employee.id}, "ativo": true}')

      expect(event).to be_valid
      expect(event.parsed_json).to eq('{"id": {employee.id}, "ativo": true}')
    end

    it "aceita variável de uma palavra" do
      expect(build_event('{"id": {codigo}}')).to be_valid
    end

    it "recusa JSON quebrado" do
      event = build_event('{"id": ')

      expect(event).not_to be_valid
      expect(event.errors[:parameters_json]).to include("is not a valid JSON")
      expect(event.parsed_json).to be_nil
    end

    it "recusa corpo vazio ou nulo como JSON inválido, sem levantar" do
      [ "", nil ].each do |empty|
        event = build_event(empty)

        expect(event).not_to be_valid
        expect(event.errors[:parameters_json]).to include("is not a valid JSON")
      end
    end

    it "aceita corpo congelado: ele não pode ser alterado no lugar" do
      expect(build_event('{"id": {employee.id}}'.freeze)).to be_valid
    end

    it "não altera o corpo que a pessoa escreveu" do
      event = build_event('{"id": {employee.id}}')

      event.valid?

      expect(event.parameters_json).to eq('{"id": {employee.id}}')
    end
  end

  describe "sem CustomField (é do domínio inbox e ainda pode não existir)" do
    before { hide_const("CustomField") }

    %w[user system].each do |scope|
      it "recusa {#{scope}.x}: variável nenhuma resolve" do
        event = build_event(%({"a": {#{scope}.cidade}}))

        expect(event).not_to be_valid
        expect(event.errors[:parameters_json].join).to include("Invalid variable: #{scope}.cidade")
        expect(event.parsed_json).to be_nil
      end
    end

    it "continua aceitando as variáveis do próprio evento" do
      expect(build_event('{"id": {employee.id}}')).to be_valid
    end

    it "#custom_field devolve nil" do
      expect(build_event.custom_field(caption: "cidade", type: "user")).to be_nil
    end
  end

  describe "com CustomField" do
    let(:definition) { double("CustomField", id: "DEF-1") }
    let(:custom_fields) { double("CustomField") }

    before do
      stub_const("CustomField", custom_fields)
      allow(custom_fields).to receive(:find_by).and_return(nil)
    end

    it "troca a legenda pelo id no corpo interpretado" do
      allow(custom_fields).to receive(:find_by).with(organization_id: organization_id, caption: "cidade", type: "user").and_return(definition)
      event = build_event('{"a": {user.cidade}}')

      expect(event).to be_valid
      expect(event.parsed_json).to eq('{"a": {user.DEF-1}}')
      expect(event.parameters_json).to eq('{"a": {user.cidade}}')
    end

    it "aceita o id direto" do
      allow(custom_fields).to receive(:find_by).with(organization_id: organization_id, id: "DEF1", type: "system").and_return(double(id: "DEF1"))
      event = build_event('{"a": {system.DEF1}}')

      expect(event).to be_valid
      expect(event.parsed_json).to eq('{"a": {system.DEF1}}')
    end

    it "recusa variável que não existe" do
      event = build_event('{"a": {user.nao_existe}}')

      expect(event).not_to be_valid
      expect(event.errors[:parameters_json].join).to include("Invalid variable: user.nao_existe")
    end

    it "procura só na organização do evento" do
      build_event('{"a": {user.cidade}}').valid?

      expect(custom_fields).to have_received(:find_by).with(organization_id: organization_id, caption: "cidade", type: "user")
    end

    it "#custom_field trata exceção da busca como não encontrado" do
      allow(custom_fields).to receive(:find_by).and_raise(StandardError, "banco fora do ar")

      expect(build_event.custom_field(caption: "x", type: "user")).to be_nil
    end
  end

  describe "#execute" do
    let(:url) { "https://erp.exemplo.com.br/profissionais" }

    def event_for(method)
      build(:connector_event, method: method, url: url, headers: [ [ "Authorization", "Bearer erp" ], [ "Content-Type", "application/json" ] ])
    end

    %w[post put patch].each do |method|
      it "#{method} manda o corpo e os cabeçalhos" do
        request = stub_request(method.to_sym, url)
          .with(body: '{"id":1}', headers: { "Authorization" => "Bearer erp" })
          .to_return(status: 200, body: "")

        event_for(method).execute('{"id":1}')

        expect(request).to have_been_requested
      end
    end

    %w[get delete].each do |method|
      it "#{method} não manda corpo" do
        request = stub_request(method.to_sym, url).with(headers: { "Authorization" => "Bearer erp" }).to_return(status: 200, body: "")

        event_for(method).execute('{"id":1}')

        expect(request).to have_been_requested
        expect(a_request(method.to_sym, url).with(body: '{"id":1}')).not_to have_been_made
      end
    end

    it "aceita o verbo em maiúsculas e com espaço" do
      request = stub_request(:post, url).to_return(status: 200, body: "")

      event_for(" POST ").execute("{}")

      expect(request).to have_been_requested
    end

    it "devolve a resposta" do
      stub_request(:post, url).to_return(json_reply({ id: "X" }, status: 201))

      expect(event_for("post").execute("{}").code).to eq(201)
    end

    it "devolve nil com verbo desconhecido, sem chamar nada" do
      expect(event_for("trace").execute("{}")).to be_nil
      expect(a_request(:any, url)).not_to have_been_made
    end
  end
end
