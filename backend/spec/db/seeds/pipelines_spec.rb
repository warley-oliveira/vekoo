require "rails_helper"

# Roda a semente de ponta a ponta, em cima da conta de demonstração, com os domínios de que depende.
RSpec.describe "db/seeds/pipelines.rb" do
  let(:owner) { create(:account, email: "marina.duarte@exemplo.com.br", role: "owner", name: "Marina Duarte") }
  let(:organization) { owner.organization }
  let(:commercial) { organization.pipeline_boards.find_by!(name: "Vendas no atacado") }
  let(:after_sales) { organization.pipeline_boards.find_by!(name: "Pós-venda") }

  def seed(file = "pipelines")
    original = $stdout
    $stdout = StringIO.new
    load Rails.root.join("db/seeds/#{file}.rb")
  ensure
    $stdout = original
  end

  before do
    owner
    seed
  end

  it "traz os dois quadros, o comercial de negócios e o de pós-venda" do
    expect(organization.pipeline_boards.pluck(:name)).to contain_exactly("Vendas no atacado", "Pós-venda")
    expect(commercial.board_type).to eq("crm")
    expect(after_sales.board_type).to eq("standard")
    expect(commercial.stages.map(&:name)).to eq([ "Novos contatos", "Qualificação", "Proposta enviada", "Negociação", "Fechamento" ])
    expect(after_sales.stages.count).to eq(5)
  end

  # A tabela é global, e `spec/db/seeds_spec.rb` roda fora de transação: o que a semente gravasse aqui
  # ficaria no banco de teste, e derrubaria quem conta com ela vazia.
  it "não grava os modelos de quadro, que nascem no primeiro uso" do
    Pipelines::BoardTemplate.delete_all

    expect { seed }.not_to change(Pipelines::BoardTemplate, :count)
  end

  it "os cards apontam para as conversas da semente, dentro da organização" do
    linked = commercial.cards.where.not(chat_id: nil) + after_sales.cards.where.not(chat_id: nil)

    expect(linked.size).to be >= 8
    expect(linked.map(&:chat)).to all(be_present)
    expect(commercial.cards.find_by(title: "Fernanda Lima").chat.user_name).to eq("Fernanda Lima")
  end

  it "os responsáveis são as pessoas da semente, e os cards passam nas validações" do
    cards = Pipelines::Card.where(organization_id: organization.id)

    expect(cards.map(&:assigned_to).compact.map(&:organization_id).uniq).to eq([ organization.id ])
    expect(cards.reject(&:valid?)).to be_empty
    expect(cards.map(&:assigned_to).compact.map(&:email)).to include("juliana.ferreira@exemplo.com.br", "thiago.almeida@exemplo.com.br")
  end

  it "traz comentários com resposta, fixados e reações, e checklists marcados pela metade" do
    comments = Pipelines::Comment.where(card_id: commercial.cards.unscope(:order).select(:id))

    expect(comments.where(pinned: true)).to exist
    expect(comments.where.not(parent_id: nil)).to exist
    expect(Pipelines::CommentReaction.where(pipeline_comment_id: comments.select(:id))).to exist

    checklists = commercial.cards.find_by(title: "Carlos Eduardo Santos").checklist_progress
    expect(checklists[:total]).to eq(3)
    expect(checklists[:completed]).to eq(1)
  end

  it "traz etiquetas, campos, checklist de etapa e filtros" do
    expect(organization.pipeline_labels.pluck(:name)).to include("Atacado", "Quente", "Urgente")
    expect(commercial.custom_fields.pluck(:key)).to include("origem_do_contato", "lead_score", "forma_de_pagamento", "validade_da_proposta")
    expect(commercial.lead_score_field_key).to eq("lead_score")
    expect(commercial.stages.second.checklist_items.count).to eq(3)
    expect(commercial.saved_filters.pluck(:name)).to contain_exactly("Vendas acima de R$ 5 mil", "Atacado quente")
    expect(commercial.saved_filters.map(&:valid?)).to all(be(true))
  end

  it "traz as metas do mês e dos meses anteriores, com o realizado para o gráfico" do
    month = Date.current

    expect(commercial.goals.funnel.count).to eq(6)
    expect(commercial.goals.user_goals.for_month(month).count).to eq(2)

    Time.use_zone(Pipelines.time_zone_for(organization)) do
      history = Pipelines::GoalHistory.call(commercial, month, 6)
      expect(history.map { |item| item[:actualValue] }.select(&:positive?).size).to be >= 3
      expect(Pipelines::GoalProgress.call(commercial, month)[:funnel]).to include(targetValue: 45_000.0)
    end
  end

  it "traz negócios ganhos, perdidos e arquivados, com card esfriando e card atrasado" do
    cards = commercial.cards

    expect(cards.won.count).to be >= 3
    expect(cards.lost.count).to eq(2)
    expect(cards.archived.count).to be >= 3
    expect(cards.active.select(&:rotting?)).not_to be_empty
    expect(cards.active.overdue).to exist
  end

  it "as métricas têm o que somar, inclusive o tempo por etapa" do
    metrics = Pipelines::BoardMetrics.call(commercial)

    expect(metrics[:totalCards]).to be >= 10
    expect(metrics[:forecast]).not_to be_empty
    expect(metrics[:avgTimePerStage].map { |item| item[:avgHours] }).to all(be > 0)
  end

  it "traz gatilhos de cada tipo, com código, e histórico de execução, sem ter disparado nada" do
    types = (commercial.triggers + after_sales.triggers).flat_map { |trigger| trigger.actions.map { |action| action["type"] } }

    expect(types).to include("notify", "assign_user", "create_card", "run_code", "send_whatsapp_message", "fire_webhook")
    expect(commercial.triggers.map(&:valid?)).to all(be(true))
    expect(Pipelines::TriggerExecution.for_board(commercial.id).pluck(:status).uniq).to contain_exactly("success", "failure")
    expect(ActiveJob::Base.queue_adapter.enqueued_jobs.map { |job| job["job_class"] }).not_to include("Pipelines::TriggerJob")
  end

  it "a passagem pelas etapas fica na atividade" do
    card = commercial.cards.find_by(title: "Fernanda Lima")

    expect(card.activities.where(action: "moved").count).to eq(3)
    expect(card.activities.where(action: "label_added").count).to eq(2)
    expect(card.activities.last.action).to eq("created")
  end

  it "é idempotente, e não desfaz o que a pessoa fez" do
    commercial.update!(description: "Mudei eu")
    commercial.cards.find_by(title: "Fernanda Lima").destroy!
    counts = -> { [ Pipelines::Board.count, Pipelines::Stage.count, Pipelines::Card.count, Pipelines::Label.count, Pipelines::Goal.count ] }

    expect { seed }.not_to(change(&counts))

    expect(commercial.reload.description).to eq("Mudei eu")
  end

  it "sem a conta de demonstração, não faz nada" do
    Pipelines::Board.destroy_all
    owner.update!(email: "outra@exemplo.com.br")

    expect { seed }.not_to change(Pipelines::Board, :count)
  end

  it "não usa o vocabulário proibido" do
    text = File.read(Rails.root.join("db/seeds/pipelines.rb"))

    expect(text).not_to match(/lorem ipsum/i)
  end
end
