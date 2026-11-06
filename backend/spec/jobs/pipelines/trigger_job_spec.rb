require "rails_helper"

RSpec.describe Pipelines::TriggerJob do
  let(:organization) { create(:organization, timezone: "America/Sao_Paulo") }
  let(:owner) { create(:account, organization: organization, name: "Marina") }
  let(:board) { create(:pipeline_board, organization: organization, name: "Vendas") }
  let(:stage) { create(:pipeline_stage, board: board, name: "Novos") }
  let(:card) { create(:pipeline_card, stage: stage, title: "Atacado") }

  def perform(trigger, target = card, context = { event_type: "card_moved" })
    described_class.perform_now(trigger.id, target.id, context.to_json)
  end

  def trigger_with(*actions, **attributes)
    create(:pipeline_trigger, board: board, actions: actions, **attributes)
  end

  def last_execution
    Pipelines::TriggerExecution.order(:created_at).last
  end

  it "fica na fila padrão" do
    expect(described_class.queue_name).to eq("default")
  end

  it "não faz nada com gatilho desligado, apagado ou de outro quadro" do
    off = trigger_with({ "type" => "notify" }, active: false)
    foreign = create(:pipeline_trigger)

    expect { perform(off) }.not_to change(Pipelines::TriggerExecution, :count)
    expect { perform(foreign) }.not_to change(Pipelines::TriggerExecution, :count)
    expect { described_class.perform_now(SecureRandom.uuid, card.id, "{}") }.not_to raise_error
  end

  describe "notify" do
    before { card.update!(assigned_to: owner) }

    it "avisa o responsável e quem segue, com o caminho do card" do
      watcher = pipelines_member
      card.watchers.create!(account: watcher)

      perform(trigger_with({ "type" => "notify", "message" => "Olha o {{card.title}} em {{stage.name}}" }))

      notices = AccountNotice.where(organization_id: organization.id).to_a
      expect(notices.map(&:account_id)).to contain_exactly(owner.id, watcher.id)
      expect(notices.first).to have_attributes(
        description: "Olha o Atacado em Novos",
        url: "/pipelines/#{board.id}/board?card=#{card.id}",
        category: "general"
      )
      expect(last_execution).to have_attributes(status: "success")
    end

    it "avisa quem foi escolhido, no idioma de cada um, com o texto padrão" do
      english = create(:account, organization: organization, role: "member", locale: "en")

      perform(trigger_with({ "type" => "notify", "account_ids" => [ english.id ] }))

      notice = AccountNotice.where(account_id: english.id).take
      expect(notice.description).to eq("The card \"Atacado\" was updated on the board \"Vendas\".")
    end

    it "não avisa quem é de outra organização, nem quem perdeu o acesso" do
      stranger = create(:account)
      revoked = pipelines_member
      revoked.revoke!

      perform(trigger_with({ "type" => "notify", "account_ids" => [ stranger.id, revoked.id, "abc" ] }))

      expect(AccountNotice.where(account_id: [ stranger.id, revoked.id ]).count).to eq(0)
      expect(last_execution.status).to eq("success")
    end
  end

  describe "move_card" do
    let(:target) { create(:pipeline_stage, board: board, name: "Proposta") }

    it "move para o fim da etapa, sem conferir as travas e sem disparar outro gatilho" do
      create(:pipeline_stage_checklist_item, stage: stage)
      create(:pipeline_trigger, board: board, event_type: "card_moved", name: "Outro")
      card.update_columns(stage_entered_at: 3.days.ago)

      expect { perform(trigger_with({ "type" => "move_card", "stage_id" => target.id })) }
        .not_to have_enqueued_job(described_class)

      expect(card.reload.stage_id).to eq(target.id)
      expect(card.stage_entered_at).to be > 1.minute.ago
      expect(last_execution.status).to eq("success")
    end

    it "transmite um evento só, com o card final" do
      trigger = trigger_with({ "type" => "move_card", "stage_id" => target.id })
      card
      stream = ApplicationCable::Channel.organization_stream(organization.id, PipelineBoardChannel.full_card_stream(board))

      expect { perform(trigger) }.to have_broadcasted_to(stream).exactly(:once).with { |payload|
        expect(payload["event"]).to eq("card_updated")
        expect(payload.dig("data", "stageId")).to eq(target.id)
      }
    end

    it "falha, registrada, com etapa de outro quadro" do
      foreign = create(:pipeline_stage)

      perform(trigger_with({ "type" => "move_card", "stage_id" => foreign.id }))

      expect(card.reload.stage_id).to eq(stage.id)
      expect(last_execution).to have_attributes(status: "failure", error_message: "A etapa escolhida não existe mais.")
      expect(last_execution.executed_actions.first).to include("type" => "move_card", "status" => "failure")
    end
  end

  describe "assign_user" do
    let(:first_person) { pipelines_member }
    let(:second_person) { pipelines_member }

    it "reveza entre as pessoas" do
      trigger = trigger_with({ "type" => "assign_user", "account_ids" => [ first_person.id, second_person.id ] })

      assigned = Array.new(3) do
        target = create(:pipeline_card, stage: stage)
        perform(trigger, target)
        target.reload.assigned_to_id
      end

      expect(assigned).to eq([ first_person.id, second_person.id, first_person.id ])
    end

    it "pula quem perdeu o acesso ou só configura" do
      first_person.revoke!
      second_person
      setup_only = pipelines_member
      setup_only.update!(setup_only: true)

      perform(trigger_with({ "type" => "assign_user", "account_ids" => [ first_person.id, setup_only.id, second_person.id ] }))

      expect(card.reload.assigned_to_id).to eq(second_person.id)
    end

    it "falha, registrada, sem ninguém elegível" do
      perform(trigger_with({ "type" => "assign_user", "account_ids" => [ create(:account).id ] }))

      expect(card.reload.assigned_to_id).to be_nil
      expect(last_execution.status).to eq("failure")
    end

    it "aceita a forma antiga, um id só, conferindo a organização" do
      perform(trigger_with({ "type" => "assign_user", "account_id" => first_person.id }))

      expect(card.reload.assigned_to_id).to eq(first_person.id)
    end
  end

  describe "send_whatsapp_message" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:chat) { create(:chat, organization: organization, connector: connector) }

    before do
      allow_any_instance_of(Connector::WhatsappWeb).to receive(:send_text_message).and_return("EXT-1")
      card.update!(chat_id: chat.id.to_s, due_date: Time.utc(2026, 12, 1, 2, 0))
    end

    def sent_messages(target = chat)
      ChatMessage::Base.unscoped.where(chat_id: target.id, role: "assistant").map(&:content)
    end

    it "envia para a conversa do card, com os tokens trocados, e a data no fuso da organização" do
      perform(trigger_with({
        "type" => "send_whatsapp_message", "connector_id" => connector.id.to_s,
        "message" => "{{card.title}}, em {{board.name}}, vence em {{card.due_date}}. {{desconhecido}}"
      }))

      expect(sent_messages).to eq([ "Atacado, em Vendas, vence em 30/11/2026. {{desconhecido}}" ])
      expect(last_execution.status).to eq("success")
    end

    it "não expande de novo o token que veio dentro de um valor, nem se confunde com barra invertida" do
      card.update!(title: 'Título \0 {{card.description}}', description: "SEGREDO")

      perform(trigger_with({ "type" => "send_whatsapp_message", "connector_id" => connector.id.to_s, "message" => "{{card.title}}" }))

      expect(sent_messages).to eq([ 'Título \0 {{card.description}}' ])
    end

    it "troca os campos pela chave e pelo nome" do
      create(:pipeline_custom_field, board: board, name: "Forma de pagamento")
      card.update!(custom_field_values: { "forma_de_pagamento" => "Pix" })

      perform(trigger_with({
        "type" => "send_whatsapp_message", "connector_id" => connector.id.to_s,
        "message" => "{{card.custom_field.forma_de_pagamento}} / {{card.custom_field.Forma de pagamento}}"
      }))

      expect(sent_messages).to eq([ "Pix / Pix" ])
    end

    it "abre a conversa de um número específico, pelo Locator" do
      perform(trigger_with({
        "type" => "send_whatsapp_message", "connector_id" => connector.id.to_s, "target" => "specific",
        "specific_phone" => "+55 (31) 97181-0932", "message" => "Oi"
      }))

      created = Chat.where(organization_id: organization.id, connector_id: connector.id, external_id: "5531971810932").take
      expect(created).to be_present
      expect(sent_messages(created)).to eq([ "Oi" ])
    end

    it "falha, registrada, sem canal, com canal de outra organização e com card sem conversa" do
      foreign = create(:connector_whatsapp_web)

      perform(trigger_with({ "type" => "send_whatsapp_message", "connector_id" => foreign.id.to_s, "message" => "Oi" }))
      expect(last_execution.error_message).to eq("O canal escolhido não existe mais.")

      card.update!(chat_id: nil)
      perform(trigger_with({ "type" => "send_whatsapp_message", "connector_id" => connector.id.to_s, "message" => "Oi" }))
      expect(last_execution.error_message).to eq("Este card não tem conversa.")

      expect(sent_messages).to be_empty
    end

    it "registra a falha do provedor, sem impedir as próximas ações" do
      allow_any_instance_of(Connector::WhatsappWeb).to receive(:send_text_message).and_raise(StandardError, "Evolution fora do ar")

      perform(trigger_with(
        { "type" => "send_whatsapp_message", "connector_id" => connector.id.to_s, "message" => "Oi" },
        { "type" => "assign_user", "account_id" => owner.id }
      ))

      expect(last_execution).to have_attributes(status: "failure", error_message: "Evolution fora do ar")
      expect(last_execution.executed_actions.map { |action| action["status"] }).to eq(%w[failure success])
      expect(card.reload.assigned_to_id).to eq(owner.id)
    end
  end

  describe "send_whatsapp_template" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:chat) { create(:chat, organization: organization, connector: connector, external_id: "5531971810932") }
    let(:template) { create(:whatsapp_template, connector: connector, name: "lembrete", components: [ { "type" => "BODY", "text" => "Olá {{1}}" } ]) }
    let(:graph_url) { "https://graph.facebook.com/v19.0/#{connector.phone_number_id}/messages" }

    before { card.update!(chat_id: chat.id.to_s) }

    it "envia, trocando os tokens nos parâmetros de texto" do
      stub_request(:post, graph_url).to_return(
        status: 200, body: { messages: [ { id: "wamid.1" } ] }.to_json, headers: { "Content-Type" => "application/json" }
      )

      perform(trigger_with({
        "type" => "send_whatsapp_template", "connector_id" => connector.id.to_s,
        "whatsapp_template_id" => template.id.to_s, "template_params" => [ "{{card.title}}" ]
      }))

      expect(last_execution.status).to eq("success")
      message = ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "assistant").take
      expect(message.content).to eq("Olá Atacado")
      expect(message.status).to eq("delivery_ack")
    end

    it "registra a recusa da Meta" do
      stub_request(:post, graph_url).to_return(
        status: 400, body: { error: { code: 132_000, message: "Modelo não existe", type: "OAuthException" } }.to_json,
        headers: { "Content-Type" => "application/json" }
      )

      perform(trigger_with({
        "type" => "send_whatsapp_template", "connector_id" => connector.id.to_s, "whatsapp_template_id" => template.id.to_s
      }))

      expect(last_execution.status).to eq("failure")
      expect(last_execution.error_message).to include("O modelo não foi enviado")
    end

    it "só em canal da WABA" do
      web = create(:connector_whatsapp_web, organization: organization)

      perform(trigger_with({ "type" => "send_whatsapp_template", "connector_id" => web.id.to_s, "whatsapp_template_id" => template.id.to_s }))

      expect(last_execution.error_message).to eq("Modelo de mensagem só funciona em canal do WhatsApp Business.")
    end

    it "falha, registrada, com modelo de outro canal" do
      foreign = create(:whatsapp_template, connector: create(:connector_whatsapp_cloud, organization: organization))

      perform(trigger_with({ "type" => "send_whatsapp_template", "connector_id" => connector.id.to_s, "whatsapp_template_id" => foreign.id.to_s }))

      expect(last_execution.error_message).to eq("O modelo de mensagem escolhido não existe mais.")
    end
  end

  describe "fire_webhook" do
    let(:url) { "https://api.exemplo.test/gancho" }

    before { stub_public_dns("api.exemplo.test") }

    it "manda o contexto padrão em JSON" do
      stub = stub_request(:post, url).with { |request|
        body = JSON.parse(request.body)
        body["event_type"] == "card_moved" && body.dig("card", "title") == "Atacado" && body.dig("stage", "name") == "Novos" &&
          body.dig("board", "name") == "Vendas"
      }.to_return(status: 200, body: "ok")

      perform(trigger_with({ "type" => "fire_webhook", "url" => url }))

      expect(stub).to have_been_requested
      expect(last_execution.status).to eq("success")
      expect(last_execution.executed_actions.first).to include("statusCode" => 200)
    end

    it "troca as variáveis no modelo em JSON, escapando o valor" do
      card.update!(title: 'Pedido "urgente"')
      stub = stub_request(:post, url).with { |request|
        JSON.parse(request.body) == { "titulo" => 'Pedido "urgente"', "evento" => "card_moved", "etapa" => "Novos" }
      }.to_return(status: 200)

      perform(trigger_with({
        "type" => "fire_webhook", "url" => url,
        "body_template" => '{"titulo":"{{card.title}}","evento":"{{event}}","etapa":"{{stage.name}}"}'
      }))

      expect(stub).to have_been_requested
    end

    it "manda os cabeçalhos pedidos e o método PUT" do
      stub = stub_request(:put, url).with(headers: { "X-Chave" => "abc", "User-Agent" => "VekooPipelines/1.0" }).to_return(status: 204)

      perform(trigger_with({ "type" => "fire_webhook", "url" => url, "method" => "PUT", "headers" => { "X-Chave" => "abc" } }))

      expect(stub).to have_been_requested
    end

    it "registra resposta de erro" do
      stub_request(:post, url).to_return(status: 500)

      perform(trigger_with({ "type" => "fire_webhook", "url" => url }))

      expect(last_execution).to have_attributes(status: "failure", error_message: "O webhook falhou: 500")
    end

    it "recusa endereço interno, sem contar o motivo" do
      allow(SafeHttp).to receive(:resolve).with("interno.test").and_return([ "10.0.0.5" ])

      perform(trigger_with({ "type" => "fire_webhook", "url" => "https://interno.test/segredo" }))

      expect(last_execution.status).to eq("failure")
      expect(last_execution.error_message).to include("Esse endereço não pode receber a chamada.")
      expect(last_execution.error_message).not_to include("10.0.0.5")
    end

    it "recusa sem endereço" do
      perform(trigger_with({ "type" => "fire_webhook" }))

      expect(last_execution.error_message).to eq("O webhook está sem endereço.")
    end
  end

  describe "toggle_automation" do
    let(:chat) { create(:chat, organization: organization, automation_enabled: true) }

    before { card.update!(chat_id: chat.id.to_s) }

    it "pausa pelo período e religa" do
      perform(trigger_with({ "type" => "toggle_automation", "automation_status" => "disabled", "disable_period" => "hours", "disable_time" => 2 }))
      expect(chat.reload).to have_attributes(automation_enabled: false)
      expect(chat.automation_resume_at).to be_within(1.minute).of(2.hours.from_now)

      perform(trigger_with({ "type" => "toggle_automation", "automation_status" => "enabled" }))
      expect(chat.reload.automation_enabled).to be(true)
    end

    it "falha, registrada, em card sem conversa" do
      card.update!(chat_id: nil)

      perform(trigger_with({ "type" => "toggle_automation", "automation_status" => "enabled" }))

      expect(last_execution.status).to eq("failure")
    end
  end

  describe "create_card" do
    let(:target_board) { create(:pipeline_board, organization: organization, name: "Pós-venda") }
    let!(:target_stage) { create(:pipeline_stage, board: target_board, name: "Entrada") }

    def run_create_card(**overrides)
      perform(trigger_with({ "type" => "create_card", "target_board_id" => target_board.id, "card_title_template" => "Novo {{card.title}}" }.merge(overrides.stringify_keys)))
      Pipelines::Card.where(stage_id: target_stage.id).order(:created_at).last
    end

    it "cria no primeiro estágio do outro quadro, sem disparar gatilho do card novo" do
      create(:pipeline_trigger, board: target_board, event_type: "card_created")
      card

      new_card = nil
      expect { new_card = run_create_card }.not_to have_enqueued_job(described_class)

      expect(new_card).to have_attributes(title: "Novo Atacado", organization_id: organization.id)
      expect(last_execution.executed_actions.first).to include("cardId" => new_card.id)
    end

    it "transmite um `card_created` só, no quadro de destino, já com as etiquetas" do
      label = create(:pipeline_label, organization: organization, name: "Vip")
      card
      stream = ApplicationCable::Channel.organization_stream(organization.id, PipelineBoardChannel.full_card_stream(target_board))
      trigger = trigger_with({ "type" => "create_card", "target_board_id" => target_board.id, "card_label_ids" => [ label.id ] })

      expect { perform(trigger) }.to have_broadcasted_to(stream).exactly(:once).with { |payload|
        expect(payload["event"]).to eq("card_created")
        expect(payload.dig("data", "labels").map { |item| item["name"] }).to eq([ "Vip" ])
      }
    end

    it "preserva a formatação da descrição de origem" do
      nodes = [ { "type" => "bulletList", "content" => [] } ]
      card.update!(description_json: { "type" => "doc", "content" => nodes })

      new_card = run_create_card(card_description_template: "De {{board.name}}:\n{{card.description}}")

      expect(new_card.description_json["content"]).to eq([
        { "type" => "paragraph", "content" => [ { "type" => "text", "text" => "De Vendas:" } ] },
        { "type" => "paragraph" },
        *nodes
      ])
    end

    it "herda responsável e etiquetas" do
      label = create(:pipeline_label, organization: organization, name: "Vip")
      card.update!(assigned_to: owner)
      card.card_labels.create!(label: label)

      new_card = run_create_card(card_inherit_assigned: true, card_inherit_labels: true)

      expect(new_card.assigned_to_id).to eq(owner.id)
      expect(new_card.labels.map(&:name)).to eq([ "Vip" ])
    end

    it "aplica os modelos de campo, prioridade, prazo, valor e etiquetas de texto" do
      card.update!(deal_value: 150, company_name: "Doma", due_date: Time.zone.local(2026, 12, 1, 12))

      new_card = run_create_card(
        card_priority: "high", card_color_label: "red", card_tags: [ "vip" ],
        card_deal_value_template: "{{card.deal_value}}", card_company_name_template: "{{card.company_name}} Ltda",
        card_due_date_offset: 3,
        card_custom_field_values: { "origem" => "De {{card.title}}" }
      )

      expect(new_card).to have_attributes(priority: "high", color_label: "red", tags: [ "vip" ], deal_value: 150, company_name: "Doma Ltda")
      expect(new_card.due_date).to eq(Time.zone.local(2026, 12, 4, 12))
      expect(new_card.custom_field_values).to eq("origem" => "De Atacado")
    end

    it "não cria em quadro de outra organização, nem atribui a pessoa de fora" do
      foreign_board = create(:pipeline_board)
      create(:pipeline_stage, board: foreign_board)

      expect { perform(trigger_with({ "type" => "create_card", "target_board_id" => foreign_board.id, "card_title_template" => "X" })) }
        .not_to change(Pipelines::Card.where(stage_id: foreign_board.stages.select(:id)), :count)
      expect(last_execution.error_message).to eq("O quadro escolhido não existe mais.")

      perform(trigger_with({ "type" => "create_card", "target_board_id" => target_board.id, "card_assigned_to_id" => create(:account).id }))
      expect(last_execution.status).to eq("failure")
      expect(Pipelines::Card.where(stage_id: target_stage.id)).to be_empty
    end
  end

  describe "run_code" do
    it "enfileira na fila de scripts, sem rodar aqui" do
      trigger = trigger_with({ "type" => "run_code", "code" => "return 1;" })

      expect { perform(trigger) }.to have_enqueued_job(Pipelines::CodeRunnerJob).on_queue("scripts")
        .with(trigger.id, 0, card.id, organization.id, anything)

      expect(last_execution.executed_actions.first).to include("type" => "run_code", "enqueued" => true)
    end
  end

  describe "alertas" do
    let(:failing) { trigger_with({ "type" => "move_card", "stage_id" => SecureRandom.uuid }, name: "Mover para etapa velha") }

    it "levanta um alerta para o gatilho que falhou, sem duplicar" do
      2.times { perform(failing) }

      alerts = organization.organization_alerts.active.for_origin("PipelineTrigger", failing.id)
      expect(alerts.count).to eq(1)
      expect(alerts.take).to have_attributes(category: "pipelines", severity: "warning", code: "pipeline_trigger_failed", origin_name: "Mover para etapa velha")
      expect(alerts.take.display_message).to eq("O gatilho \"Mover para etapa velha\" falhou na última execução.")
    end

    it "resolve quando o gatilho volta a funcionar" do
      perform(failing)
      failing.update!(actions: [ { "type" => "notify" } ])

      perform(failing)

      expect(organization.organization_alerts.active.for_origin("PipelineTrigger", failing.id)).to be_empty
    end
  end

  describe "avaliação do evento" do
    let!(:card) { create(:pipeline_card, stage: stage) }

    it "não enfileira para quem não bate com a condição" do
      create(:pipeline_trigger, board: board, event_type: "card_updated", conditions: { "priority" => "high" })

      expect { card.update!(title: "Sem prioridade") }.not_to have_enqueued_job(described_class)
    end

    it "enfileira para quem bate" do
      trigger = create(:pipeline_trigger, board: board, event_type: "card_updated", conditions: { "priority" => { "operator" => "equals", "value" => "high" } })

      expect { card.update!(priority: "high") }.to have_enqueued_job(described_class).with(trigger.id, card.id, anything)
    end

    it "gatilho de etapa vale para qualquer evento do card naquela etapa, o que na origem só valia ao mover e criar" do
      here = create(:pipeline_trigger, board: board, stage: stage, event_type: "card_updated")
      create(:pipeline_trigger, board: board, stage: create(:pipeline_stage, board: board), event_type: "card_updated")

      expect { card.update!(title: "Novo título") }.to have_enqueued_job(described_class).with(here.id, card.id, anything).exactly(:once)
    end

    it "uma falha ao avaliar não vira erro para quem salvou" do
      create(:pipeline_trigger, board: board, event_type: "card_updated")
      allow(Pipelines::TriggerEvaluator).to receive(:call).and_raise(StandardError, "Redis fora")

      expect { card.update!(title: "Novo título") }.not_to raise_error
    end
  end
end
