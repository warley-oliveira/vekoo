require "rails_helper"

# Escritas de verdade, em conexões separadas: a transação das specs comuns esconderia a corrida.
RSpec.describe "Pipelines: posições sob concorrência" do
  self.use_transactional_tests = false

  let(:organization) { create(:organization) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board) }
  let(:target) { create(:pipeline_stage, board: board) }

  after { organization.destroy! }

  def in_threads(items)
    items.map do |item|
      Thread.new { ActiveRecord::Base.connection_pool.with_connection { yield item } }
    end.each(&:join)
  end

  def positions(of_stage)
    Pipelines::Card.where(stage_id: of_stage.id).order(:position).pluck(:position)
  end

  it "cards criados ao mesmo tempo não ficam na mesma posição" do
    stage

    in_threads(1..4) { |n| Pipelines::Card.create!(stage_id: stage.id, title: "Card #{n}") }

    expect(positions(stage)).to eq([ 1, 2, 3, 4 ])
  end

  it "dois arrastes para a mesma etapa não embaralham as posições" do
    moving = Array.new(4) { |n| Pipelines::Card.create!(stage_id: stage.id, title: "Card #{n}") }
    Pipelines::Card.create!(stage_id: target.id, title: "Já estava")

    in_threads(moving.map(&:id)) do |id|
      Pipelines::MoveCard.call(card: Pipelines::Card.find(id), stage: Pipelines::Stage.find(target.id), position: 1)
    end

    expect(positions(target)).to eq([ 1, 2, 3, 4, 5 ])
    expect(positions(stage)).to eq([])
  end

  it "dois gatilhos em rodízio não pegam a mesma vez" do
    trigger = create(:pipeline_trigger, board: board)

    indexes = Concurrent::Array.new
    in_threads(1..4) { indexes << Pipelines::Trigger.find(trigger.id).next_round_robin_index }

    expect(indexes.sort).to eq([ 0, 1, 2, 3 ])
  end

  it "reordenar enquanto outro move não deixa posição repetida" do
    cards = Array.new(4) { |n| Pipelines::Card.create!(stage_id: stage.id, title: "Card #{n}") }

    in_threads([ :reorder, :move ]) do |action|
      if action == :reorder
        Pipelines::Reorder.call(scope: Pipelines::Stage.find(stage.id).cards, ordered_ids: cards.map(&:id).reverse, lock_key: stage.id)
      else
        Pipelines::MoveCard.call(card: Pipelines::Card.find(cards.first.id), stage: Pipelines::Stage.find(stage.id), position: 2)
      end
    end

    expect(positions(stage).uniq.size).to eq(4)
  end
end
