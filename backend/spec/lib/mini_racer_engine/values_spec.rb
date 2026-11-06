# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::Values do
  describe ".to_js" do
    it "mantém o que já é dado puro" do
      value = { "a" => [ 1, 2.5, "x", true, false, nil ] }

      expect(described_class.to_js(value)).to eq(value)
    end

    it "transforma chave e símbolo em texto" do
      expect(described_class.to_js({ a: :b, 1 => 2 })).to eq("a" => "b", "1" => 2)
    end

    it "converte o que a gem transformaria em lixo ou em erro" do
      id = BSON::ObjectId.new
      time = Time.utc(2026, 1, 2, 3)

      expect(described_class.to_js(BigDecimal("1.5"))).to eq(1.5)
      expect(described_class.to_js(Date.new(2026, 1, 2))).to eq("2026-01-02")
      expect(described_class.to_js(id)).to eq(id.to_s)
      expect(described_class.to_js(Set[1, 2])).to eq([ 1, 2 ])
      expect(described_class.to_js(time)).to eq(time)
      expect(described_class.to_js(time.in_time_zone("America/Sao_Paulo"))).to be_a(Time)
      expect(described_class.to_js(DateTime.new(2026, 1, 2))).to be_a(Time)
    end

    it "documento e modelo viram só os dados" do
      organization = create(:organization)
      tag = create(:chat_tag, organization_id: organization.id, name: "vip")

      expect(described_class.to_js(tag)).to include("name" => "vip", "_id" => tag.id.to_s)
      expect(described_class.to_js(organization)).to include("id" => organization.id, "name" => organization.name)
    end

    it "objeto sem representação vira algo inofensivo" do
      expect(described_class.to_js(Object.new)).to eq({})
      expect(described_class.to_js(Object)).to be_a(String)
      expect(described_class.to_js(1i)).to be_a(String)
    end

    it "deixa passar o binário explícito" do
      binary = MiniRacer::Binary.new("\xFF".b)

      expect(described_class.to_js(binary)).to equal(binary)
    end

    it "todo texto sai em UTF-8 válido" do
      expect(described_class.to_js("não".b)).to eq("não")
      expect(described_class.to_js("\xFF\xFEabc".b)).to be_valid_encoding
      expect(described_class.to_js("\xFF".dup.force_encoding("UTF-8"))).to be_valid_encoding
      expect(described_class.to_js("caf\xE9".dup.force_encoding("ISO-8859-1"))).to eq("café")
      expect { described_class.to_js("\xFF\xFE".b).to_json }.not_to raise_error
    end
  end

  describe ".from_js" do
    it "mantém a estrutura" do
      value = { "a" => [ 1, { "b" => "c" } ], "d" => nil }

      expect(described_class.from_js(value)).to eq(value)
    end

    it "descarta o que não é dado" do
      error = MiniRacer::ScriptError.new("deu ruim")

      expect(described_class.from_js([ MiniRacer::JavaScriptFunction.new, error ])).to eq([ nil, "deu ruim" ])
    end

    it "recusa ciclo em vez de estourar a pilha" do
      cycle = {}
      cycle["a"] = cycle

      expect { described_class.from_js(cycle) }.to raise_error(MiniRacerEngine::Error, /nested too deeply/)
    end

    it "recusa grafo com caminhos demais em vez de nunca terminar" do
      graph = {}
      40.times { graph = { "a" => graph, "b" => graph } }

      elapsed = elapsed_seconds do
        expect { described_class.from_js(graph) }.to raise_error(MiniRacerEngine::Error, /too large/)
      end

      expect(elapsed).to be < 1
    end

    it "recusa texto gigante" do
      stub_const("#{described_class}::MAX_STRING_BYTES", 10)

      expect(described_class.from_js("x" * 10)).to eq("x" * 10)
      expect { described_class.from_js([ "x" * 11 ]) }.to raise_error(MiniRacerEngine::Error, /too large/)
    end

    it "recusa aninhamento além do teto" do
      deep = []
      (described_class::MAX_DEPTH + 2).times { deep = [ deep ] }

      expect { described_class.from_js(deep) }.to raise_error(MiniRacerEngine::Error, /nested too deeply/)
    end

    it "a mensagem chega ao JS: só ASCII" do
      expect { described_class.from_js(Array.new(described_class::MAX_NODES + 1, 1)) }
        .to raise_error(MiniRacerEngine::Error) { |error| expect(error.message).to be_ascii_only }
    end
  end
end
