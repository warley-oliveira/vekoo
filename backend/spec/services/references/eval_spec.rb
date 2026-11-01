require "rails_helper"

# O teste lado a lado da Fase 3: as marcas de teste, a rodada e o resultado. A
# geração é um dublê que cria peças no turno — o que se confere é a montagem
# dos pares (braços, lados sorteados, controles) e a regra de decisão.
RSpec.describe "Teste lado a lado (References::Eval)" do
  let(:account) { create(:account, :staff) }

  def eval_brands(only = %w[padaria pet])
    References::Eval::Brands.new(account: account).call(only: only, photos: false)
  end

  describe References::Eval::Brands do
    it "cria cada marca publicada, com nicho e estilo, e não duplica na segunda vez" do
      brands = eval_brands

      expect(brands.keys).to eq(%w[padaria pet])
      expect(brands["padaria"]).to have_attributes(status: "published", name: "Padaria Fermento Lento")
      expect(brands["padaria"].generation_niche).to eq("food_beverage")
      expect(brands["pet"].generation_archetypes).to eq("primary" => "popular_warm", "secondary" => "caring_welcoming")
      expect { eval_brands }.not_to change(BrandCore, :count)
      expect(References::Eval::Brands.all.keys).to contain_exactly("padaria", "pet")
    end

    it "guarda as fotos geradas como foto enviada pela marca — é assim que a busca conta foto do produto" do
      png = Rails.root.join("spec/fixtures/files/foto.png")
      image = Ai::GeminiImage::Image.new(data: File.binread(png), mime_type: "image/png")
      generator = instance_double(Ai::GeminiImage)
      allow(generator).to receive(:generate).and_return(Ai::GeminiImage::Result.new(image: image, usage: {}, model: "x"))

      brand = References::Eval::Brands.new(account: account, generator: generator).call(only: %w[padaria])["padaria"]

      expect(brand.assets.where(kind: "photo", generated: false).count).to eq(5)
      expect(generator).to have_received(:generate).with(hash_including(aspect_ratio: "4:5", prompt: a_string_ending_with("sem marca d'água."))).exactly(5).times
    end
  end

  describe References::Eval::Run do
    let(:requests) do
      [
        { "key" => "p1", "brand" => "padaria", "text" => "bastidores da fornada", "objective" => "behind_the_scenes" },
        { "key" => "p2", "brand" => "padaria", "text" => "combo café com pão por R$ 12", "objective" => "direct_sale" },
        { "key" => "t1", "brand" => "pet", "text" => "banho e tosa com desconto", "objective" => "direct_sale" },
        { "key" => "x1", "brand" => "marca-que-nao-existe", "text" => "qualquer coisa", "objective" => nil }
      ]
    end
    let(:modes) { [] }

    # Cada geração entrega 3 peças, menos quando o pedido é "pergunta".
    let(:generate) do
      lambda do |turn, mode|
        modes << [ turn.prompt, mode ]
        3.times { |index| create(:piece, organization: turn.organization, brand_core: turn.conversation.brand_core, agent_turn: turn, title: "opção #{index}") }
        turn.update!(status: "answered", cost_micro_usd: mode == "on" ? 70_000 : 60_000)
      end
    end

    def run(**options)
      eval_brands
      References::Eval::Run.new(round: "1", requests: requests, account: account, controls: 1, seed: 7, generate: generate, **options).call
    end

    it "gera cada pedido com e sem referência, e um pedido a mais sem × sem, escondido no meio" do
      result = run

      main = result.pairs.reject(&:control)
      control = result.pairs.select(&:control)
      expect(main.map(&:request_key)).to contain_exactly("p1", "p2", "t1")
      expect(main.map { |pair| [ pair.left_arm, pair.right_arm ].sort }).to all(eq(%w[plain references]))
      expect(control.size).to eq(1)
      expect([ control.first.left_arm, control.first.right_arm ]).to eq(%w[plain plain])
      expect(ReferenceEvalPair.in_round("1").pluck(:position)).to eq([ 1, 2, 3, 4 ])
      expect(main.map(&:left_piece_ids)).to all(have_attributes(size: 3))
      expect(modes.map(&:last).tally).to eq("on" => 3, "off" => 4)
      expect(result.cost_micro_usd).to eq(3 * 70_000 + 4 * 60_000)
      expect(result.skipped).to contain_exactly(a_string_including("x1"))
    end

    it "sorteia o lado: o braço com referência não fica sempre no mesmo canto" do
      requests.replace((1..12).map { |index| { "key" => "p#{index}", "brand" => "padaria", "text" => "pedido #{index}" } })

      sides = run(controls: 0).pairs.map(&:left_arm)

      expect(sides.uniq).to contain_exactly("references", "plain")
    end

    it "pedido em que um lado não entregou peça fica sem par" do
      generate_with_question = lambda do |turn, mode|
        next turn.update!(status: "question") if mode == "on" && turn.prompt.include?("combo")

        generate.call(turn, mode)
      end

      result = run(generate: generate_with_question, controls: 0)

      expect(result.pairs.map(&:request_key)).to contain_exactly("p1", "t1")
      expect(result.skipped).to include(a_string_including("p2", "question"))
    end

    it "não sobrescreve uma rodada que já existe" do
      run
      expect { run }.to raise_error(ArgumentError, /já existe/)
    end
  end

  describe References::Eval::Results do
    let(:brand) { eval_brands(%w[padaria])["padaria"] }

    def pair(position, winner:, control: false, usable: [ 2, 1 ], copied: [], refs_left: true)
      arms = control ? %w[plain plain] : (refs_left ? %w[references plain] : %w[plain references])
      verdict = case winner
      when "tie" then "tie"
      when "references" then arms.index("references").zero? ? "left" : "right"
      else arms.index("plain").zero? ? "left" : "right"
      end
      create_pair(position, arms, verdict, usable, copied, control)
    end

    def create_pair(position, arms, verdict, usable, copied, control)
      ReferenceEvalPair.create!(
        round: "1", position: position, brand_core: brand, request_key: "p#{position}", request_text: "pedido #{position}",
        control: control, left_arm: arms.first, right_arm: arms.last, verdict: verdict,
        usable_left: usable.first, usable_right: usable.last, copied_sides: copied
      )
    end

    it "só sai com a rodada inteira avaliada" do
      pair(1, winner: "references")
      ReferenceEvalPair.create!(round: "1", position: 2, brand_core: brand, request_key: "p2", request_text: "x", left_arm: "plain", right_arm: "references")

      expect { described_class.call("1") }.to raise_error(described_class::Incomplete)
    end

    it "liga com 60% ou mais dos pares sem empate, sem perder no 'postaria' e sem cópia — controles fora da conta" do
      pair(1, winner: "references")
      pair(2, winner: "references", refs_left: false, usable: [ 1, 2 ])
      pair(3, winner: "plain", usable: [ 2, 2 ])
      pair(4, winner: "tie")
      pair(5, winner: "plain", control: true)

      results = described_class.call("1")

      expect(results[:main]).to include(referencesWins: 2, plainWins: 1, ties: 1, winRate: 0.667)
      expect(results[:main][:usable]).to eq(references: 2.0, plain: 1.25)
      expect(results[:controls]).to eq(pairs: 1, ties: 0, preferred: 1)
      expect(results[:decision]).to eq("turnOn")
    end

    it "peça com referência que parece cópia barra ligar, mesmo vencendo" do
      pair(1, winner: "references", copied: %w[left])
      pair(2, winner: "references")

      results = described_class.call("1")

      expect(results[:copied]).to eq(references: 1, plain: 0)
      expect(results[:decision]).to eq("adjust")
    end

    it "abaixo de 50% não liga" do
      pair(1, winner: "plain")
      pair(2, winner: "plain")
      pair(3, winner: "references")

      expect(described_class.call("1")[:decision]).to eq("keepOff")
    end
  end
end
