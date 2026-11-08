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

  describe "com o vínculo da aba (`account`)" do
    let(:clinic_account) { create(:account, user: account.user, role: "member") }
    let(:outsider) { create(:account) }
    let(:token) { Session.start!(account.user).token }

    it "a conexão fica presa ao vínculo pedido" do
      connect "/cable?token=#{token}&account=#{clinic_account.hashid}"

      expect(connection.current_account).to eq(clinic_account)
      expect(connection.current_user).to eq(account.user)
    end

    it "sem o hashid, com duas organizações, recusa: não escolhe por ninguém" do
      clinic_account

      expect { connect "/cable?token=#{token}" }.to have_rejected_connection
    end

    it "recusa o vínculo de outra pessoa, pelo hashid ou pelo UUID" do
      expect { connect "/cable?token=#{token}&account=#{outsider.hashid}" }.to have_rejected_connection
      expect { connect "/cable?token=#{token}&account=#{outsider.id}" }.to have_rejected_connection
      expect { connect "/cable?token=#{token}&account=#{outsider.organization_id}" }.to have_rejected_connection
    end

    it "recusa o vínculo revogado, e aceita o outro da mesma pessoa" do
      clinic_account.update_column(:revoked_at, Time.current)

      expect { connect "/cable?token=#{token}&account=#{clinic_account.hashid}" }.to have_rejected_connection

      connect "/cable?token=#{token}&account=#{account.hashid}"
      expect(connection.current_account).to eq(account)
    end

    it "aceita o vínculo de suporte só de quem é suporte" do
      support = create(:account, :support)
      master_token = Session.start!(support.user).token

      connect "/cable?token=#{master_token}&account=#{support.hashid}"
      expect(connection.current_account).to eq(support)

      support.user.update!(master: false)
      expect { connect "/cable?token=#{master_token}&account=#{support.hashid}" }.to have_rejected_connection
    end
  end
end
