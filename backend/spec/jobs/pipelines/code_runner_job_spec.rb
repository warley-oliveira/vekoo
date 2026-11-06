require "rails_helper"

# Roda em V8 de verdade, sem dublê do `mini_racer`.
RSpec.describe Pipelines::CodeRunnerJob do
  let(:organization) { create(:organization) }
  let(:board) { create(:pipeline_board, organization: organization, name: "Vendas") }
  let(:stage) { create(:pipeline_stage, board: board, name: "Novos") }
  let!(:next_stage) { create(:pipeline_stage, board: board, name: "Proposta") }
  let(:chat) { create(:chat, organization: organization, user_name: "Fernanda Lima") }
  let(:card) { create(:pipeline_card, stage: stage, title: "Atacado", chat_id: chat.id.to_s) }

  def trigger_with(code, **action)
    create(:pipeline_trigger, board: board, name: "Com código", actions: [ { "type" => "run_code", "code" => code }.merge(action.stringify_keys) ])
  end

  def perform(trigger, target = card, index: 0, organization_id: organization.id, context: { event_type: "card_moved" })
    described_class.perform_now(trigger.id, index, target.id, organization_id, context.to_json)
  end

  def last_execution
    Pipelines::TriggerExecution.order(:created_at).last
  end

  it "fica na fila `scripts`, que roda em processo próprio" do
    expect(described_class.queue_name).to eq("scripts")
  end

  it "não tem nova tentativa no Sidekiq" do
    expect(described_class.sidekiq_options_hash["retry"]).to be(false)
  end

  it "roda o código, com o card e o evento em `params`, e registra o resultado" do
    perform(trigger_with(<<~JS))
      return { titulo: params.card.title, etapa: params.card.kanban_column_id, quadro: params.board.name, evento: params.event.event_type, gatilho: params.trigger.name };
    JS

    expect(last_execution).to have_attributes(status: "success")
    result = JSON.parse(last_execution.executed_actions.first["result"])
    expect(result).to eq("titulo" => "Atacado", "etapa" => stage.id, "quadro" => "Vendas", "evento" => "card_moved", "gatilho" => "Com código")
  end

  it "alcança `kanban.*` e o contato da conversa do card" do
    perform(trigger_with(<<~JS))
      const card = kanban.cardsForConversation()[0];
      card.addComment('Oi, ' + getContactInfo().name);
      card.moveTo('Proposta');
      return card.id;
    JS

    expect(last_execution.status).to eq("success")
    expect(card.reload.stage_id).to eq(next_stage.id)
    expect(card.comments.take.body).to eq("Oi, Fernanda Lima")
  end

  it "o que o script muda não dispara outro gatilho: um gatilho que move ao mover não roda para sempre" do
    trigger = trigger_with("kanban.card(params.card.id).moveTo('Proposta');")
    trigger.update!(event_type: "card_moved")
    card

    expect { perform(trigger) }.not_to have_enqueued_job(Pipelines::TriggerJob)

    expect(card.reload.stage_id).to eq(next_stage.id)
  end

  it "roda em card sem conversa, com `kanban.card`" do
    plain = create(:pipeline_card, stage: stage, title: "Sem contato")

    perform(trigger_with("return kanban.card(params.card.id).title;"), plain)

    expect(last_execution.executed_actions.first["result"]).to eq('"Sem contato"')
  end

  it "guarda só o começo de um resultado enorme" do
    perform(trigger_with("return 'x'.repeat(100000);"))

    expect(last_execution.executed_actions.first["result"].length).to be <= described_class::MAX_RESULT_LENGTH
  end

  describe "falhas" do
    it "registra o erro do script, sem levantar, e deixa a nota na conversa" do
      expect { perform(trigger_with("throw new Error('faltou o CPF');")) }.not_to raise_error

      expect(last_execution).to have_attributes(status: "failure")
      expect(last_execution.error_message).to include("faltou o CPF")

      note = ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "base").take
      expect(note).to have_attributes(role_base_type: "error")
      expect(note.content).to include("Falha no código do gatilho", "faltou o CPF")
    end

    it "em card sem conversa, a falha fica só na execução" do
      plain = create(:pipeline_card, stage: stage)

      perform(trigger_with("throw new Error('falhou');"), plain)

      expect(last_execution.status).to eq("failure")
    end

    it "corta o tempo, e diz o limite" do
      perform(trigger_with("while (true) {}", timeout_ms: 1_000))

      expect(last_execution).to have_attributes(status: "failure", error_message: "O código excedeu o tempo limite de 1000 ms.")
    end

    it "corta a memória" do
      perform(trigger_with("const list = []; while (true) { list.push(new Array(10000).fill('x')); }"))

      expect(last_execution).to have_attributes(status: "failure", error_message: "O código excedeu o limite de memória.")
    end

    it "registra erro de sintaxe" do
      perform(trigger_with("return {"))

      expect(last_execution.status).to eq("failure")
    end

    it "corta mensagem enorme" do
      perform(trigger_with("throw new Error('x'.repeat(5000));"))

      expect(last_execution.error_message.length).to be <= described_class::MAX_ERROR_LENGTH
    end

    it "levanta um alerta, que a próxima execução boa resolve" do
      trigger = trigger_with("if (params.event.event_type === 'ruim') throw new Error('falhou'); return 1;")

      perform(trigger, context: { event_type: "ruim" })
      alerts = organization.organization_alerts.active.for_origin("PipelineTrigger", trigger.id)
      expect(alerts.count).to eq(1)

      perform(trigger, context: { event_type: "bom" })
      expect(alerts.reload).to be_empty
    end

    it "um erro fora do script também não volta para a fila" do
      allow(MiniRacerService).to receive(:new).and_raise(StandardError, "detalhe interno")

      expect { perform(trigger_with("return 1;")) }.not_to raise_error

      expect(last_execution).to have_attributes(status: "failure", error_message: "O código não pôde ser executado.")
    end
  end

  describe "escopo" do
    it "não roda com organização errada no argumento" do
      trigger = trigger_with("return 1;")

      expect { perform(trigger, organization_id: create(:organization).id) }.not_to change(Pipelines::TriggerExecution, :count)
    end

    it "não roda com id de card de outra organização" do
      trigger = trigger_with("return 1;")
      foreign = create(:pipeline_card)

      expect { perform(trigger, foreign) }.not_to change(Pipelines::TriggerExecution, :count)
    end

    it "não roda se o gatilho foi desligado ou mudou entre enfileirar e executar" do
      trigger = trigger_with("return 1;")
      trigger.update!(active: false)
      expect { perform(trigger) }.not_to change(Pipelines::TriggerExecution, :count)

      trigger.update!(active: true, actions: [ { "type" => "notify" } ])
      expect { perform(trigger) }.not_to change(Pipelines::TriggerExecution, :count)
    end

    it "o script não alcança card de outra organização" do
      foreign = create(:pipeline_card)

      perform(trigger_with("return kanban.getCard('#{foreign.id}').ok;"))

      expect(last_execution.executed_actions.first["result"]).to eq("false")
    end
  end
end
