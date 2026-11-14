require "rails_helper"

RSpec.describe PieceChannel, type: :channel do
  it "assina as peças da própria organização" do
    account = create(:account)
    stub_connection current_account: account, current_organization: account.organization

    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_for(account.organization)
  end
end
