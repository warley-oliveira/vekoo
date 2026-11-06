require "rails_helper"

RSpec.describe ApplicationCable::Connection, type: :channel do
  let(:account) { create(:account, role: "member") }

  it "recusa o WebSocket de quem foi revogado, mesmo com a sessão ainda de pé" do
    session = Session.start!(account)
    account.update_column(:revoked_at, Time.current)

    expect { connect "/cable?token=#{session.token}" }.to have_rejected_connection
  end

  it "volta a aceitar depois de restaurar, com uma sessão nova" do
    account.revoke!
    account.restore!

    connect "/cable?token=#{Session.start!(account).token}"

    expect(connection.current_account).to eq(account)
  end
end
