# frozen_string_literal: true

require "rails_helper"

RSpec.describe Chat, "domínio inbox" do
  let(:organization) { create(:organization) }

  describe "normalização automática dos campos personalizados" do
    let!(:definition) { create(:custom_field, name: "Volume Medio", organization_id: organization.id, auto_normalize: true) }

    it "normaliza o valor alterado quando o campo tem auto_normalize" do
      chat = create(:chat, organization: organization, custom_attributes: { "volume_medio" => "20 a 40/dia" })

      expect(chat.reload.custom_attributes["volume_medio"]).to eq("20")
    end

    it "respeita a estratégia do campo" do
      definition.update(normalization_strategy: "avg")
      chat = create(:chat, organization: organization, custom_attributes: { "volume_medio" => "20 a 40/dia" })

      expect(chat.reload.custom_attributes["volume_medio"]).to eq("30")
    end

    it "preserva o valor quando não há número extraível" do
      chat = create(:chat, organization: organization, custom_attributes: { "volume_medio" => "não informado" })

      expect(chat.reload.custom_attributes["volume_medio"]).to eq("não informado")
    end

    it "não toca campos sem regra" do
      chat = create(:chat, organization: organization, custom_attributes: { "origem" => "20 a 40/dia" })

      expect(chat.reload.custom_attributes["origem"]).to eq("20 a 40/dia")
    end

    it "não aplica regra de campo de outra organização" do
      chat = create(:chat, organization: create(:organization), custom_attributes: { "volume_medio" => "20 a 40/dia" })

      expect(chat.reload.custom_attributes["volume_medio"]).to eq("20 a 40/dia")
    end

    it "grava no campo de destino preservando o original quando há normalization_target_key" do
      definition.update(normalization_target_key: "volume_medio_normalizado")
      chat = create(:chat, organization: organization, custom_attributes: { "volume_medio" => "20 a 40/dia" })

      attributes = chat.reload.custom_attributes
      expect(attributes["volume_medio"]).to eq("20 a 40/dia")
      expect(attributes["volume_medio_normalizado"]).to eq("20")
    end

    it "normaliza em updates que mudam o valor" do
      chat = create(:chat, organization: organization)
      chat.custom_attributes = { "volume_medio" => "R$ 50.000,00" }
      chat.save!

      expect(chat.reload.custom_attributes["volume_medio"]).to eq("50000")
    end

    it "não consulta os campos quando o save não altera custom_attributes" do
      chat = create(:chat, organization: organization)
      allow(CustomField).to receive(:where).and_call_original

      chat.update(display_name: "Novo Nome")

      expect(CustomField).not_to have_received(:where)
    end

    it "não consulta os campos quando o valor é reatribuído sem mudança" do
      chat = create(:chat, organization: organization, custom_attributes: { "volume_medio" => "20" })
      allow(CustomField).to receive(:where).and_call_original

      chat.custom_attributes = { "volume_medio" => "20" }
      chat.save!

      expect(CustomField).not_to have_received(:where)
    end
  end

  describe ".visible_to" do
    let(:team) { create(:team, organization: organization) }
    let(:other_team) { create(:team, organization: organization) }
    let(:colleague) { create(:account, organization: organization, role: "member") }

    let!(:unowned) { create(:chat, organization: organization) }
    let!(:in_my_team) { create(:chat, organization: organization, team_id: team.id) }
    let!(:in_other_team) { create(:chat, organization: organization, team_id: other_team.id) }
    let!(:foreign) { create(:chat, organization: create(:organization)) }

    def visible_ids(account)
      described_class.visible_to(account).pluck(:id)
    end

    it "com chat_list_to all, vê a organização inteira e nada de fora" do
      account = member_with(chat: "all", chat_list_to: "all")

      expect(visible_ids(account)).to contain_exactly(unowned.id, in_my_team.id, in_other_team.id)
    end

    it "o dono vê tudo, sem precisar de grupo" do
      owner = create(:account, organization: organization, role: "owner")

      expect(visible_ids(owner)).to contain_exactly(unowned.id, in_my_team.id, in_other_team.id)
    end

    it "com chat_list_to team, vê as dos departamentos dela e as sem departamento" do
      account = member_of_team(team, chat: "all", chat_list_to: "team")
      assigned_elsewhere = create(:chat, organization: organization, assigned_account_id: colleague.id)

      expect(visible_ids(account)).to contain_exactly(unowned.id, in_my_team.id, assigned_elsewhere.id)
    end

    it "com chat_list_to assigned, vê as dela e as sem dono nem departamento" do
      account = member_with(chat: "all", chat_list_to: "assigned")
      mine = create(:chat, organization: organization, assigned_account_id: account.id, team_id: other_team.id)
      create(:chat, organization: organization, assigned_account_id: colleague.id)

      expect(visible_ids(account)).to contain_exactly(unowned.id, mine.id)
    end

    it "sem chat_list_to no grupo, não vê nada, e o critério continua servindo de $match" do
      role = create(:access_role, organization: organization, permissions: { "chat" => "all" })
      account = create(:account, organization: organization, role: "member", access_role: role)

      scope = described_class.visible_to(account)

      expect(scope.to_a).to be_empty
      expect(described_class.collection.aggregate([ { "$match" => scope.selector } ]).to_a).to be_empty
    end

    it "o seletor serve como está no $match de uma agregação" do
      account = member_with(chat: "all", chat_list_to: "assigned")

      rows = described_class.collection.aggregate([ { "$match" => described_class.visible_to(account).selector } ]).to_a

      expect(rows.map { |row| row["_id"] }).to contain_exactly(unowned.id)
    end
  end
end
