require "rails_helper"

RSpec.describe ContactsExportChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }

  def own_stream(account = owner, org = organization)
    described_class.organization_stream(org.id, described_class.stream_name(account.id))
  end

  it "assina a stream da pessoa, dentro da organização da sessão" do
    stub_connection current_account: owner

    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from(own_stream)
  end

  it "ignora organização e pessoa pedidas no parâmetro" do
    other = create(:account, organization: create(:organization))
    stub_connection current_account: owner

    subscribe(organizationId: other.organization_id, accountId: other.id)

    expect(subscription).to have_stream_from(own_stream)
    expect(subscription).not_to have_stream_from(own_stream(other, other.organization))
  end

  it "recusa quem não tem a permissão de contatos" do
    stub_connection current_account: member_with(chat: "all")

    subscribe

    expect(subscription).to be_rejected
  end

  describe "#export" do
    before do
      stub_connection current_account: owner
      subscribe
    end

    it "manda para o segundo plano, com os nomes em camelCase traduzidos" do
      expect {
        perform :export, selectAll: true, filters: { tagIds: [ "abc" ], assignedUser: "me" }, excludedIds: [ "x" ], chatIds: [ "y" ]
      }.to have_enqueued_job(ContactsExportJob).with(
        organization_id: organization.id,
        account_id: owner.id,
        filters: { "tag_ids" => [ "abc" ], "assigned_user" => "me" },
        select_all: true,
        chat_ids: [ "y" ],
        excluded_ids: [ "x" ]
      )
    end

    it "funciona sem nada, como `exportar tudo`" do
      expect { perform :export }.to have_enqueued_job(ContactsExportJob).with(
        organization_id: organization.id, account_id: owner.id, filters: {}, select_all: false, chat_ids: [], excluded_ids: []
      )
    end

    it "avisa quando não consegue enfileirar" do
      allow(ContactsExportJob).to receive(:perform_later).and_raise("redis caiu")

      expect {
        perform :export
      }.to have_broadcasted_to(own_stream).with(action: "error", data: { error: "Não foi possível exportar os contatos. Tente de novo." })
    end
  end

  it "não dispara para quem perdeu a permissão depois de assinar" do
    account = member_with(contacts: "all")
    stub_connection current_account: account
    subscribe
    account.access_role.update!(permissions: AccessRole::BLANK_PERMISSIONS)
    account.reload

    expect { perform :export }.not_to have_enqueued_job(ContactsExportJob)
  end
end
