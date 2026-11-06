require "rails_helper"

# Dados da empresa, preferências do chat e fuso: o que `OrganizationRelations::Access`
# acrescenta à organização.
RSpec.describe Organization do
  let(:organization) { create(:organization, name: "Marina Duarte Conteúdo") }

  describe "fuso" do
    it "aceita um fuso que existe" do
      organization.timezone = "America/Manaus"

      expect(organization).to be_valid
    end

    it "recusa um fuso inventado ou vazio" do
      organization.timezone = "America/Atlantida"
      expect(organization).not_to be_valid

      organization.timezone = ""
      expect(organization).not_to be_valid
    end
  end

  describe "dados da empresa" do
    it "usa o nome da organização enquanto não houver razão social" do
      expect(organization.company_name).to eq("Marina Duarte Conteúdo")

      organization.update_with_settings!(company_info: { business_name: "Marina Duarte Ltda" })

      expect(organization.company_name).to eq("Marina Duarte Ltda")
    end

    it "formata o CNPJ e diz se ele está completo" do
      organization.update_with_settings!(company_info: { cnpj: "11222333000181" })

      expect(organization).to have_attributes(
        clean_cnpj: "11222333000181", formatted_cnpj: "11.222.333/0001-81", valid_cnpj?: true
      )
    end

    it "entende o CNPJ já formatado" do
      organization.update_with_settings!(company_info: { cnpj: "11.222.333/0001-81" })

      expect(organization).to have_attributes(clean_cnpj: "11222333000181", formatted_cnpj: "11.222.333/0001-81")
    end

    it "sem CNPJ, nada de formatado e não é válido" do
      expect(organization).to have_attributes(cnpj: nil, clean_cnpj: nil, formatted_cnpj: nil, valid_cnpj?: false)
    end

    it "recusa CNPJ incompleto" do
      expect {
        organization.update_with_settings!(company_info: { cnpj: "123" })
      }.to raise_error(ActiveRecord::RecordInvalid)

      expect(organization.reload.cnpj).to be_nil
    end

    it "limpa com vazio" do
      organization.update_with_settings!(company_info: { business_name: "X Ltda", cnpj: "11222333000181" })

      organization.update_with_settings!(company_info: { business_name: "  ", cnpj: "" })

      expect(organization.reload).to have_attributes(business_name: nil, cnpj: nil)
    end
  end

  describe "preferências do chat" do
    it "nascem desligadas" do
      expect(organization).to have_attributes(
        auto_remove_waiting_operator_tag: false, reopen_conversation_on_inbound_enabled: false
      )
    end

    it "salvar uma não apaga a outra" do
      organization.update_with_settings!(chat_settings: { auto_remove_waiting_operator_tag: true })
      organization.update_with_settings!(chat_settings: { reopen_conversation_on_inbound_enabled: true })

      expect(organization.reload).to have_attributes(
        auto_remove_waiting_operator_tag: true, reopen_conversation_on_inbound_enabled: true
      )
    end

    it "converte para booleano o que vem de formulário" do
      organization.update_with_settings!(chat_settings: { auto_remove_waiting_operator_tag: "true" })
      expect(organization.reload.auto_remove_waiting_operator_tag).to be(true)

      organization.update_with_settings!(chat_settings: { auto_remove_waiting_operator_tag: "false" })
      expect(organization.reload.auto_remove_waiting_operator_tag).to be(false)
    end

    it "ignora chave desconhecida" do
      organization.update_with_settings!(chat_settings: { outra_coisa: true })

      expect(organization.reload.settings["chat_settings"]).to eq({})
    end
  end

  describe "update_with_settings!" do
    it "grava atributos e settings juntos, ou nada" do
      expect {
        organization.update_with_settings!({ name: "" }, company_info: { business_name: "X Ltda" })
      }.to raise_error(ActiveRecord::RecordInvalid)

      organization.reload
      expect(organization.name).to eq("Marina Duarte Conteúdo")
      expect(organization.business_name).to be_nil
    end

    it "preserva settings de outros domínios" do
      organization.update!(settings: { "outro_dominio" => { "ligado" => true } })

      organization.update_with_settings!(chat_settings: { auto_remove_waiting_operator_tag: true })

      expect(organization.reload.settings["outro_dominio"]).to eq("ligado" => true)
    end
  end

  # Lido no caminho de toda mensagem recebida: não pode bater no Postgres a cada uma.
  describe ".reopen_on_inbound_enabled?" do
    it "responde false sem organização" do
      expect(described_class.reopen_on_inbound_enabled?(nil)).to be(false)
    end

    it "responde false para organização que não existe" do
      expect(described_class.reopen_on_inbound_enabled?(SecureRandom.uuid)).to be(false)
    end

    it "lê o que está gravado" do
      organization.update_with_settings!(chat_settings: { reopen_conversation_on_inbound_enabled: true })

      expect(described_class.reopen_on_inbound_enabled?(organization.id)).to be(true)
    end

    it "usa o cache: uma mudança por fora do método só vale depois do TTL" do
      expect(described_class.reopen_on_inbound_enabled?(organization.id)).to be(false)

      organization.update!(settings: { "chat_settings" => { "reopen_conversation_on_inbound_enabled" => true } })

      expect(described_class.reopen_on_inbound_enabled?(organization.id)).to be(false)
    end

    it "invalida o cache ao salvar pelo caminho certo" do
      expect(described_class.reopen_on_inbound_enabled?(organization.id)).to be(false)

      organization.update_with_settings!(chat_settings: { reopen_conversation_on_inbound_enabled: true })

      expect(described_class.reopen_on_inbound_enabled?(organization.id)).to be(true)
    end
  end

  it "apagar a organização leva os alertas junto" do
    alert = create(:organization_alert, organization: organization)

    organization.destroy!

    expect(OrganizationAlert.exists?(alert.id)).to be(false)
  end
end
