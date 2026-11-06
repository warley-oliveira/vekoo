require "rails_helper"

RSpec.describe "Suporte a documentos Mongoid" do
  before(:all) do
    Object.const_set(:MongoProbe, Class.new do
      include Mongoid::Document
      include StringEnum
      include EncryptedField

      store_in collection: "mongo_probes"

      string_enum :status, %i[draft running done], default: :draft
      encrypted_field :access_token
    end)
  end

  after(:all) { Object.send(:remove_const, :MongoProbe) }

  describe StringEnum do
    it "guarda como texto e expõe predicados, bang e escopo" do
      probe = MongoProbe.create!

      expect(probe.status).to eq(:draft)
      expect(probe).to be_draft

      probe.running!

      expect(probe.reload.status_cd).to eq("running")
      expect(MongoProbe.running.to_a).to eq([ probe ])
      expect(MongoProbe.statuses).to eq(%w[draft running done])
    end

    it "recusa valor fora da lista" do
      expect { MongoProbe.new.status = :other }.to raise_error(ArgumentError)
    end
  end

  describe EncryptedField do
    it "cifra em repouso e decifra na leitura" do
      probe = MongoProbe.create!(access_token: "segredo")

      expect(probe.reload.access_token).to eq("segredo")
      expect(probe.access_token_ciphertext).not_to include("segredo")
    end

    it "devolve nil para valor adulterado em vez de quebrar" do
      probe = MongoProbe.new(access_token_ciphertext: "lixo")

      expect(probe.access_token).to be_nil
    end
  end
end
