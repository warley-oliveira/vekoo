require "rails_helper"

RSpec.describe Ai::Run do
  let(:organization) { create(:organization) }
  let(:cache) { ActiveSupport::Cache::MemoryStore.new }

  # Em teste o cache costuma ser nulo: sem memória de verdade, a vaga nunca estaria ocupada.
  before { allow(Rails).to receive(:cache).and_return(cache) }

  def run = described_class.new(organization, cost: 1)

  it "recusa uma segunda geração enquanto a primeira está em voo" do
    run.call do
      expect { run.call { raise "não deveria rodar" } }.to raise_error(described_class::Busy)
    end
  end

  it "quem ouve Busy não solta a vaga de quem está gerando" do
    run.call do
      expect { run.call { nil } }.to raise_error(described_class::Busy)
      # Sem a guarda, a recusa acima apagaria a vaga, e esta terceira rodaria junto com a primeira.
      expect { run.call { raise "não deveria rodar" } }.to raise_error(described_class::Busy)
    end
  end

  it "solta a vaga ao terminar, para a próxima geração" do
    run.call { nil }

    expect { run.call { nil } }.not_to raise_error
  end

  it "solta a vaga quando a geração falha" do
    expect { run.call { raise "falhou" } }.to raise_error("falhou")

    expect { run.call { nil } }.not_to raise_error
  end
end
