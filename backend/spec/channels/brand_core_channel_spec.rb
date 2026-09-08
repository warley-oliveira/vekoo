require "rails_helper"

RSpec.describe BrandCoreChannel, type: :channel do
  let(:account) { create(:account) }

  it "assina os avisos da própria organização" do
    stub_connection current_account: account

    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_for(account.organization)
  end

  it "entrega o que o servidor transmite para a organização" do
    stub_connection current_account: account
    subscribe

    expect {
      BrandCoreChannel.broadcast_to(account.organization, { "event" => "updated" })
    }.to have_broadcasted_to(account.organization).from_channel(BrandCoreChannel)
  end
end
