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

  describe "níveis de acesso" do
    let(:role) { build(:access_role) }

    it "aceita os níveis que existem" do
      role.permissions = { "chat" => "all", "contacts" => "own", "campaigns" => "none", "chat_list_to" => "assigned" }

      expect(role).to be_valid
    end

    # "Qualquer valor diferente de none libera": um nível inventado daria acesso.
    it "recusa nível inventado" do
      role.permissions = { "chat" => "talvez" }

      expect(role).not_to be_valid
      expect(role.errors.attribute_names).to eq([ :permissions ])
    end

    it "recusa recurso que não existe" do
      role.permissions = { "banana" => "all" }

      expect(role).not_to be_valid
    end

    it "recusa o que não é mapa" do
      role.permissions = [ "chat" ]

      expect(role).not_to be_valid
    end

    it "chat_list_to tem valores próprios: diz quais conversas a pessoa enxerga" do
      expect(described_class::CHAT_LIST_LEVELS).to eq(%w[all team assigned])

      role.permissions = { "chat_list_to" => "team" }
      expect(role).to be_valid

      role.permissions = { "chat_list_to" => "none" }
      expect(role).not_to be_valid
    end

    it "um grupo novo parte de nada liberado" do
      permissions = described_class::BLANK_PERMISSIONS

      expect(permissions.keys).to match_array(described_class::KEYS)
      expect(permissions.except("chat_list_to").values.uniq).to eq([ "none" ])
      expect(permissions["chat_list_to"]).to eq("all")
    end
  end

  describe "grupos padrão" do
    let(:organization) { create(:organization) }
    let(:manager) { organization.access_roles.find_by!(name: "Gerente") }
    let(:member) { organization.access_roles.find_by!(name: "Usuário") }
    let(:custom) { create(:access_role, organization: organization, name: "Atendimento") }

    it "são reconhecidos, com o código que a tela traduz" do
      expect(manager).to have_attributes(default?: true, default_key: "manager")
      expect(member).to have_attributes(default?: true, default_key: "member")
      expect(custom).to have_attributes(default?: false, default_key: nil)
    end

    it "não mudam de nome" do
      manager.name = "Chefia"

      expect(manager).not_to be_valid
      expect(manager.errors.attribute_names).to eq([ :name ])
    end

    it "continuam padrão enquanto a renomeação não é salva" do
      manager.name = "Chefia"

      expect(manager.default_key).to eq("manager")
    end

    it "grupo comum muda de nome" do
      custom.name = "Suporte"

      expect(custom).to be_valid
    end

    it "não saem" do
      expect(manager.destroy).to be(false)
      expect(described_class.exists?(manager.id)).to be(true)
    end

    it "grupo comum sai" do
      expect(custom.destroy).to be_truthy
    end

    it "saem junto com a organização: a regra é para o pedido direto" do
      organization.access_roles.load

      expect { organization.destroy! }.not_to raise_error
      expect(described_class.where(organization_id: organization.id)).to be_empty
    end

    it "semear de novo não duplica nem desfaz o que a organização editou" do
      member.update!(permissions: member.permissions.merge("pipelines" => "all"))

      expect { described_class.seed_defaults_for(organization) }.not_to change(described_class, :count)
      expect(member.reload.permissions["pipelines"]).to eq("all")
    end
  end

  it "ao sair, deixa as pessoas sem grupo, valendo pelos padrões de membro" do
    role = create(:access_role)
    account = create(:account, organization: role.organization, role: "member", access_role: role)

    role.destroy!

    expect(account.reload.access_role_id).to be_nil
    expect(account.permission_map).to eq(AccessRole::MEMBER_PERMISSIONS)
  end
end
