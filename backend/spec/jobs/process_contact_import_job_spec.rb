require "rails_helper"

RSpec.describe ProcessContactImportJob, type: :job do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:contact_import) { create(:contact_import, organization: organization, connector_id: connector.id.to_s, total_contacts: 1) }

  def row(name: "Fernanda Lima", phone: "5531971810932", additional_data: {})
    create(:contact_import_row, contact_import: contact_import, name: name, phone: phone, additional_data: additional_data)
  end

  def run(ids = [ contact_import.id ], org_id = organization.id)
    described_class.perform_now(ids, org_id)
  end

  it "cria a conversa nova sem automação, com os padrões de todos os campos" do
    row

    run

    chat = Chat.where(connector_id: connector.id, external_id: "5531971810932").take
    expect(chat).to have_attributes(
      organization_id: organization.id,
      user_name: "Fernanda Lima",
      audience_type: "import_feature",
      automation_enabled: false,
      unread_messages: 0
    )
    expect(chat.last_message_at).to be < 1.day.ago
    expect(chat.created_at).to be < 1.day.ago
  end

  # Documento inserido por fora do Mongoid: campo ausente não casa em filtro nenhum.
  it "a conversa importada aparece em filtro de abertas" do
    row

    run

    expect(Chat.where(organization_id: organization.id, status: "open").count).to eq(1)
    stored = Chat.collection.find(connector_id: connector.id).first
    expect(stored).to include("status" => "open", "custom_attributes" => {}, "unread_messages" => 0, "flow_data" => {})
  end

  it "marca a importação e as linhas como concluídas" do
    processed_row = row

    run

    expect(processed_row.reload.status).to eq("completed")
    expect(processed_row.processed_at).to be_present
    expect(contact_import.reload).to have_attributes(status: "completed", imported_contacts_count: 1, errors_count: 0)
    expect(contact_import.started_at).to be_present
    expect(contact_import.completed_at).to be_present
  end

  it "não duplica quem já tem conversa, por qualquer forma do número" do
    existing = create(:chat, organization: organization, connector: connector, external_id: "5531971810932@s.whatsapp.net", last_message_at: 10.days.ago)
    row(phone: "553171810932")

    expect { run }.not_to change(Chat, :count)

    expect(existing.reload.last_message_at).to be > 1.minute.ago
  end

  it "não duplica a mesma pessoa repetida na planilha" do
    row(phone: "5531971810932")
    row(phone: "+55 (31) 97181-0932")

    expect { run }.to change(Chat, :count).by(1)
  end

  it "não confunde com conversa de outro canal" do
    create(:chat, organization: organization, connector: create(:connector_whatsapp_web, organization: organization), external_id: "5531971810932")
    row

    expect { run }.to change(Chat, :count).by(1)
  end

  describe "atribuição pela planilha" do
    let!(:attendant) { create(:account, organization: organization, role: "member", name: "Camila Rocha") }
    let!(:team) { create(:team, organization: organization, name: "Comercial") }

    it "acha pessoa e departamento pelo nome, sem ligar para caixa" do
      row(additional_data: { assigned_user_name: " camila rocha ", department_name: "COMERCIAL" })

      run

      expect(Chat.where(connector_id: connector.id).take).to have_attributes(assigned_account_id: attendant.id, team_id: team.id)
    end

    it "atribui também quem já tinha conversa" do
      existing = create(:chat, organization: organization, connector: connector, external_id: "5531971810932")
      row(additional_data: { assigned_user_name: "Camila Rocha" })

      run

      expect(existing.reload.assigned_account_id).to eq(attendant.id)
    end

    it "não atribui a quem está em setupOnly" do
      attendant.update!(setup_only: true)
      row(additional_data: { assigned_user_name: "Camila Rocha" })

      run

      expect(Chat.where(connector_id: connector.id).take.assigned_account_id).to be_nil
    end

    it "não atribui a pessoa de outra organização com o mesmo nome" do
      create(:account, organization: create(:organization), name: "Roberto Dias")
      row(additional_data: { assigned_user_name: "Roberto Dias" })

      run

      expect(Chat.where(connector_id: connector.id).take.assigned_account_id).to be_nil
    end
  end

  it "marca como falha a linha sem número, sem derrubar as outras" do
    bad = row(phone: "abc")
    good = row(name: "Roberto", phone: "5541999990000")
    contact_import.update!(total_contacts: 2)

    run

    expect(bad.reload).to have_attributes(status: "failed")
    expect(bad.error_message).to be_present
    expect(good.reload.status).to eq("completed")
    expect(contact_import.reload).to have_attributes(status: "completed", imported_contacts_count: 1, errors_count: 1)
    expect(Chat.where(connector_id: connector.id).count).to eq(1)
  end

  it "reprocessa só o que ficou pendente" do
    done = row(phone: "5541999990000")
    done.update!(status: "completed")
    row(name: "Nova", phone: "5531971810932")

    run

    expect(Chat.where(connector_id: connector.id).pluck(:user_name)).to eq([ "Nova" ])
  end

  it "não alcança importação de outra organização" do
    row

    run([ contact_import.id ], create(:organization).id)

    expect(contact_import.reload.status).to eq("pending")
    expect(Chat.count).to eq(0)
  end

  it "falha a importação cujo canal não existe mais" do
    row
    contact_import.update!(connector_id: BSON::ObjectId.new.to_s)

    run

    expect(contact_import.reload.status).to eq("failed")
  end

  it "marca como falha e deixa tentar de novo quando estoura" do
    row
    allow_any_instance_of(Mongo::Collection).to receive(:insert_many).and_raise(Mongo::Error::OperationFailure, "caiu")

    expect { described_class.new.perform([ contact_import.id ], organization.id) }.to raise_error(Mongo::Error::OperationFailure)

    expect(contact_import.reload.status).to eq("failed")
  end

  it "processa vários lotes de uma vez" do
    row
    other = create(:contact_import, organization: organization, connector_id: connector.id.to_s)
    create(:contact_import_row, contact_import: other, name: "Roberto", phone: "5541999990000")

    run([ contact_import.id, other.id ])

    expect(Chat.where(connector_id: connector.id).count).to eq(2)
    expect(other.reload.status).to eq("completed")
  end
end
