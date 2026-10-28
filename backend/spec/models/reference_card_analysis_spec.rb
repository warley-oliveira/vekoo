require "rails_helper"

RSpec.describe ReferenceCard::Analysis do
  let(:complete) { build(:reference_card, :analyzed).analysis }

  describe ".normalize" do
    it "devolve a forma inteira a partir de qualquer coisa" do
      expect(described_class.normalize(nil)).to eq(described_class.blank)
      expect(described_class.normalize("texto")).to eq(described_class.blank)
    end

    it "tira chave que a forma não conhece, em qualquer nível" do
      normalized = described_class.normalize(complete.merge("legenda" => "copiada", "hook" => complete["hook"].merge("frase" => "x")))

      expect(normalized.keys).not_to include("legenda")
      expect(normalized["hook"].keys).to eq(%w[type description])
    end

    it "apara e junta espaços, e ignora texto que não é texto" do
      normalized = described_class.normalize("whyItWorks" => { "mechanism" => "  um   dois \n três " }, "copy" => { "tone" => { "x" => 1 } })

      expect(normalized.dig("whyItWorks", "mechanism")).to eq("um dois três")
      expect(normalized.dig("copy", "tone")).to eq("")
    end

    it "corta a sequência no máximo de movimentos e descarta os vazios" do
      beats = [ "", "  " ] + (1..15).map { |n| "movimento #{n}" }
      normalized = described_class.normalize("structure" => { "beats" => beats })

      expect(normalized.dig("structure", "beats")).to eq((1..10).map { |n| "movimento #{n}" })
    end

    it "lê a replicabilidade como inteiro" do
      expect(described_class.normalize("replicability" => { "score" => "2" }).dig("replicability", "score")).to eq(2)
      expect(described_class.normalize("replicability" => { "score" => 3.0 }).dig("replicability", "score")).to eq(3)
    end

    describe "por que funciona" do
      it "vira quatro campos; o texto único de antes é o mecanismo" do
        expect(described_class.normalize("whyItWorks" => "Gera confiança.")["whyItWorks"]).to eq(
          "mechanism" => "Gera confiança.", "transferablePrinciple" => "", "targetMetrics" => [], "whenNotToUse" => ""
        )
      end

      it "guarda até duas métricas-alvo, sem repetir, e deixa a desconhecida para a validação apontar" do
        why = described_class.normalize("whyItWorks" => { "targetMetrics" => [ "saves", " saves ", "views", "reach" ] })

        expect(why.dig("whyItWorks", "targetMetrics")).to eq(%w[saves views])
        expect(described_class.errors_for(why)).to include([ "whyItWorks.targetMetrics.1", :inclusion, {} ])
      end

      it "exige ao menos uma métrica-alvo para publicar" do
        analysis = described_class.normalize(complete.deep_merge("whyItWorks" => { "targetMetrics" => [] }))

        expect(described_class.errors_for(analysis)).to be_empty
        expect(described_class.errors_for(analysis, strict: true).map(&:first)).to eq([ "whyItWorks.targetMetrics" ])
      end
    end

    describe "engajamento relativo" do
      def metrics(raw) = described_class.normalize("metrics" => raw)["metrics"]

      it "é (curtidas + comentários) / mediana dos últimos 30 posts" do
        expect(metrics("likes" => 450, "comments" => 30, "baselineMedian" => 160)["relativeEngagement"]).to eq(3.0)
        expect(metrics("likes" => "100", "comments" => "0", "baselineMedian" => "300")["relativeEngagement"]).to eq(0.33)
      end

      it "fica nulo sem qualquer um dos três números" do
        expect(metrics("likes" => 450, "comments" => 30)["relativeEngagement"]).to be_nil
        expect(metrics("likes" => 450, "baselineMedian" => 160)["relativeEngagement"]).to be_nil
        expect(metrics("likes" => 450, "comments" => 30, "baselineMedian" => 0)["relativeEngagement"]).to be_nil
      end

      it "descarta contagem negativa e data inválida" do
        normalized = metrics("likes" => -3, "comments" => 2, "collectedAt" => "31/10/2026")

        expect(normalized).to include("likes" => nil, "comments" => 2, "collectedAt" => nil)
      end
    end
  end

  describe ".errors_for" do
    it "aceita a análise vazia como rascunho" do
      expect(described_class.errors_for(described_class.blank)).to be_empty
    end

    it "exige tudo preenchido no modo estrito — menos as métricas" do
      paths = described_class.errors_for(described_class.blank, strict: true).map(&:first)

      expect(paths).to include("hook.type", "hook.description", "structure.summary", "structure.beats",
        "visual.imagery", "copy.function", "copy.cta", "whyItWorks.mechanism", "whyItWorks.transferablePrinciple",
        "whyItWorks.targetMetrics", "whyItWorks.whenNotToUse", "replicability.score", "replicability.requirements")
      expect(paths.grep(/\Ametrics/)).to be_empty
    end

    it "aceita a análise completa nos dois modos" do
      normalized = described_class.normalize(complete)

      expect(described_class.errors_for(normalized)).to be_empty
      expect(described_class.errors_for(normalized, strict: true)).to be_empty
    end

    it "dá um erro por campo, com o código que a API conhece" do
      errors = described_class.errors_for(described_class.normalize(complete.deep_merge(
        "hook" => { "type" => "grito" }, "replicability" => { "score" => 0 }
      )))

      expect(errors).to contain_exactly([ "hook.type", :inclusion, {} ], [ "replicability.score", :inclusion, {} ])
    end

    it "manda o limite junto do texto longo demais (quando não veio pela normalização)" do
      raw = described_class.normalize(complete).deep_merge("copy" => { "cta" => "a" * 500 })

      expect(described_class.errors_for(raw)).to include([ "copy.cta", :too_long, { count: ReferenceCard::Analysis::SHORT } ])
    end

    it "lista cada chave que falta" do
      errors = described_class.errors_for({ "hook" => {} })

      expect(errors.map(&:first)).to include("hook.type", "hook.description", "structure", "metrics")
    end
  end

  describe ".schema" do
    it "usa os enums da taxonomia" do
      properties = described_class.schema(strict: true)["properties"]

      expect(properties.dig("hook", "properties", "type", "enum")).to eq(Taxonomy::HOOK_TYPES)
      expect(properties.dig("replicability", "properties", "score", "enum")).to eq(Taxonomy::REPLICABILITY)
      expect(properties.dig("whyItWorks", "properties", "targetMetrics", "items", "enum")).to eq(Taxonomy::TARGET_METRICS)
    end

    it "fecha todo objeto: nada fora da forma passa, nem no modo de rascunho" do
      expect(described_class.valid?(described_class.blank.merge("extra" => 1))).to be(false)
    end
  end
end
