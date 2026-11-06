require "rails_helper"

RSpec.describe AccountNotice do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, role: "member") }

  describe "validações" do
    subject(:notice) { build(:account_notice, account: account) }

    it { is_expected.to be_valid }

    it "exige pessoa, organização, título e descrição" do
      notice.account_id = nil
      notice.organization_id = nil
      notice.title = ""
      notice.description = ""

      expect(notice).not_to be_valid
      expect(notice.errors.attribute_names).to include(:account_id, :organization_id, :title, :description)
    end

    it "limita título em 255 e descrição em 1000" do
      notice.title = "x" * 256
      notice.description = "x" * 1001

      expect(notice).not_to be_valid
      expect(notice.errors.attribute_names).to include(:title, :description)
    end

    it "só aceita as categorias da origem" do
      expect(described_class::CATEGORIES).to eq(%w[chat calendar system general])

      notice.category = "outra"
      expect(notice).not_to be_valid
    end
  end

  describe "ao nascer" do
    it "transmite para a pessoa, com o aviso e o novo total" do
      create(:notification, organization: organization)
      stream = NotificationsChannel.account_stream(organization.id, account.id)

      expect {
        create(:account_notice, account: account, title: "Conversa atribuída a você")
      }.to have_broadcasted_to(stream).with { |payload|
        expect(payload["notification"]).to include("title" => "Conversa atribuída a você", "key" => nil, "read" => false)
        expect(payload["unreadCount"]).to eq(2)
      }
    end

    it "não transmite para colega" do
      colleague = create(:account, organization: organization, role: "member")

      expect {
        create(:account_notice, account: account)
      }.not_to have_broadcasted_to(NotificationsChannel.account_stream(organization.id, colleague.id))
    end

    it "dispara o push para a pessoa, com título, texto e destino do aviso" do
      allow(Push::Delivery).to receive(:send_notification)

      notice = create(:account_notice, account: account, title: "Novo agendamento", description: "Com Ana", url: "/calendar")

      expect(Push::Delivery).to have_received(:send_notification).with(
        account, "Novo agendamento", "Com Ana",
        hash_including(url: "/calendar", tag: "notice-#{notice.id}", data: { noticeId: notice.id.to_s, category: "calendar" })
      )
    end

    it "não falha por falta de VAPID: o aviso nasce do mesmo jeito" do
      allow(Push::Delivery).to receive(:configured?).and_return(false)

      expect { create(:account_notice, account: account) }.to change(described_class, :count).by(1)
    end

    it "não perde o aviso se o tempo real estiver fora do ar" do
      allow(ActionCable.server).to receive(:broadcast).and_raise(Redis::CannotConnectError)
      allow(Rails.logger).to receive(:error)

      expect { create(:account_notice, account: account) }.to change(described_class, :count).by(1)
      expect(Rails.logger).to have_received(:error).with(/transmitir/)
    end

    it "não perde o aviso se a fila estiver fora do ar" do
      allow(Push::Delivery).to receive(:send_notification).and_raise(Redis::CannotConnectError)
      allow(Rails.logger).to receive(:error)

      expect { create(:account_notice, account: account) }.to change(described_class, :count).by(1)
      expect(Rails.logger).to have_received(:error).with(/push/)
    end

    it "não tenta avisar quem não existe mais" do
      expect {
        create(:account_notice, account_id: SecureRandom.uuid, organization_id: organization.id)
      }.not_to have_enqueued_job(Push::DeliveryJob)
    end
  end

  describe "#mark_as_read! / #mark_as_unread!" do
    let(:notice) { create(:account_notice, account: account) }

    it "marca e desmarca" do
      notice.mark_as_read!
      expect(notice.reload).to be_read
      expect(notice).not_to be_unread

      notice.mark_as_unread!
      expect(notice.reload).to be_unread
    end

    it "é idempotente: mantém a data da primeira leitura" do
      notice.update!(read_at: 2.days.ago)
      original = notice.read_at

      notice.mark_as_read!

      expect(notice.reload.read_at).to be_within(1.second).of(original)
    end
  end

  describe "#archive!" do
    it "tira da lista visível e entra nos arquivados" do
      notice = create(:account_notice, account: account)

      notice.archive!

      scope = described_class.for_account(account)
      expect(scope.visible.to_a).to be_empty
      expect(scope.archived.to_a).to eq([ notice ])
    end

    it "é idempotente: mantém a data original" do
      notice = create(:account_notice, account: account, archived_at: 2.days.ago)
      original = notice.archived_at

      notice.archive!

      expect(notice.reload.archived_at).to be_within(1.second).of(original)
    end
  end

  describe "escopos" do
    it "for_account prende à pessoa e à organização" do
      mine = create(:account_notice, account: account)
      create(:account_notice, account_id: account.id, organization_id: SecureRandom.uuid)
      create(:account_notice, account: create(:account, organization: organization, role: "member"))

      expect(described_class.for_account(account).to_a).to eq([ mine ])
    end

    it "unread e already_read são o inverso um do outro" do
      unread = create(:account_notice, account: account)
      read = create(:account_notice, account: account, read_at: Time.current)

      expect(described_class.unread.to_a).to eq([ unread ])
      expect(described_class.already_read.to_a).to eq([ read ])
    end

    it "recent ordena do mais novo ao mais antigo" do
      old = create(:account_notice, account: account, created_at: 2.days.ago)
      recent = create(:account_notice, account: account, created_at: 1.hour.ago)

      expect(described_class.recent.to_a).to eq([ recent, old ])
    end
  end

  # Regra de Mongo da migração: toda busca respeita o prefixo do índice composto.
  it "declara os índices com pessoa e organização à frente" do
    specs = described_class.index_specifications.map { |spec| spec.key.keys }

    expect(specs).to include(
      %i[account_id organization_id created_at],
      %i[account_id organization_id category created_at]
    )
  end
end
