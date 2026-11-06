require "rails_helper"

# As regras de acesso que a fundação ainda não trazia: revogação (da origem,
# `user_access_revocation_spec.rb`), grupo da mesma organização e o que sai junto com a conta.
RSpec.describe Account do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, role: "member") }

  describe "escopos" do
    let!(:live) { account }
    let!(:revoked) { create(:account, organization: organization, role: "member", revoked_at: 1.day.ago) }

    it ".active filtra revoked_at nulo" do
      expect(described_class.active).to include(live)
      expect(described_class.active).not_to include(revoked)
    end

    it ".revoked é o inverso" do
      expect(described_class.revoked).to include(revoked)
      expect(described_class.revoked).not_to include(live)
    end
  end

  describe "#revoke! / #restore!" do
    it "revoke! grava revoked_at quando ainda não foi revogado" do
      account.revoke!

      expect(account.reload.revoked_at).to be_present
      expect(account).to be_revoked
    end

    it "revoke! é idempotente: não move a data na segunda chamada" do
      account.update!(revoked_at: 2.days.ago)
      original = account.revoked_at

      account.revoke!

      expect(account.reload.revoked_at).to be_within(1.second).of(original)
    end

    it "revoke! apaga as sessões" do
      session = Session.start!(account)

      account.revoke!

      expect(Session.exists?(session.id)).to be(false)
    end

    it "revoke! derruba o WebSocket sem pedir para reconectar" do
      expect { account.revoke! }
        .to have_broadcasted_to("action_cable/#{account.to_gid_param}").with(type: "disconnect", reconnect: false)
    end

    it "revoke! não falha se o tempo real estiver fora do ar" do
      allow(ActionCable.server).to receive(:broadcast).and_raise(Redis::CannotConnectError)

      expect { account.revoke! }.not_to raise_error
      expect(account.reload).to be_revoked
    end

    it "restore! limpa revoked_at" do
      account.update!(revoked_at: 2.days.ago)

      account.restore!

      expect(account.reload.revoked_at).to be_nil
      expect(account).not_to be_revoked
    end

    it "restore! não faz nada se não estava revogado" do
      expect { account.restore! }.not_to(change { account.reload.updated_at })
    end
  end

  describe "#end_sessions!" do
    it "derruba todas as sessões e o WebSocket" do
      sessions = [ Session.start!(account), Session.start!(account) ]

      expect { account.end_sessions! }.to have_broadcasted_to("action_cable/#{account.to_gid_param}")

      expect(Session.where(id: sessions.map(&:id))).to be_empty
    end

    it "poupa a sessão pedida, e aí o WebSocket dela fica" do
      kept = Session.start!(account)
      gone = Session.start!(account)

      expect { account.end_sessions!(except: kept) }
        .not_to have_broadcasted_to("action_cable/#{account.to_gid_param}")

      expect(Session.exists?(kept.id)).to be(true)
      expect(Session.exists?(gone.id)).to be(false)
    end
  end

  describe "Session.authenticate" do
    it "não aceita o token de quem foi revogado, nem na corrida com quem estava entrando" do
      session = Session.start!(account)
      account.update_column(:revoked_at, Time.current)

      expect(Session.authenticate(session.token)).to be_nil
    end

    it "volta a valer para uma sessão nova depois de restaurar" do
      account.revoke!
      account.restore!

      expect(Session.authenticate(Session.start!(account).token)).to be_present
    end
  end

  describe "grupo de permissões" do
    it "aceita grupo da organização" do
      account.access_role = organization.access_roles.first

      expect(account).to be_valid
    end

    it "recusa grupo de outra organização" do
      account.access_role = create(:organization).access_roles.first

      expect(account).not_to be_valid
      expect(account.errors.attribute_names).to include(:access_role_id)
    end

    it "recusa grupo que não existe, em vez de estourar na chave estrangeira" do
      account.access_role_id = SecureRandom.uuid

      expect(account).not_to be_valid
      expect(account.errors.attribute_names).to include(:access_role_id)
    end

    it "aceita ficar sem grupo" do
      account.access_role = nil

      expect(account).to be_valid
    end
  end

  describe "telefone e idioma" do
    it "tira espaços e vira nulo quando vazio" do
      account.update!(phone: "  5511987654321 ", locale: " en ")
      expect(account.reload).to have_attributes(phone: "5511987654321", locale: "en")

      account.update!(phone: "  ", locale: "")
      expect(account.reload).to have_attributes(phone: nil, locale: nil)
    end

    it "limita o telefone" do
      account.phone = "1" * 31

      expect(account).not_to be_valid
    end

    it "só aceita os idiomas que o produto fala" do
      account.locale = "pt-BR"
      expect(account).to be_valid

      account.locale = "fr"
      expect(account).not_to be_valid
    end
  end

  describe "ao apagar" do
    it "leva junto os avisos da pessoa, que no Mongo não têm chave estrangeira" do
      notice = create(:account_notice, account: account)
      other = create(:account_notice, account: create(:account, organization: organization, role: "member"))

      account.destroy!

      expect(AccountNotice.where(id: notice.id).exists?).to be(false)
      expect(AccountNotice.where(id: other.id).exists?).to be(true)
    end

    it "leva junto os dispositivos de push e os vínculos com departamentos" do
      device = create(:push_device, account: account)
      membership = create(:team_membership, account: account, team: create(:team, organization: organization))

      account.destroy!

      expect(PushDevice.exists?(device.id)).to be(false)
      expect(TeamMembership.exists?(membership.id)).to be(false)
    end
  end
end
