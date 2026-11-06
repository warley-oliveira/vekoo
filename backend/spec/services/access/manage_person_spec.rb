require "rails_helper"

# As regras em si estão cobertas em spec/requests/users_spec.rb, pela API. Aqui fica o que
# só se vê de perto: a checagem olha o banco, não o objeto em memória, e o lock aguenta dois
# pedidos ao mesmo tempo.
RSpec.describe Access::ManagePerson do
  describe "checagem do último dono" do
    let(:organization) { create(:organization) }
    let!(:first_owner) { create(:account, organization: organization, role: "owner") }
    let!(:second_owner) { create(:account, organization: organization, role: "owner") }

    it "olha o banco, e não uma cópia desatualizada em memória" do
      stale_copy = Account.find(first_owner.id)

      described_class.new(actor: first_owner).update(second_owner, { role: "member" })

      expect {
        described_class.new(actor: Account.find(first_owner.id)).update(stale_copy, { role: "member" })
      }.to raise_error(described_class::Refused) { |refusal| expect(refusal.code).to eq("lastOwner") }

      expect(first_owner.reload).to be_owner
    end
  end

  # Threads de verdade, cada uma com a sua conexão: precisa enxergar o que a outra gravou, e
  # por isso este grupo não roda dentro da transação de teste.
  describe "dois donos rebaixando um ao outro ao mesmo tempo" do
    self.use_transactional_tests = false

    let(:organization) { create(:organization) }
    let!(:first_owner) { create(:account, organization: organization, role: "owner") }
    let!(:second_owner) { create(:account, organization: organization, role: "owner") }

    after { Organization.where(id: organization.id).destroy_all }

    def demote_at_the_same_time(pairs)
      barrier = Concurrent::CyclicBarrier.new(pairs.size)

      pairs.map { |actor_id, target_id|
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            actor = Account.find(actor_id)
            target = Account.find(target_id)
            barrier.wait
            described_class.new(actor: actor).update(target, { role: "member" })
            :demoted
          rescue described_class::Refused => refusal
            refusal.code
          end
        end
      }.map(&:value)
    end

    it "um passa, o outro é recusado, e a organização continua com dono" do
      results = demote_at_the_same_time([ [ first_owner.id, second_owner.id ], [ second_owner.id, first_owner.id ] ])

      expect(results).to contain_exactly(:demoted, "lastOwner")
      expect(organization.accounts.active.where(role: "owner").count).to eq(1)
    end
  end
end
