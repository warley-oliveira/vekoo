require "rails_helper"

# A base que toda a plataforma de atendimento herda: a organização vem da sessão,
# o front fala camelCase, a permissão bloqueia na API e a paginação é uma só.
RSpec.describe PlatformController, type: :request do
  before(:all) do
    stub_const_controller = Class.new(PlatformController) do
      self.opaque_params += %w[free_map]

      require_permission :campaigns, only: :restricted

      def echo
        render json: {
          snake: params[:some_field],
          nested: params.dig(:outer, :inner_key),
          opaque: params[:custom_attributes]&.to_unsafe_h,
          freeMap: params[:free_map]&.to_unsafe_h
        }
      end

      # Nome de duas palavras: é o caso em que o ParamsWrapper do Rails atrapalhava.
      def envelope
        render json: params.require(:foundation_probe).permit(:some_field).to_h
      end

      def context
        render json: { organizationId: Current.organization.id, accountId: Current.account.id, same: @organization == current_organization }
      end

      def restricted = head(:no_content)

      def paged
        records, meta = paginate(Account.where(organization_id: current_organization.id).order(:created_at))
        render json: { ids: records.map(&:id), meta: meta }
      end
    end
    Object.const_set(:FoundationProbeController, stub_const_controller)
  end

  after(:all) { Object.send(:remove_const, :FoundationProbeController) }

  around do |example|
    with_routing do |routes|
      routes.draw do
        post "probe/echo" => "foundation_probe#echo"
        post "probe/envelope" => "foundation_probe#envelope"
        get "probe/context" => "foundation_probe#context"
        get "probe/restricted" => "foundation_probe#restricted"
        get "probe/paged" => "foundation_probe#paged"
      end
      example.run
    end
  end

  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }

  it "exige sessão" do
    get "/probe/context"

    expect(response).to have_http_status(:unauthorized)
  end

  it "expõe a organização da sessão como contexto" do
    get "/probe/context", headers: auth_headers(owner)

    expect(json).to include("organizationId" => organization.id, "accountId" => owner.id, "same" => true)
  end

  it "converte camelCase para snake_case na entrada, preservando mapas livres" do
    post "/probe/echo",
      params: {
        someField: "a",
        outer: { innerKey: "b" },
        customAttributes: { campoDoUsuario: "c" },
        freeMap: { outraChave: "d" }
      },
      headers: auth_headers(owner),
      as: :json

    expect(json).to eq(
      "snake" => "a",
      "nested" => "b",
      "opaque" => { "campoDoUsuario" => "c" },
      "freeMap" => { "outraChave" => "d" }
    )
  end

  it "aceita envelope camelCase de duas palavras, sem o wrapper do Rails sobrescrever" do
    post "/probe/envelope",
      params: { foundationProbe: { someField: "a" } },
      headers: auth_headers(owner),
      as: :json

    expect(json).to eq("some_field" => "a")
  end

  it "não inventa envelope para JSON sem envelope" do
    post "/probe/envelope", params: { someField: "a" }, headers: auth_headers(owner), as: :json

    expect(response).to have_http_status(:bad_request)
    expect(json["error"]["code"]).to eq("parameterMissing")
  end

  describe "permissões" do
    it "dono passa por tudo" do
      get "/probe/restricted", headers: auth_headers(owner)

      expect(response).to have_http_status(:no_content)
    end

    it "grupo sem o recurso recebe 403 no formato padrão" do
      role = create(:access_role, :member, organization: organization)
      member = create(:account, organization: organization, role: "member", access_role: role)

      get "/probe/restricted", headers: auth_headers(member)

      expect(response).to have_http_status(:forbidden)
      expect(json["error"]["code"]).to eq("forbidden")
    end

    it "sem grupo valem os padrões de membro" do
      member = create(:account, organization: organization, role: "member")

      get "/probe/restricted", headers: auth_headers(member)

      expect(response).to have_http_status(:forbidden)
    end
  end

  it "pagina no formato único" do
    create_list(:account, 2, organization: organization)

    get "/probe/paged", params: { page: 2, perPage: 2 }, headers: auth_headers(owner)

    expect(json["ids"].size).to eq(1)
    expect(json["meta"]).to eq(
      "page" => 2, "perPage" => 2, "total" => 3, "totalPages" => 2, "hasMore" => false
    )
  end
end
