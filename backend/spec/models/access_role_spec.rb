require "rails_helper"

RSpec.describe AccessRole do
  it "toda organização nasce com os dois grupos padrão" do
    organization = create(:organization)

    expect(organization.access_roles.pluck(:name)).to contain_exactly("Gerente", "Usuário")
  end

  it "resolve o nível de acesso da pessoa pelo grupo" do
    organization = create(:organization)
    role = create(:access_role, organization: organization, permissions: { "chat" => "own" })
    account = create(:account, organization: organization, role: "member", access_role: role)

    expect(account.permission_level(:chat)).to eq("own")
    expect(account.can?(:chat)).to be(true)
    expect(account.can?(:campaigns)).to be(false)
  end

  it "dono tem acesso total independentemente do grupo" do
    account = create(:account, role: "owner")

    expect(account.permission_map.values.uniq).to eq([ "all" ])
  end
end
