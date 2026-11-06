require "rails_helper"

RSpec.describe ApplicationCable::Connection, type: :channel do
  let(:account) { create(:account) }

  it "conecta com o token da sessão" do
    session = Session.start!(account)

    connect "/cable?token=#{session.token}"

    expect(connection.current_account).to eq(account)
  end

  it "recusa token inválido" do
    expect { connect "/cable?token=errado" }.to have_rejected_connection
  end

  it "recusa sem token" do
    expect { connect "/cable" }.to have_rejected_connection
  end
end
