require "rails_helper"

RSpec.describe Notifications::Feed do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, role: "member") }
  let(:feed) { described_class.new(account) }

  describe "#page" do
    # Intercala as fontes de propósito: é onde um limite errado em cada uma pularia gente.
    let!(:records) do
      (1..7).map do |n|
        at = n.hours.ago
        n.odd? ? create(:account_notice, account: account, created_at: at) : create(:notification, organization: organization, notified_at: at)
      end
    end

    it "traz cada página na ordem certa, sem repetir nem pular" do
      seen = (1..3).flat_map { |page| feed.page(page: page, per_page: 3).first }

      expect(seen).to eq(records)
    end

    it "calcula o meta sobre as duas fontes" do
      _records, meta = feed.page(page: 2, per_page: 3)

      expect(meta).to eq(page: 2, perPage: 3, total: 7, totalPages: 3, hasMore: true)
    end

    it "página além do fim vem vazia" do
      page, meta = feed.page(page: 9, per_page: 3)

      expect(page).to be_empty
      expect(meta[:hasMore]).to be(false)
    end

    it "usa os padrões da origem" do
      _records, meta = feed.page

      expect(meta).to include(page: 1, perPage: 20)
    end

    it "corrige página e tamanho fora do intervalo" do
      expect(feed.page(page: -1, per_page: 500).last).to include(page: 1, perPage: 50)
      expect(feed.page(page: "abc", per_page: 0).last).to include(page: 1, perPage: 1)
    end

    # Hora redonda: o Postgres guarda microssegundos e o Mongo, milissegundos.
    it "desempata pelo id quando a data é a mesma, para a paginação ser estável" do
      at = 30.seconds.ago.change(usec: 0)
      a = create(:notification, organization: organization, notified_at: at)
      b = create(:account_notice, account: account, created_at: at)
      first_two = feed.page(per_page: 2).first

      expect(first_two).to eq([ a, b ].sort_by { |record| record.id.to_s })
    end
  end

  describe "#find" do
    it "acha nas duas fontes pelo formato do id" do
      notice = create(:account_notice, account: account)
      product = create(:notification, organization: organization)

      expect(feed.find(notice.id.to_s)).to eq(notice)
      expect(feed.find(product.id)).to eq(product)
    end

    it "não alcança aviso de outra pessoa" do
      foreign = create(:account_notice, account: create(:account, organization: organization, role: "member"))

      expect { feed.find(foreign.id.to_s) }.to raise_error(Mongoid::Errors::DocumentNotFound)
    end

    it "não alcança aviso do produto de outra organização" do
      foreign = create(:notification, organization: create(:organization))

      expect { feed.find(foreign.id) }.to raise_error(ActiveRecord::RecordNotFound)
    end
  end

  describe "#read_all!" do
    it "marca as duas fontes, e deixa os arquivados como estão" do
      product = create(:notification, organization: organization)
      notice = create(:account_notice, account: account)
      archived = create(:account_notice, account: account, archived_at: 1.minute.ago)

      feed.read_all!

      expect(product.reload.read).to be(true)
      expect(notice.reload).to be_read
      expect(archived.reload).not_to be_read
      expect(feed.unread_count).to eq(0)
    end
  end
end
