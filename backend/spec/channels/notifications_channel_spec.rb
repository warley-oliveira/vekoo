require "rails_helper"

RSpec.describe NotificationsChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, role: "member") }

  before { stub_connection current_account: account }

  it "assina a stream da pessoa dentro da organização da sessão" do
    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from("org:#{organization.id}:notifications:#{account.id}")
  end

  it "ignora qualquer id que venha no subscribe: não há como ouvir outra pessoa" do
    other = create(:account, organization: organization, role: "member")

    subscribe(account_id: other.id, workspace_id: "outro")

    expect(subscription).not_to have_stream_from("org:#{organization.id}:notifications:#{other.id}")
    expect(subscription).to have_stream_from("org:#{organization.id}:notifications:#{account.id}")
  end

  it "transmite o total de não lidos das duas fontes ao assinar" do
    create(:notification, organization: organization)
    create(:account_notice, account: account)
    create(:account_notice, account: account, read_at: 1.minute.ago)

    subscribe

    expect(transmissions.last).to eq("unreadCount" => 2)
  end

  it "para as streams ao sair" do
    subscribe
    unsubscribe

    expect(subscription).not_to have_streams
  end
end
