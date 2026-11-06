require "rails_helper"

# Os blocos de Pipelines, de verdade: quadro, etapa e card no banco, e `Pipelines::Automation` no meio.
RSpec.describe "Blocos de Pipelines" do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, user_name: "Fernanda Lima") }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:first_stage) { create(:pipeline_stage, board: board, name: "Novo") }
  let(:second_stage) { create(:pipeline_stage, board: board, name: "Proposta") }
  let(:card) { create(:pipeline_card, stage: first_stage, chat_id: chat.id.to_s, title: "Pedido da Fernanda") }
  let(:from_chat) { { type: "chat", board_id: board.id } }

  before do
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    stub_flow_channel(connector)
  end

  # O bloco ligado a uma saída de cada: `saiu_por` diz por onde ele seguiu.
  def run_block(type, data = {}, handles: [], variables: {}, target: chat)
    nodes = [ node("t", "trigger_manual"), node("b", type, data) ]
    edges = [ edge("t", "b") ]
    handles.each do |handle|
      nodes << node("saida_#{handle || 'padrao'}", "set_variable", assignments: [ { name: "saiu_por", value: (handle || "padrao").to_s } ])
      edges << edge("b", "saida_#{handle || 'padrao'}", handle)
    end

    run_flow(published_flow(organization, nodes, edges), chat: target, variables: variables).reload
  end

  def output_of(execution)
    log_of(execution, "b").output
  end

  shared_examples "um bloco que falha com mensagem" do |message|
    it "para a execução com o motivo" do
      expect(failing_run).to have_attributes(status: "failed", error_message: a_string_including(message))
    end
  end

  describe "o catálogo" do
    it "tem todos os blocos com o mesmo prefixo, e nenhum nome da origem" do
      types = FlowRuntime::NodeRegistry::CATALOG["pipeline"].keys

      expect(types).to all(start_with("pipeline_"))
      expect(FlowRuntime::NodeRegistry::CATALOG.values.flat_map(&:keys).grep(/kanban|column|\Acreate_deal\z|\Aupdate_deal\z/)).to eq([])
    end
  end

  describe "pipeline_create_card" do
    let(:data) { { board_id: board.id, stage_id: first_stage.id, title: "Orçamento de {{contact.name}}", description: "Pediu {{vars.produto}}", priority: "high", deal_value: "1500" } }

    it "cria na etapa, ligado à conversa, com os campos e o id em variável" do
      execution = run_block("pipeline_create_card", data, variables: { "produto" => "caneca" })

      created = Pipelines::Card.find(execution.variables["pipeline_card_id"])
      expect(created).to have_attributes(
        stage_id: first_stage.id, organization_id: organization.id, chat_id: chat.id.to_s,
        title: "Orçamento de Fernanda Lima", description: "Pediu caneca", priority: "high", deal_value: 1500
      )
    end

    it "sem título, usa o nome do contato" do
      execution = run_block("pipeline_create_card", { board_id: board.id, stage_id: first_stage.id })

      expect(Pipelines::Card.find(execution.variables["pipeline_card_id"]).title).to eq("Fernanda Lima")
    end

    it "aceita o nome do quadro e da etapa, como `kanban.*`" do
      first_stage

      execution = run_block("pipeline_create_card", { board_id: board.name, stage_id: "novo", title: "Por nome" })

      expect(Pipelines::Card.find(execution.variables["pipeline_card_id"]).stage_id).to eq(first_stage.id)
    end

    it "com `link_chat: false`, não liga à conversa" do
      execution = run_block("pipeline_create_card", data.merge(link_chat: false))

      expect(Pipelines::Card.find(execution.variables["pipeline_card_id"]).chat_id).to be_nil
    end

    it "o log fala em etapa e conversa, nunca em coluna" do
      output = output_of(run_block("pipeline_create_card", data))

      expect(output["data"]).to include("stage_id" => first_stage.id, "chat_id" => chat.id.to_s)
      expect(output.to_json).not_to include("kanban_column_id", "conversation_id")
    end

    it "rodar de novo na conversa reaproveita o card em aberto" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("b", "pipeline_create_card", data) ], [ edge("t", "b") ])

      first = run_flow(flow, chat: chat).reload
      second = run_flow(flow, chat: Chat.scoped(organization.id, chat.id)).reload

      expect(second.variables["pipeline_card_id"]).to eq(first.variables["pipeline_card_id"])
      expect(log_of(second, "b").output).to eq("reused_card_id" => first.variables["pipeline_card_id"])
      expect(Pipelines::Card.where(chat_id: chat.id.to_s).count).to eq(1)
    end

    it "com `reuse_existing: false`, ou com o negócio fechado, cria outro" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("b", "pipeline_create_card", data.merge(reuse_existing: false)) ], [ edge("t", "b") ])
      2.times { run_flow(flow, chat: Chat.scoped(organization.id, chat.id)) }
      expect(Pipelines::Card.where(chat_id: chat.id.to_s).count).to eq(2)

      reusing = published_flow(organization, [ node("t", "trigger_manual"), node("b", "pipeline_create_card", data) ], [ edge("t", "b") ])
      closed = run_flow(reusing, chat: Chat.scoped(organization.id, chat.id)).reload.variables["pipeline_card_id"]
      Pipelines::Card.find(closed).mark_won!
      expect(run_flow(reusing, chat: Chat.scoped(organization.id, chat.id)).reload.variables["pipeline_card_id"]).not_to eq(closed)
    end

    it "valor que não é número não vira zero: fica claro o que houve" do
      execution = run_block("pipeline_create_card", data.merge(deal_value: "muito"))

      expect(execution).to have_attributes(status: "failed", error_message: a_string_starting_with("Pipelines:"))
      expect(Pipelines::Card.where(chat_id: chat.id.to_s)).not_to exist
    end

    context "com quadro que não existe" do
      let(:failing_run) { run_block("pipeline_create_card", { board_id: SecureRandom.uuid, stage_id: first_stage.id }) }

      it_behaves_like "um bloco que falha com mensagem", "o quadro"
    end

    context "com etapa que não existe" do
      let(:failing_run) { run_block("pipeline_create_card", { board_id: board.id, stage_id: SecureRandom.uuid }) }

      it_behaves_like "um bloco que falha com mensagem", "a etapa"

      it "a mensagem nunca fala em coluna" do
        expect(failing_run.error_message).not_to match(/column|coluna/i)
        expect(log_of(failing_run, "b").output["error"]).not_to match(/column|coluna/i)
      end
    end

    it "quadro de outra organização é como se não existisse" do
      alheio = create(:pipeline_board, organization: create(:organization))
      stage = create(:pipeline_stage, board: alheio)

      execution = run_block("pipeline_create_card", { board_id: alheio.id, stage_id: stage.id, title: "x" })

      expect(execution.status).to eq("failed")
      expect(Pipelines::Card.where(stage_id: stage.id)).not_to exist
    end

    it "segue por onError, com o motivo em variável" do
      execution = run_block("pipeline_create_card", { board_id: SecureRandom.uuid }, handles: %w[onError])

      expect(execution.status).to eq("completed")
      expect(execution.variables).to include("saiu_por" => "onError", "pipeline_error" => a_string_including("o quadro"))
    end

    it "traduz a mensagem" do
      I18n.with_locale(:en) do
        expect(FlowRuntime::Nodes::PipelineBase.humanize_error(error: "not_found: Column 'x' not found in board 'y'")).to eq(%(Pipelines: stage "x" doesn't exist in this board.))
      end
    end
  end

  describe "de onde vem o card" do
    it "do bloco Criar card anterior, mesmo em outra execução" do
      flow = published_flow(
        organization,
        [
          node("t", "trigger_manual"),
          node("c", "pipeline_create_card", board_id: board.id, stage_id: first_stage.id, title: "Novo"),
          node("m", "pipeline_move_card", card_source: { type: "node", node_id: "c" }, stage_id: second_stage.id)
        ],
        [ edge("t", "c"), edge("c", "m") ]
      )

      execution = run_flow(flow, chat: chat).reload

      expect(Pipelines::Card.find(execution.variables["pipeline_card_id"]).stage_id).to eq(second_stage.id)
    end

    it "do card mais recente da conversa no quadro" do
      create(:pipeline_card, stage: first_stage, chat_id: chat.id.to_s, title: "Antigo", created_at: 2.days.ago)
      card

      expect(run_block("pipeline_mark_won", { card_source: from_chat }).variables["pipeline_card_id"]).to eq(card.id)
    end

    it "não pega o card arquivado, o de outra conversa nem o de outra organização" do
      create(:pipeline_card, stage: first_stage, chat_id: chat.id.to_s, archived: true)
      create(:pipeline_card, stage: first_stage, chat_id: create(:chat, connector: connector).id.to_s)
      alheio = create(:pipeline_board, organization: create(:organization))
      create(:pipeline_card, stage: create(:pipeline_stage, board: alheio), chat_id: chat.id.to_s)

      execution = run_block("pipeline_mark_won", { card_source: from_chat })
      expect(execution).to have_attributes(status: "failed", error_message: a_string_including("nenhum card"))

      execution = run_block("pipeline_mark_won", { card_source: { type: "chat", board_id: alheio.id } })
      expect(execution).to have_attributes(status: "failed", error_message: a_string_including("nenhum card"))
    end

    it "sem card, segue por onError" do
      execution = run_block("pipeline_archive_card", { card_source: { type: "node", node_id: "nao-rodou" } }, handles: %w[onError])

      expect(execution.variables).to include("saiu_por" => "onError", "pipeline_error" => a_string_including("nenhum card"))
    end
  end

  describe "pipeline_move_card" do
    before { card }

    it "move para outra etapa" do
      execution = run_block("pipeline_move_card", { card_source: from_chat, stage_id: second_stage.id }, handles: [ nil ])

      expect(card.reload.stage_id).to eq(second_stage.id)
      expect(execution.variables).to include("saiu_por" => "padrao", "pipeline_card_id" => card.id)
      expect(output_of(execution)["data"]).to include("stage_id" => second_stage.id)
    end

    it "`position: bottom` põe no fim, e o padrão no começo" do
      other = create(:pipeline_card, stage: second_stage)

      run_block("pipeline_move_card", { card_source: from_chat, stage_id: second_stage.id, position: "bottom" })
      expect(second_stage.cards.order(:position).pluck(:id)).to eq([ other.id, card.id ])

      card.update!(stage: first_stage)
      run_block("pipeline_move_card", { card_source: from_chat, stage_id: second_stage.id })
      expect(second_stage.cards.order(:position).pluck(:id)).to eq([ card.id, other.id ])
    end

    it "etapa de outro quadro não serve" do
      other_stage = create(:pipeline_stage, board: create(:pipeline_board, organization: organization))

      execution = run_block("pipeline_move_card", { card_source: from_chat, stage_id: other_stage.id })

      expect(execution).to have_attributes(status: "failed", error_message: a_string_including("a etapa"))
      expect(card.reload.stage_id).to eq(first_stage.id)
    end

    it "a trava de checklist segura, e diz o que falta" do
      create(:pipeline_stage_checklist_item, stage: first_stage, title: "Conferir CNPJ", required: true)
      second_stage

      execution = run_block("pipeline_move_card", { card_source: from_chat, stage_id: second_stage.id })

      expect(execution).to have_attributes(status: "failed", error_message: a_string_including("Conferir CNPJ"))
      expect(output_of(execution)["pending_items"]).to eq([ "Conferir CNPJ" ])
      expect(card.reload.stage_id).to eq(first_stage.id)
    end

    it "a trava de campo obrigatório também" do
      create(:pipeline_custom_field, board: board, stage: first_stage, scope: "stage", name: "Orçamento", key: "orcamento", required_to_leave_stage: true)
      second_stage

      execution = run_block("pipeline_move_card", { card_source: from_chat, stage_id: second_stage.id }, handles: %w[onError])

      expect(execution.variables).to include("saiu_por" => "onError", "pipeline_error" => a_string_including("Orçamento"))
    end
  end

  describe "pipeline_update_card" do
    before { card }

    it "muda só o que foi preenchido, com variáveis" do
      run_block("pipeline_update_card", { card_source: from_chat, title: "Pedido de {{vars.produto}}", deal_probability: 40, company_name: "" }, variables: { "produto" => "caneca" })

      expect(card.reload).to have_attributes(title: "Pedido de caneca", deal_probability: 40, company_name: nil)
    end

    it "valor recusado pelo card sai como erro" do
      execution = run_block("pipeline_update_card", { card_source: from_chat, deal_probability: 900 })

      expect(execution.status).to eq("failed")
      expect(card.reload.deal_probability).to be_nil
    end
  end

  describe "pipeline_set_custom_field" do
    before do
      card
      create(:pipeline_custom_field, board: board, name: "Origem", key: "origem", field_type: "select", options: %w[Instagram Indicação])
    end

    it "acha o campo pelo nome, e casa a opção sem acento nem caixa" do
      execution = run_block("pipeline_set_custom_field", { card_source: from_chat, field_key: "origem", value: "indicacao" })

      expect(card.reload.custom_field_values).to eq("origem" => "Indicação")
      expect(output_of(execution)["resolved"]).to eq("key" => "origem", "value" => "Indicação")
    end

    it "sem campo, falha" do
      expect(run_block("pipeline_set_custom_field", { card_source: from_chat }).error_message).to include("campo não informado")
    end
  end

  describe "ganho, perdido e reabrir" do
    before { card }

    it "marca como ganho, e a conversa fica com a etiqueta" do
      run_block("pipeline_mark_won", { card_source: from_chat })

      expect(card.reload.won_at).to be_present
      expect(Chat.scoped(organization.id, chat.id).chat_tags.map(&:name)).to include("ganho")
    end

    it "marca como perdido, com o motivo" do
      run_block("pipeline_mark_lost", { card_source: from_chat, reason: "Achou caro: {{vars.valor}}" }, variables: { "valor" => "R$ 900" })

      expect(card.reload).to have_attributes(lost_at: be_present, lost_reason: "Achou caro: R$ 900")
    end

    it "reabre" do
      card.mark_lost!("caro")

      run_block("pipeline_reopen_deal", { card_source: from_chat })

      expect(card.reload).to have_attributes(lost_at: nil, won_at: nil, lost_reason: nil)
    end

    it "campo obrigatório para fechar segura, e diz qual" do
      board.update!(require_fields_on_deal_won: true)
      create(:pipeline_custom_field, board: board, name: "Motivo do ganho", key: "motivo", required: true)

      execution = run_block("pipeline_mark_won", { card_source: from_chat })

      expect(execution).to have_attributes(status: "failed", error_message: a_string_including("Motivo do ganho"))
      expect(card.reload.won_at).to be_nil
    end
  end

  describe "etiquetas" do
    before { card }

    it "pipeline_add_label cria pelo nome, e reaproveita" do
      existing = create(:pipeline_label, organization: organization, name: "Urgente")

      run_block("pipeline_add_label", { card_source: from_chat, label: "urgente" })
      run_block("pipeline_add_label", { card_source: from_chat, label: "Veio do {{vars.canal}}" }, variables: { "canal" => "fluxo" })

      expect(card.reload.labels.map(&:name)).to contain_exactly("Urgente", "Veio do fluxo")
      expect(card.labels).to include(existing)
    end

    it "pipeline_add_label sem nome falha" do
      expect(run_block("pipeline_add_label", { card_source: from_chat }).error_message).to include("etiqueta não informada")
    end

    it "pipeline_remove_label tira" do
      label = create(:pipeline_label, organization: organization)
      card.labels << label

      run_block("pipeline_remove_label", { card_source: from_chat, label_id: label.id })

      expect(card.reload.labels).to be_empty
    end
  end

  describe "pipeline_add_comment" do
    before { card }

    it "comenta, assinado pela automação" do
      run_block("pipeline_add_comment", { card_source: from_chat, body: "Pediu {{vars.produto}}" }, variables: { "produto" => "caneca" })

      expect(card.comments.take).to have_attributes(body: "Pediu caneca", automation_source: "flow")
    end

    it "vazio falha" do
      expect(run_block("pipeline_add_comment", { card_source: from_chat, body: "{{vars.nada}}" }).error_message).to include("comentário vazio")
    end
  end

  describe "pipeline_add_checklist" do
    before { card }

    it "cria com os itens, sem repetir o que já existe" do
      2.times { run_block("pipeline_add_checklist", { card_source: from_chat, name: "Entrega", items: [ "Separar", "Enviar {{vars.produto}}", "" ] }, variables: { "produto" => "caneca" }) }

      checklist = card.checklists.take
      expect(card.checklists.count).to eq(1)
      expect(checklist.items.map(&:title)).to contain_exactly("Separar", "Enviar caneca")
    end

    it "sem nome falha" do
      expect(run_block("pipeline_add_checklist", { card_source: from_chat }).error_message).to include("checklist sem nome")
    end
  end

  describe "pipeline_archive_card" do
    it "arquiva" do
      card

      run_block("pipeline_archive_card", { card_source: from_chat })

      expect(card.reload.archived).to be(true)
    end
  end

  describe "pipeline_create_deal" do
    let(:account) { create(:account, organization: organization) }

    it "cria na etapa, com os valores, e guarda o id" do
      execution = run_block(
        "pipeline_create_deal",
        { stage_id: first_stage.id, title: "Pedido de {{vars.produto}}", description: "Via fluxo", deal_value: "{{vars.valor}}", deal_probability: "30", assigned_to_id: account.id },
        variables: { "produto" => "caneca", "valor" => "1499.90" }
      )

      deal = Pipelines::Card.find(execution.variables["last_deal_id"])
      expect(deal).to have_attributes(
        stage_id: first_stage.id, organization_id: organization.id, chat_id: chat.id.to_s, title: "Pedido de caneca",
        description: "Via fluxo", deal_value: 1499.9, deal_probability: 30, assigned_to_id: account.id
      )
      expect(output_of(execution)).to eq("card_id" => deal.id, "stage_id" => first_stage.id, "title" => "Pedido de caneca")
    end

    it "sem título, usa o nome do contato" do
      execution = run_block("pipeline_create_deal", { stage_id: first_stage.id })

      expect(Pipelines::Card.find(execution.variables["last_deal_id"]).title).to include("Fernanda Lima")
    end

    it "sem etapa, registra e segue" do
      execution = run_block("pipeline_create_deal", { stage_id: "" }, handles: [ nil ])

      expect(execution).to have_attributes(status: "completed")
      expect(execution.variables).to include("saiu_por" => "padrao")
      expect(output_of(execution)).to eq("skipped" => "invalid_or_missing_stage")
    end

    it "etapa de outra organização não serve" do
      alheia = create(:pipeline_stage, board: create(:pipeline_board, organization: create(:organization)))

      expect(output_of(run_block("pipeline_create_deal", { stage_id: alheia.id }))).to eq("skipped" => "invalid_or_missing_stage")
      expect(Pipelines::Card.where(stage_id: alheia.id)).not_to exist
    end

    it "responsável de outra organização fica de fora" do
      execution = run_block("pipeline_create_deal", { stage_id: first_stage.id, assigned_to_id: create(:account).id })

      expect(Pipelines::Card.find(execution.variables["last_deal_id"]).assigned_to_id).to be_nil
    end

    it "valor recusado pelo card registra e segue" do
      execution = run_block("pipeline_create_deal", { stage_id: first_stage.id, deal_probability: 900 })

      expect(execution).to have_attributes(status: "completed")
      expect(output_of(execution)["skipped"]).to start_with("error:")
    end

    it "valor que não é número fica de fora, em vez de virar zero" do
      execution = run_block("pipeline_create_deal", { stage_id: first_stage.id, deal_value: "a combinar" })

      expect(Pipelines::Card.find(execution.variables["last_deal_id"]).deal_value).to be_nil
    end
  end

  describe "pipeline_update_deal" do
    it "atualiza o que `pipeline_create_deal` criou na mesma execução, e muda de etapa acertando as posições" do
      other = create(:pipeline_card, stage: second_stage)
      flow = published_flow(
        organization,
        [
          node("t", "trigger_manual"),
          node("c", "pipeline_create_deal", stage_id: first_stage.id, title: "Novo", deal_value: 100),
          node("u", "pipeline_update_deal", stage_id: second_stage.id, title: "Atualizado", deal_value: "250.5", deal_probability: 70)
        ],
        [ edge("t", "c"), edge("c", "u") ]
      )

      execution = run_flow(flow, chat: chat).reload

      deal = Pipelines::Card.find(execution.variables["last_deal_id"])
      expect(deal).to have_attributes(stage_id: second_stage.id, title: "Atualizado", deal_value: 250.5, deal_probability: 70)
      expect(second_stage.cards.order(:position).pluck(:id)).to eq([ other.id, deal.id ])
      expect(second_stage.cards.order(:position).pluck(:position)).to eq([ 1, 2 ])
    end

    it "pelo `card_id`, que aceita variável" do
      card

      run_block("pipeline_update_deal", { card_id: "{{vars.card}}", title: "Novo título" }, variables: { "card" => card.id })

      expect(card.reload.title).to eq("Novo título")
    end

    it "muda de etapa sem conferir as travas, como na origem" do
      card
      create(:pipeline_stage_checklist_item, stage: first_stage, title: "Conferir CNPJ", required: true)

      run_block("pipeline_update_deal", { card_id: card.id, stage_id: second_stage.id })

      expect(card.reload.stage_id).to eq(second_stage.id)
    end

    it "sem card, registra e segue" do
      expect(output_of(run_block("pipeline_update_deal", { title: "x" }))).to eq("skipped" => "no_card")
      expect(output_of(run_block("pipeline_update_deal", { card_id: SecureRandom.uuid, title: "x" }))).to eq("skipped" => "card_not_found")
    end

    it "não alcança card nem etapa de outra organização" do
      alheia = create(:pipeline_stage, board: create(:pipeline_board, organization: create(:organization)))
      alheio = create(:pipeline_card, stage: alheia, title: "Alheio")
      card

      expect(output_of(run_block("pipeline_update_deal", { card_id: alheio.id, title: "x" }))).to eq("skipped" => "card_not_found")
      expect(alheio.reload.title).to eq("Alheio")

      expect(output_of(run_block("pipeline_update_deal", { card_id: card.id, stage_id: alheia.id, title: "x" }))).to eq("skipped" => "invalid_stage")
      expect(card.reload).to have_attributes(stage_id: first_stage.id, title: "Pedido da Fernanda")
    end

    it "valor recusado registra e segue" do
      execution = run_block("pipeline_update_deal", { card_id: card.id, deal_probability: 900 })

      expect(execution).to have_attributes(status: "completed")
      expect(output_of(execution)["skipped"]).to start_with("error:")
    end
  end

  describe "gatilhos do quadro" do
    it "o que o fluxo muda dispara, como na origem" do
      card
      trigger = create(:pipeline_trigger, board: board, event_type: "card_moved")

      expect { run_block("pipeline_move_card", { card_source: from_chat, stage_id: second_stage.id }) }
        .to have_enqueued_job(Pipelines::TriggerJob).with(trigger.id, card.id, anything)
    end

    it "o negócio também" do
      trigger = create(:pipeline_trigger, board: board, event_type: "card_created")

      expect { run_block("pipeline_create_deal", { stage_id: first_stage.id }) }.to have_enqueued_job(Pipelines::TriggerJob).with(trigger.id, anything, anything)
    end
  end

  describe "no teste do editor" do
    let(:broadcasts) { [] }

    before do
      allow(ActionCable.server).to receive(:broadcast) { |_stream, payload| broadcasts << payload.deep_stringify_keys }
    end

    FlowRuntime::NodeRegistry::CATALOG["pipeline"].each_key do |type|
      it "#{type} não mexe em quadro nenhum, avisa, e o fluxo segue" do
        flow = published_flow(
          organization,
          [ node("t", "trigger_manual"), node("b", type, board_id: board.id, stage_id: first_stage.id, title: "x") ],
          [ edge("t", "b") ]
        )

        expect { @execution = run_flow(flow, playground: true).reload }.not_to(change { Pipelines::Card.count })

        expect(@execution).to have_attributes(status: "completed")
        expect(log_of(@execution, "b").output).to eq("skipped" => "playground")
        expect(broadcasts).to include(a_hash_including("kind" => "event", "name" => "pipeline_skipped", "payload" => { "type" => type }))
      end
    end
  end
end
