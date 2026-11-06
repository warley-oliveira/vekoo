require "rails_helper"

# Tudo roda em V8 de verdade, pelo script, como quem usa. A API JS é contrato de quem escreve script:
# `kanban.*`, `column`, `conversation` e `kanban_column_id` continuam com esses nomes, mesmo o resto do
# domínio chamando de etapa e de conversa outra coisa.
RSpec.describe MiniRacerEngine::Workers::Kanban do
  let(:organization) { create(:organization) }
  let(:other_organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization, user_name: "Lead Teste", external_id: "5511999999999") }
  let(:board) { create(:pipeline_board, organization: organization, name: "Pipeline Vendas") }
  let!(:column_a) { create(:pipeline_stage, board: board, name: "Novos") }
  let!(:column_b) { create(:pipeline_stage, board: board, name: "Em Atendimento") }
  let!(:column_c) { create(:pipeline_stage, board: board, name: "Fechado") }

  def run(code, params = {}, on_chat: chat)
    run_script(code, params, organization: organization, chat: on_chat)
  end

  def linked_card(**attributes)
    create(:pipeline_card, stage: column_a, chat_id: chat.id.to_s, **attributes)
  end

  describe "a API continua com os nomes da origem" do
    %w[
      listBoards getBoard listColumns listCards findCardsForConversation listLabels
      createCard getCard updateCard moveCard archiveCard markWon markLost reopenDeal
      addLabel removeLabel setCustomField getCustomField getCustomFields getRelevantCustomFields
      incrementCustomField getCustomFieldNumber addChecklist addChecklistItem toggleChecklistItem
      listChecklists addComment listComments
      boards board card cardsForConversation labels
    ].each do |name|
      it "kanban.#{name} existe" do
        expect(run("return typeof kanban.#{name};")).to eq("function")
      end
    end

    it "não existe `pipelines.*`" do
      expect(run("return typeof pipelines;")).to eq("undefined")
    end

    it "o card sai com `kanban_column_id` e `conversation_id`" do
      card = linked_card(title: "Com nomes antigos")

      result = run("return kanban.getCard(params.id).data;", { id: card.id })

      expect(result).to include("kanban_column_id" => column_a.id, "conversation_id" => chat.id.to_s, "title" => "Com nomes antigos")
      expect(result).not_to have_key("stage_id")
    end

    it "o quadro sai com `columns` e o campo, com `scope: column`" do
      create(:pipeline_custom_field, board: board, stage: column_a, scope: "stage", name: "Orçamento", required_to_leave_stage: true)

      result = run("return kanban.getBoard('Pipeline Vendas').data;")

      expect(result["columns"].map { |column| column["name"] }).to eq([ "Novos", "Em Atendimento", "Fechado" ])
      expect(result["custom_field_definitions"].first).to include(
        "scope" => "column", "kanban_column_id" => column_a.id, "required_to_leave_column" => true, "key" => "orcamento"
      )
    end
  end

  describe "contexto" do
    it "falha fechado sem organização" do
      expect { run_script("return kanban.listBoards();") }.to raise_error(MiniRacer::RuntimeError, /No organization/)
    end

    it "um script que nunca usa kanban não paga nada dele" do
      expect(Pipelines::Board).not_to receive(:where)

      expect(run("return 1 + 1;")).to eq(2)
    end

    it "sem conversa, os cards do lead são nenhum, e não todos os cards sem conversa" do
      create(:pipeline_card, stage: column_a)

      expect(run("return kanban.cardsForConversation().length;", on_chat: nil)).to eq(0)
      expect(run("return kanban.board(params.id).cards().length;", { id: board.id }, on_chat: nil)).to eq(0)
    end
  end

  describe "descoberta" do
    it "lista só os quadros ativos da organização" do
      create(:pipeline_board, organization: organization, name: "Arquivado", archived: true)
      create(:pipeline_board, organization: other_organization, name: "Vazado")

      expect(run("return kanban.boards().map(b => b.name);")).to eq([ "Pipeline Vendas" ])
    end

    it "a segunda chamada vem do cache da execução" do
      result = run(<<~JS)
        const first = kanban.listBoards();
        const second = kanban.listBoards();
        return JSON.stringify(first.data) === JSON.stringify(second.data);
      JS

      expect(result).to be(true)
    end

    it "acha quadro e etapa pelo id, em texto, e pelo nome, sem caixa e sem acento" do
      create(:pipeline_stage, board: board, name: "Negociação")

      result = run(<<~JS, { id: board.id, column_id: column_b.id })
        const byId = kanban.board(params.id);
        const byName = kanban.board('PIPELINE VENDAS');
        return {
          byId: byId.name,
          byName: byName.name,
          columnById: byId.column(params.column_id).name,
          columnByName: byId.column('em atendimento').name,
          columnNoAccent: byId.column('negociacao').name,
          missing: byId.column('Nao existe') === undefined,
        };
      JS

      expect(result).to eq(
        "byId" => "Pipeline Vendas", "byName" => "Pipeline Vendas", "columnById" => "Em Atendimento",
        "columnByName" => "Em Atendimento", "columnNoAccent" => "Negociação", "missing" => true
      )
    end

    it "devolve not_found para quadro de outra organização, por id ou por nome" do
      other = create(:pipeline_board, organization: other_organization, name: "Alheio")

      expect(run("return kanban.getBoard(params.id);", { id: other.id })).to include("ok" => false, "error" => a_string_starting_with("not_found"))
      expect(run("return kanban.getBoard('Alheio').ok;")).to be(false)
      expect(run("return kanban.board(params.id);", { id: other.id })).to be_nil
    end

    it "devolve not_found para número, que não é mais id" do
      expect(run("return kanban.getBoard(123).error;")).to start_with("not_found")
    end

    it "lista as etapas" do
      expect(run("return kanban.listColumns(params.id).data.map(c => c.name);", { id: board.id }))
        .to eq([ "Novos", "Em Atendimento", "Fechado" ])
    end

    it "lista as etiquetas da organização" do
      create(:pipeline_label, organization: organization, name: "Quente")
      create(:pipeline_label, organization: other_organization, name: "Alheia")

      expect(run("return kanban.labels().map(l => l.name);")).to eq([ "Quente" ])
    end
  end

  describe "listar cards" do
    let!(:mine) { linked_card(title: "Do lead", priority: "high", tags: %w[vip]) }
    let!(:other) { create(:pipeline_card, stage: column_b, title: "De outro lead", priority: "low") }

    it "por padrão, só os da conversa atual" do
      expect(run("return kanban.board(params.id).cards().map(c => c.title);", { id: board.id })).to eq([ "Do lead" ])
    end

    it "com allConversations, todos, só leitura" do
      result = run("return kanban.board(params.id).cards({ allConversations: true }).map(c => c.title);", { id: board.id })

      expect(result).to contain_exactly("Do lead", "De outro lead")
    end

    it "filtra por etapa, pelo objeto da etapa" do
      result = run("return kanban.board(params.id).column('Em Atendimento').cards({ allConversations: true }).map(c => c.title);", { id: board.id })

      expect(result).to eq([ "De outro lead" ])
    end

    it "filtra por prioridade, título e etiqueta de texto" do
      expect(run("return kanban.listCards(params.id, { allConversations: true, priority: 'low' }).data.length;", { id: board.id })).to eq(1)
      expect(run("return kanban.listCards(params.id, { allConversations: true, search: 'outro' }).data.length;", { id: board.id })).to eq(1)
      expect(run("return kanban.listCards(params.id, { allConversations: true, tags: ['vip'] }).data.length;", { id: board.id })).to eq(1)
    end

    it "não confunde filtro de id inválido com vazio" do
      expect(run("return kanban.listCards(params.id, { allConversations: true, column_id: 123 }).data.length;", { id: board.id })).to eq(0)
      expect(run("return kanban.listCards(params.id, { allConversations: true, assigned_to_id: 'abc' }).data.length;", { id: board.id })).to eq(0)
    end

    it "tira os arquivados, salvo se pedir" do
      mine.update!(archived: true)

      expect(run("return kanban.board(params.id).cards().length;", { id: board.id })).to eq(0)
      expect(run("return kanban.board(params.id).cards({ archived: true }).length;", { id: board.id })).to eq(1)
    end

    it "acha os cards da conversa em qualquer quadro da organização" do
      other_board = create(:pipeline_board, organization: organization)
      create(:pipeline_card, stage: create(:pipeline_stage, board: other_board), title: "No outro quadro", chat_id: chat.id.to_s)

      expect(run("return kanban.cardsForConversation().map(c => c.title);")).to contain_exactly("Do lead", "No outro quadro")
    end

    it "ignora card de outra organização com o mesmo id de conversa" do
      foreign_board = create(:pipeline_board, organization: other_organization)
      create(:pipeline_card, stage: create(:pipeline_stage, board: foreign_board), title: "Alheio", chat_id: chat.id.to_s)

      expect(run("return kanban.cardsForConversation().map(c => c.title);")).to eq([ "Do lead" ])
    end
  end

  describe "criar card" do
    it "liga à conversa por padrão, com os atributos pedidos" do
      result = run(<<~JS, { id: board.id })
        const card = kanban.board(params.id).createCard('Novos', { title: 'Lead quente', priority: 'high', deal_value: 2500, company_name: 'Doma' });
        return { id: card.id, title: card.title, conversation: card.conversation_id, value: card.deal_value, company: card.company_name };
      JS

      expect(result).to include("title" => "Lead quente", "conversation" => chat.id.to_s, "value" => 2500.0, "company" => "Doma")
      expect(Pipelines::Card.find(result["id"]).organization_id).to eq(organization.id)
    end

    it "o título vem do contato quando não é pedido" do
      result = run("return kanban.board(params.id).column('Novos').createCard({ priority: 'high' }).title;", { id: board.id })

      expect(result).to eq("Lead Teste")
    end

    it "cria um card só, e os gatilhos veem o card pronto" do
      trigger = create(:pipeline_trigger, board: board, event_type: "card_created", conditions: { "priority" => "high" })

      expect { run("kanban.board(params.id).createCard('Novos', { title: 'X', priority: 'high' });", { id: board.id }) }
        .to change(Pipelines::Card, :count).by(1)
        .and have_enqueued_job(Pipelines::TriggerJob).with(trigger.id, anything, anything).exactly(:once)
    end

    it "cria avulso com linkConversation: false" do
      result = run("return kanban.createCard(params.id, params.column, { title: 'Avulso', linkConversation: false }).data;",
        { id: board.id, column: column_a.id })

      expect(result).to include("title" => "Avulso", "conversation_id" => nil)
    end

    it "sem conversa no contexto, o card fica avulso" do
      result = run("return kanban.createCard(params.id, 'Novos', { title: 'Sem lead' }).data.conversation_id;", { id: board.id }, on_chat: nil)

      expect(result).to be_nil
    end

    it "devolve erro para etapa de outro quadro, sem criar nada" do
      foreign = create(:pipeline_stage)

      result = run("return kanban.createCard(params.id, params.column, { title: 'X' });", { id: board.id, column: foreign.id })

      expect(result).to include("ok" => false, "error" => a_string_starting_with("not_found"))
    end

    it "devolve o erro de validação no retorno, com acento" do
      result = run("return kanban.createCard(params.id, 'Novos', { title: '', linkConversation: false });", { id: board.id })

      expect(result["ok"]).to be(false)
      expect(result["error"]).to include("Título")
    end

    it "não deixa atribuir a pessoa de outra organização" do
      stranger = create(:account, organization: other_organization)

      result = run("return kanban.createCard(params.id, 'Novos', { title: 'X', assigned_to_id: params.stranger });",
        { id: board.id, stranger: stranger.id })

      expect(result["ok"]).to be(false)
    end
  end

  describe "ler e atualizar card" do
    let!(:card) { linked_card(title: "Atual") }

    it "lê card da organização, e not_found para o de outra" do
      foreign = create(:pipeline_card)

      expect(run("return kanban.card(params.id).title;", { id: card.id })).to eq("Atual")
      expect(run("return kanban.getCard(params.id);", { id: foreign.id })).to include("ok" => false)
      expect(run("return kanban.getCard(123);")).to include("ok" => false)
    end

    it "atualiza o que está na lista, e ignora o resto" do
      result = run(<<~JS, { id: card.id })
        const card = kanban.card(params.id).update({ deal_value: 5000, deal_probability: 80, tags: ['quente'], archived: true, chat_id: 'x' });
        return { value: card.deal_value, probability: card.deal_probability, tags: card.tags, archived: card.archived };
      JS

      expect(result).to eq("value" => 5000.0, "probability" => 80, "tags" => [ "quente" ], "archived" => false)
    end

    it "devolve erro de validação no retorno, e `null` no fluente" do
      expect(run("return kanban.updateCard(params.id, { title: '' }).ok;", { id: card.id })).to be(false)
      expect(run("return kanban.card(params.id).update({ title: '' });", { id: card.id })).to be_nil
    end

    it "`refresh` relê" do
      result = run(<<~JS, { id: card.id })
        const card = kanban.card(params.id);
        kanban.updateCard(params.id, { title: 'Mudou' });
        return [card.title, card.refresh().title];
      JS

      expect(result).to eq([ "Atual", "Mudou" ])
    end

    it "arquiva e desarquiva" do
      expect(run("return kanban.card(params.id).archive().archived;", { id: card.id })).to be(true)
      expect(run("return kanban.card(params.id).unarchive().archived;", { id: card.id })).to be(false)
    end

    it "não é uma porta para o resto do sistema: outras exceções não vazam o detalhe" do
      allow(Pipelines::Card).to receive(:where).and_raise(ActiveRecord::StatementInvalid, "PG::Error host=segredo")

      result = run("return kanban.getCard(params.id);", { id: card.id })

      expect(result).to eq("ok" => false, "error" => "internal_error")
    end
  end

  describe "mover" do
    let!(:card) { linked_card }

    it "vai para o topo por padrão, e para o fim com atEnd" do
      others = create_list(:pipeline_card, 2, stage: column_b)

      run("kanban.card(params.id).moveTo('Em Atendimento');", { id: card.id })
      expect(column_b.cards.reload.first.id).to eq(card.id)

      run("kanban.card(params.id).moveTo('Em Atendimento', true);", { id: card.id })
      expect(column_b.cards.reload.last.id).to eq(card.id)
      expect(others.map { |other| other.reload.stage_id }).to all(eq(column_b.id))
    end

    it "move pelo id da etapa, em texto, e devolve o card fluente" do
      result = run(<<~JS, { id: card.id, target: column_c.id })
        const moved = kanban.card(params.id).moveTo(params.target);
        return { column: moved.kanban_column_id, chain: typeof moved.markWon };
      JS

      expect(result).to eq("column" => column_c.id, "chain" => "function")
    end

    it "trava com checklist obrigatório incompleto, dizendo o que falta" do
      create(:pipeline_stage_checklist_item, stage: column_a, title: "Coletar CPF")

      result = run("return kanban.card(params.id).moveTo('Em Atendimento');", { id: card.id })

      expect(result).to eq("ok" => false, "error" => "checklist_incomplete", "pending_items" => [ "Coletar CPF" ])
      expect(card.reload.stage_id).to eq(column_a.id)
    end

    it "trava com campo obrigatório vazio" do
      create(:pipeline_custom_field, board: board, stage: column_a, scope: "stage", name: "Orçamento", required_to_leave_stage: true)

      result = run("return kanban.moveCard(params.id, 'Em Atendimento', false);", { id: card.id })

      expect(result).to eq("ok" => false, "error" => "required_fields_incomplete", "pending_fields" => [ "Orçamento" ])
    end

    it "campo obrigatório do quadro não trava a mudança de etapa" do
      create(:pipeline_custom_field, board: board, name: "Geral", required: true)

      expect(run("return kanban.card(params.id).moveTo('Em Atendimento').ok !== false;", { id: card.id })).to be(true)
    end

    it "voltar não exige nada" do
      create(:pipeline_stage_checklist_item, stage: column_c, title: "Só para avançar")
      late = create(:pipeline_card, stage: column_c, chat_id: chat.id.to_s)

      expect(run("return kanban.card(params.id).moveTo('Novos').ok !== false;", { id: late.id })).to be(true)
    end

    it "not_found para etapa de outro quadro" do
      foreign = create(:pipeline_stage)

      result = run("return kanban.moveCard(params.id, params.target);", { id: card.id, target: foreign.id })

      expect(result).to include("ok" => false, "error" => a_string_starting_with("not_found"))
    end
  end

  describe "ganho, perdido, reabrir" do
    let!(:card) { linked_card(deal_value: 100) }

    it "marca e etiqueta a conversa" do
      expect(run("return kanban.card(params.id).markWon().won_at;", { id: card.id })).to be_present

      tag = ChatTag.where(organization_id: organization.id, name: "ganho").take
      expect(chat.reload.chat_tag_ids).to eq([ tag.id ])
    end

    it "marca perdido com o motivo, e reabre" do
      result = run(<<~JS, { id: card.id })
        const lost = kanban.card(params.id).markLost('Preço');
        const reopened = lost.reopen();
        return { reason: lost.lost_reason, wonAfter: reopened.won_at, lostAfter: reopened.lost_at };
      JS

      expect(result).to eq("reason" => "Preço", "wonAfter" => nil, "lostAfter" => nil)
    end

    it "respeita a trava de campos ao fechar" do
      board.update!(require_fields_on_deal_won: true)
      create(:pipeline_custom_field, board: board, name: "Forma de pagamento", required: true)

      result = run("return kanban.markWon(params.id);", { id: card.id })

      expect(result).to eq(
        "ok" => false, "error" => "required_fields_incomplete",
        "pending_fields" => [ "Forma de pagamento" ], "pending_field_keys" => [ "forma_de_pagamento" ]
      )
    end
  end

  describe "etiquetas" do
    let!(:card) { linked_card }

    it "cria pelo nome, sem duplicar, sem ligar para a caixa" do
      result = run(<<~JS, { id: card.id })
        const card = kanban.card(params.id);
        card.addLabel('quente');
        card.addLabel('Quente');
        return kanban.labels().map(l => l.name);
      JS

      expect(result).to eq([ "quente" ])
      expect(card.labels.reload.map(&:name)).to eq([ "quente" ])
    end

    it "pelo id, em texto, usa a existente: não cria uma etiqueta com o UUID por nome" do
      label = create(:pipeline_label, organization: organization, name: "Existente")

      run("kanban.card(params.id).addLabel(params.label);", { id: card.id, label: label.id })

      expect(card.labels.reload).to eq([ label ])
      expect(organization.pipeline_labels.count).to eq(1)
    end

    it "not_found para etiqueta de outra organização" do
      foreign = create(:pipeline_label, organization: other_organization)

      result = run("return kanban.addLabel(params.id, params.label);", { id: card.id, label: foreign.id })

      expect(result).to include("ok" => false)
      expect(card.labels.reload).to be_empty
    end

    it "remove" do
      label = create(:pipeline_label, organization: organization)
      card.card_labels.create!(label: label)

      expect(run("return kanban.card(params.id).removeLabel(params.label);", { id: card.id, label: label.id })).to eq("ok" => true)
      expect(card.labels.reload).to be_empty
    end
  end

  describe "campos personalizados" do
    let!(:card) { linked_card(custom_field_values: { "outro" => "mantido" }) }

    it "grava preservando os outros, e resolve pelo nome com acento" do
      create(:pipeline_custom_field, board: board, name: "Qualificação")

      result = run(<<~JS, { id: card.id })
        const card = kanban.card(params.id);
        card.setCustomField('Qualificação', 'quente');
        return { value: card.getCustomField('qualificacao'), byCase: card.getCustomField('QUALIFICACAO') };
      JS

      expect(result).to eq("value" => "quente", "byCase" => "quente")
      expect(card.reload.custom_field_values).to eq("outro" => "mantido", "qualificacao" => "quente")
    end

    it "resolve nome com separador na ponta" do
      create(:pipeline_custom_field, board: board, name: "_qualificação")

      run("kanban.card(params.id).setCustomField('Qualificação', 'morno');", { id: card.id })

      expect(card.reload.custom_field_values).to include("_qualificacao" => "morno")
    end

    it "sem definição, grava com a chave como veio" do
      run("kanban.card(params.id).setCustomField('avulso', 1);", { id: card.id })

      expect(card.reload.custom_field_values).to include("avulso" => 1)
    end

    it "casa o valor com as opções da seleção, sem caixa e sem acento" do
      create(:pipeline_custom_field, board: board, name: "Status", field_type: "select", options: %w[Quente Média])

      result = run(<<~JS, { id: card.id })
        const a = kanban.setCustomField(params.id, 'Status', 'quente').resolved.value;
        const b = kanban.setCustomField(params.id, 'Status', 'media').resolved.value;
        const c = kanban.setCustomField(params.id, 'Status', 'outra').resolved.value;
        return [a, b, c];
      JS

      expect(result).to eq([ "Quente", "Média", "outra" ])
    end

    it "incrementa em comando atômico, sem perder as outras chaves" do
      create(:pipeline_custom_field, board: board, name: "Lead Score", field_type: "number")

      result = run(<<~JS, { id: card.id })
        const card = kanban.card(params.id);
        card.incrementCustomField('Lead Score');
        card.incrementCustomField('lead_score', 4);
        const down = card.incrementCustomField('lead_score', -2);
        return [down, card.getCustomFieldNumber('Lead Score')];
      JS

      expect(result.first).to eq(3.0)
      expect(result.last).to eq(3.0)
      expect(card.reload.custom_field_values).to include("outro" => "mantido")
    end

    it "incrementar um texto começa do zero, em vez de quebrar no banco" do
      card.update!(custom_field_values: { "nota" => "boa" })

      expect(run("return kanban.incrementCustomField(params.id, 'nota', 2).data.value;", { id: card.id })).to eq(2.0)
    end

    it "lê como número, com 0 no que não é" do
      card.update!(custom_field_values: { "texto" => "abc", "numero" => "12.5", "real" => 7 })

      result = run(<<~JS, { id: card.id })
        const card = kanban.card(params.id);
        return ['texto', 'numero', 'real', 'nada'].map(key => card.getCustomFieldNumber(key));
      JS

      expect(result).to eq([ 0.0, 12.5, 7.0, 0.0 ])
    end

    it "lista os do quadro, e os relevantes para a etapa do card" do
      create(:pipeline_custom_field, board: board, name: "Geral")
      create(:pipeline_custom_field, board: board, stage: column_a, scope: "stage", name: "Da A")
      create(:pipeline_custom_field, board: board, stage: column_b, scope: "stage", name: "Da B")

      result = run(<<~JS, { id: card.id, board: board.id })
        const card = kanban.card(params.id);
        const before = card.relevantCustomFields().map(f => f.name);
        card.moveTo('Em Atendimento');
        const after = kanban.card(params.id).relevantCustomFields().map(f => f.name);
        return { all: kanban.board(params.board).customFields().length, before, after };
      JS

      expect(result["all"]).to eq(3)
      expect(result["before"]).to contain_exactly("Geral", "Da A")
      expect(result["after"]).to contain_exactly("Geral", "Da B")
    end
  end

  describe "checklists" do
    let!(:card) { linked_card }

    it "cria, marca e lista, sem duplicar" do
      result = run(<<~JS, { id: card.id })
        const card = kanban.card(params.id);
        const checklist = card.addChecklist('Onboarding');
        card.addChecklist('ONBOARDING');
        const first = checklist.addItem('Coletar CPF');
        checklist.addItem('coletar cpf');
        checklist.addItem('Enviar contrato');
        first.toggle();
        return card.checklists();
      JS

      expect(result.size).to eq(1)
      expect(result.first["items"].map { |item| [ item["title"], item["completed"] ] })
        .to eq([ [ "Coletar CPF", true ], [ "Enviar contrato", false ] ])
    end

    it "not_found para item e checklist de outra organização" do
      foreign_item = create(:pipeline_checklist_item)

      expect(run("return kanban.toggleChecklistItem(params.id).ok;", { id: foreign_item.id })).to be(false)
      expect(run("return kanban.addChecklistItem(params.id, 'X').ok;", { id: foreign_item.checklist.id })).to be(false)
      expect(foreign_item.reload.completed).to be(false)
    end
  end

  describe "comentários" do
    let!(:card) { linked_card }

    it "assina como a automação, e não como uma pessoa" do
      result = run("return kanban.card(params.id).addComment('Lead pediu retorno.');", { id: card.id })

      expect(result).to include("body" => "Lead pediu retorno.", "pinned" => false)
      expect(result["author"]).to include("type" => "automation", "source" => "script", "name" => "Automação")
      expect(card.comments.take).to have_attributes(account_id: nil, automation_source: "script")
    end

    it "lista do mais novo para o mais velho, com limite" do
      create(:pipeline_comment, card: card, body: "Velho", created_at: 2.days.ago)
      create(:pipeline_comment, card: card, body: "Novo", created_at: 1.day.ago)

      expect(run("return kanban.card(params.id).comments(1).map(c => c.body);", { id: card.id })).to eq([ "Novo" ])
    end
  end

  describe "os guias da origem continuam valendo" do
    it "qualifica o lead e cria o card" do
      result = run(<<~JS, { boardName: "Pipeline Vendas", prioridade: "high", orcamento: 2500, company: "Doma" })
        const board = kanban.board(params.boardName);
        if (!board) return { error: 'board não encontrado' };

        const ja = board.cardsForConversation()[0];
        if (ja) return { already_exists: true, card_id: ja.id };

        const firstColumn = board.columns[0];
        const card = firstColumn.createCard({
          priority: params.prioridade || 'medium',
          deal_value: params.orcamento,
          company_name: params.company,
        });

        card.addLabel('novo-lead');
        card.addComment('Lead qualificado. Orçamento: R$ ' + params.orcamento);

        return { created: true, card_id: card.id, column: firstColumn.name };
      JS

      expect(result).to include("created" => true, "column" => "Novos")

      card = Pipelines::Card.find(result["card_id"])
      expect(card).to have_attributes(chat_id: chat.id.to_s, deal_value: 2500)
      expect(card.labels.map(&:name)).to eq([ "novo-lead" ])
      expect(card.comments.count).to eq(1)
    end

    it "avança para a próxima etapa, achando a atual pelo `kanban_column_id`" do
      linked_card

      result = run(<<~JS, { boardName: "Pipeline Vendas" })
        const board = kanban.board(params.boardName);
        const card = board.cardsForConversation()[0];
        const currentIdx = board.columns.findIndex(c => c.id === card.kanban_column_id);
        const next = board.columns[currentIdx + 1];
        const result = card.moveTo(next.id);
        return { moved_to: next.name, ok: result.ok !== false };
      JS

      expect(result).to eq("moved_to" => "Em Atendimento", "ok" => true)
    end

    it "fecha o negócio encadeando" do
      card = linked_card

      result = run(<<~JS)
        const card = kanban.cardsForConversation()[0];
        return card.update({ deal_value: 900, deal_probability: 100 }).markWon().won_at !== null;
      JS

      expect(result).to be(true)
      expect(card.reload.deal_value).to eq(900)
    end
  end

  describe "cota e rastreio" do
    it "cada chamada conta, e estourar a cota vira erro no script" do
      stub_const("MiniRacerEngine::Limits::MAX_CALLS", 2)

      expect { run("kanban.labels(); kanban.labels(); kanban.labels();") }
        .to raise_error(MiniRacer::RuntimeError, /limit of 2 calls per run/)
    end

    it "listar todos os cards tem teto" do
      stub_const("#{described_class}::MAX_LISTED_CARDS", 1)
      create_list(:pipeline_card, 2, stage: column_a)

      expect(run("return kanban.board(params.id).cards({ allConversations: true }).length;", { id: board.id })).to eq(1)
    end

    it "com `track_caller`, os eventos dizem a linha do script" do
      linked_card
      events = []
      worker = MiniRacerEngine::Worker.new(script_session(organization: organization, chat: chat))
      worker.on_event { |name, payload| events << [ name, payload[:caller_line] ] }

      worker.perform("\nkanban.cardsForConversation();", {}, track_caller: true)

      expect(events).to include([ :find_cards_for_conversation, 2 ])
    end
  end

  describe "marcado como vindo de um gatilho" do
    it "o que o script muda não dispara outro gatilho" do
      create(:pipeline_trigger, board: board, event_type: "card_moved")
      create(:pipeline_trigger, board: board, event_type: "card_created")
      card = linked_card
      session = script_session(organization: organization, chat: chat)
      session.set(described_class::SUPPRESS_TRIGGERS_KEY, true)

      expect do
        MiniRacerEngine::Worker.new(session).perform(<<~JS, { id: card.id, board: board.id })
          kanban.card(params.id).moveTo('Em Atendimento');
          kanban.createCard(params.board, 'Novos', { title: 'Outro', linkConversation: false });
        JS
      end.not_to have_enqueued_job(Pipelines::TriggerJob)

      expect(card.reload.stage_id).to eq(column_b.id)
    end
  end

  describe "pela porta dos fluxos: Pipelines::Automation" do
    it "as operações respondem com chave símbolo, sem V8" do
      result = Pipelines::Automation.call(:create_card, board.id, column_a.id, { "title" => "Do fluxo" }, organization: organization, chat: chat)

      expect(result[:ok]).to be(true)
      expect(result[:data]).to include(title: "Do fluxo", conversation_id: chat.id.to_s, kanban_column_id: column_a.id)
    end

    it "as mesmas regras de mover" do
      card = linked_card
      create(:pipeline_stage_checklist_item, stage: column_a, title: "Coletar CPF")

      result = Pipelines::Automation.call(:move_card, card.id, column_b.id, false, organization: organization, chat: chat)

      expect(result).to eq(ok: false, error: "checklist_incomplete", pending_items: [ "Coletar CPF" ])
    end

    it "marca, atualiza, comenta e devolve not_found como as funções JS" do
      card = linked_card

      expect(Pipelines::Automation.call(:mark_won, card.id, organization: organization, chat: chat)[:data][:won_at]).to be_present
      expect(Pipelines::Automation.call(:update_card, card.id, { "title" => "Novo" }, organization: organization, chat: chat)[:data][:title]).to eq("Novo")
      expect(Pipelines::Automation.call(:get_card, SecureRandom.uuid, organization: organization, chat: chat)).to include(ok: false)

      comment = Pipelines::Automation.call(:add_comment, card.id, "Pelo fluxo", organization: organization, chat: chat)
      expect(comment[:data][:author]).to include(type: "automation", source: "flow", name: "Fluxo")
    end

    it "recusa operação fora da lista" do
      expect { Pipelines::Automation.call(:list_boards, organization: organization) }.to raise_error(ArgumentError)
    end

    it "recusa a conversa de outra organização" do
      foreign = create(:chat, organization: other_organization)

      expect { Pipelines::Automation.call(:get_card, SecureRandom.uuid, organization: organization, chat: foreign) }
        .to raise_error(MiniRacerEngine::Error)
    end
  end
end
