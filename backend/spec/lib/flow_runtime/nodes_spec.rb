require "rails_helper"

# Cada bloco, rodando de verdade no motor, numa conversa de verdade: só o provedor é WebMock.
RSpec.describe "Blocos de fluxo" do
  include ActiveJob::TestHelper
  include ScriptEngineHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, user_name: "Fernanda Lima", external_id: "5531971810932") }
  let(:other_organization) { create(:organization) }

  before do
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    stub_flow_channel(connector)
  end

  # O bloco sozinho, com as saídas ligadas a blocos de fim que dizem por onde saiu.
  def run_block(type, data = {}, handles: [], message: nil, variables: {})
    nodes = [ node("t", "trigger_manual"), node("b", type, data) ]
    edges = [ edge("t", "b") ]
    handles.each do |handle|
      nodes << node("saida_#{handle || 'padrao'}", "set_variable", assignments: [ { name: "saiu_por", value: (handle || "padrao").to_s } ])
      edges << edge("b", "saida_#{handle || 'padrao'}", handle)
    end

    run_flow(published_flow(organization, nodes, edges), chat: chat, message: message, variables: variables).reload
  end

  describe "gatilhos" do
    FlowRuntime::NodeRegistry::CATALOG["trigger"].each_key do |type|
      it "#{type} só passa adiante" do
        flow = published_flow(organization, [ node("t", type), node("a", "send_text", text: "oi") ], [ edge("t", "a") ])

        expect(run_flow(flow, chat: chat).reload.status).to eq("completed")
        expect(sent_texts).to eq([ "oi" ])
      end

      it "#{type} sozinho, sem nada ligado, termina" do
        expect(run_flow(published_flow(organization, [ node("t", type) ]), chat: chat).reload.status).to eq("completed")
      end
    end
  end

  describe "send_text" do
    it "troca as variáveis e envia" do
      run_block("send_text", { text: "Oi, {{contact.name}}! {{vars.cupom}} {{message.text}} {{chat.status}}" }, message: "preço?", variables: { cupom: "DOMA10" })

      expect(sent_texts).to eq([ "Oi, Fernanda Lima! DOMA10 preço? open" ])
    end

    it "não envia texto vazio" do
      execution = run_block("send_text", { text: "{{vars.nada}}" })

      expect(sent_texts).to be_empty
      expect(log_of(execution, "b").output).to eq("skipped" => "empty")
    end

    it "para a execução, com o motivo, se o canal levanta" do
      stub_request(:post, %r{/message/sendText/}).to_return(status: 500, body: "{}")

      execution = run_block("send_text", { text: "oi" })

      expect(execution.status).to eq("failed")
      expect(organization.organization_alerts.active.for_code("flow_execution_failed")).to exist
    end

    it "não tem canal para falar quando a conversa não tem conector" do
      chat_sem_canal = create(:chat, organization: organization)
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("b", "send_text", text: "oi") ], [ edge("t", "b") ])

      execution = run_flow(flow, chat: chat_sem_canal).reload

      expect(execution).to have_attributes(status: "failed", error_message: I18n.t("automation.flows.errors.no_connector"))
    end
  end

  describe "send_media" do
    before do
      stub_request(:post, %r{/message/sendMedia/}).to_return(status: 201, body: { key: { id: "M1" } }.to_json, headers: { "Content-Type" => "application/json" })
    end

    it "envia um anexo da organização" do
      attachment = create(:attachment, organization: organization)

      execution = run_block("send_media", { attachment_id: attachment.id, caption: "Tabela de {{contact.name}}" })

      message = ChatMessage::Media.where(chat_id: chat.id).take
      expect(message).to have_attributes(attachment_id: attachment.id.to_s, caption: "Tabela de Fernanda Lima", media_type: "document")
      expect(log_of(execution, "b").output).to eq("status" => "sent")
    end

    it "não alcança anexo de outra organização" do
      attachment = create(:attachment, organization: other_organization)

      execution = run_block("send_media", { attachment_id: attachment.id })

      expect(ChatMessage::Media.where(chat_id: chat.id)).not_to exist
      expect(log_of(execution, "b").output).to eq("skipped" => "no_attachment")
    end

    it "envia o que está numa URL, como a imagem que veio do catálogo" do
      run_block("send_media", { media_url: "{{vars.foto}}", media_type: "image" }, variables: { foto: "https://cdn.exemplo.test/caneca.png" })

      expect(ChatMessage::Media.where(chat_id: chat.id).take).to have_attributes(media_type: "image")
    end

    it "sem nada para enviar, passa adiante" do
      expect(log_of(run_block("send_media"), "b").output).to eq("skipped" => "no_attachment")
    end
  end

  describe "send_template" do
    let(:cloud) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:cloud_chat) { create(:chat, connector: cloud, external_id: "5531971810000") }

    it "não faz nada em canal sem modelo" do
      expect(log_of(run_block("send_template", { template_name: "pedido" }), "b").output).to eq("skipped" => "no_connector_support")
    end

    it "envia o modelo pelo nome, com os parâmetros" do
      template = create(:whatsapp_template, connector: cloud, name: "pedido_saiu")
      allow(Chats::SendTemplate).to receive(:call).and_return(instance_double(ChatMessage::Text, status: "delivery_ack", status_message: nil))
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("b", "send_template", template_name: "pedido_saiu", parameters: [ "{{contact.name}}" ]) ],
        [ edge("t", "b") ]
      )

      run_flow(flow, chat: cloud_chat)

      expect(Chats::SendTemplate).to have_received(:call).with(hash_including(
        template: template,
        components: [ { "type" => "body", "parameters" => [ { "type" => "text", "text" => "Maria Souza" } ] } ],
        attributes: { flow_id: flow.id }
      ))
    end
  end

  describe "send_interactive" do
    let(:buttons) { [ { id: "sim", title: "Quero sim" }, { id: "nao", title: "Agora não" } ] }
    let(:flow) do
      published_flow(
        organization,
        [
          node("t", "trigger_manual"),
          node("b", "send_interactive", text: "Posso reservar?", buttons: buttons, save_to: "resposta"),
          node("a", "send_text", text: "Reservado!"),
          node("c", "send_text", text: "Tudo bem.")
        ],
        [ edge("t", "b"), edge("b", "a", "sim"), edge("b", "c", "nao") ]
      )
    end

    it "manda as opções numeradas e espera" do
      execution = run_flow(flow, chat: chat).reload

      expect(execution.status).to eq("waiting_for_message")
      expect(sent_texts).to eq([ "Posso reservar?\n1. Quero sim\n2. Agora não" ])
    end

    it "sai pelo botão escolhido, pelo número" do
      execution = run_flow(flow, chat: chat)
      resume_flow(execution, "2")

      expect(sent_texts.last).to eq("Tudo bem.")
      expect(execution.reload.variables).to include("resposta" => "nao", "last_choice" => "nao")
    end

    it "sai pelo botão escolhido, pelo título, sem ligar para caixa nem acento" do
      execution = run_flow(flow, chat: chat)
      resume_flow(execution, "agora NAO")

      expect(sent_texts.last).to eq("Tudo bem.")
    end

    it "pergunta de novo o que não entendeu, se houver texto para isso" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("b", "send_interactive", text: "Posso?", buttons: buttons, invalid_text: "Não entendi."), node("a", "send_text", text: "ok") ],
        [ edge("t", "b"), edge("b", "a", "sim") ]
      )
      execution = run_flow(flow, chat: chat)

      resume_flow(execution, "talvez")
      expect(sent_texts.last).to eq("Não entendi.")
      expect(execution.reload.status).to eq("waiting_for_message")

      resume_flow(execution, "1")
      expect(sent_texts.last).to eq("ok")
    end
  end

  describe "ask_question" do
    it "guarda a resposta em save_to" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("b", "ask_question", text: "Nome?", save_to: "nome") ], [ edge("t", "b") ])
      execution = run_flow(flow, chat: chat)

      resume_flow(execution, "Fernanda")

      expect(execution.reload).to have_attributes(status: "completed", variables: hash_including("nome" => "Fernanda"))
      expect(sent_texts).to eq([ "Nome?" ])
    end
  end

  describe "wait_for_message" do
    it "suspende e segue com a próxima mensagem" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("b", "wait_for_message", save_to: "texto"), node("a", "send_text", text: "Você disse {{vars.texto}}") ],
        [ edge("t", "b"), edge("b", "a") ]
      )
      execution = run_flow(flow, chat: chat)
      expect(execution.reload).to have_attributes(status: "waiting_for_message", current_node_id: "b")

      resume_flow(execution, "bom dia")

      expect(sent_texts).to eq([ "Você disse bom dia" ])
    end

    it "não confunde a mensagem que disparou o fluxo com a resposta" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("b", "wait_for_message"), node("a", "send_text", text: "ok") ], [ edge("t", "b"), edge("b", "a") ])

      expect(run_flow(flow, chat: chat, message: "oi").reload.status).to eq("waiting_for_message")
      expect(sent_texts).to be_empty
    end
  end

  describe "condition" do
    def rule(field, operator, value = nil, values: nil)
      { field: field, operator: operator, value: value, values: values }.compact
    end

    {
      "equals" => [ "vip", "vip", "outro" ],
      "not_equals" => [ "vip", "outro", "vip" ],
      "contains" => [ "cliente vip", "vip", "gold" ],
      "not_contains" => [ "cliente", "vip", "cli" ],
      "starts_with" => [ "vip ouro", "vip", "ouro" ],
      "ends_with" => [ "vip ouro", "ouro", "vip" ],
      "greater_than" => [ "10", "5", "50" ],
      "less_than" => [ "5", "10", "1" ]
    }.each do |operator, (left, matching, failing)|
      it "#{operator} escolhe true e false" do
        result = run_block("condition", { rules: [ rule("vars.x", operator, matching) ] }, handles: %w[true false], variables: { x: left })
        expect(result.variables["saiu_por"]).to eq("true")

        result = run_block("condition", { rules: [ rule("vars.x", operator, failing) ] }, handles: %w[true false], variables: { x: left })
        expect(result.variables["saiu_por"]).to eq("false")
      end
    end

    it "is_empty, is_not_empty, exists e not_exists" do
      expect(run_block("condition", { rules: [ rule("vars.x", "is_empty") ] }, handles: %w[true false], variables: { x: " " }).variables["saiu_por"]).to eq("true")
      expect(run_block("condition", { rules: [ rule("vars.x", "is_not_empty") ] }, handles: %w[true false], variables: { x: "a" }).variables["saiu_por"]).to eq("true")
      expect(run_block("condition", { rules: [ rule("vars.x", "exists") ] }, handles: %w[true false], variables: { x: "a" }).variables["saiu_por"]).to eq("true")
      expect(run_block("condition", { rules: [ rule("vars.y", "not_exists") ] }, handles: %w[true false]).variables["saiu_por"]).to eq("true")
    end

    it "in e not_in" do
      expect(run_block("condition", { rules: [ rule("vars.x", "in", values: %w[a b]) ] }, handles: %w[true false], variables: { x: "a" }).variables["saiu_por"]).to eq("true")
      expect(run_block("condition", { rules: [ rule("vars.x", "not_in", values: %w[a b]) ] }, handles: %w[true false], variables: { x: "c" }).variables["saiu_por"]).to eq("true")
    end

    it "any basta uma, all precisa de todas" do
      rules = [ rule("vars.x", "equals", "a"), rule("vars.x", "equals", "b") ]

      expect(run_block("condition", { rules: rules, match: "any" }, handles: %w[true false], variables: { x: "a" }).variables["saiu_por"]).to eq("true")
      expect(run_block("condition", { rules: rules, match: "all" }, handles: %w[true false], variables: { x: "a" }).variables["saiu_por"]).to eq("false")
    end

    it "lê a mensagem do contato" do
      result = run_block("condition", { rules: [ rule("message.text", "contains", "preço") ] }, handles: %w[true false], message: "qual o preço?")

      expect(result.variables["saiu_por"]).to eq("true")
    end
  end

  describe "switch" do
    it "sai pelo caso que casa, e pelo default sem nenhum" do
      cases = [ { id: "a", value: "1" }, { id: "b", value: "2" } ]

      expect(run_block("switch", { field: "{{vars.x}}", cases: cases }, handles: %w[a b default], variables: { x: "2" }).variables["saiu_por"]).to eq("b")
      expect(run_block("switch", { field: "{{vars.x}}", cases: cases }, handles: %w[a b default], variables: { x: "3" }).variables["saiu_por"]).to eq("default")
    end
  end

  describe "wait" do
    it "sem tempo, segue direto" do
      expect(run_block("wait", { amount: 0, unit: "minutes" }, handles: [ nil ]).variables["saiu_por"]).to eq("padrao")
    end

    it "com tempo, fica esperando no bloco seguinte" do
      expect(run_block("wait", { amount: 5, unit: "minutes" }, handles: [ nil ])).to have_attributes(status: "waiting", current_node_id: "saida_padrao")
    end
  end

  describe "set_variable" do
    it "guarda o valor com as variáveis trocadas" do
      expect(run_block("set_variable", { assignments: [ { name: "saudacao", value: "Oi {{contact.name}}" }, { name: "", value: "x" } ] }).variables).to eq("saudacao" => "Oi Fernanda Lima")
    end
  end

  describe "loop" do
    let(:flow) do
      published_flow(
        organization,
        [
          node("t", "trigger_manual"),
          node("l", "loop", source: "{{vars.nomes}}", loop_variable: "nome", index_variable: "i"),
          node("corpo", "send_text", text: "{{vars.i}}: {{vars.nome}}"),
          node("fim", "send_text", text: "acabou")
        ],
        [ edge("t", "l"), edge("l", "corpo", "each"), edge("corpo", "l"), edge("l", "fim", "done") ]
      )
    end

    it "passa pelo corpo uma vez para cada item, e segue por done" do
      execution = run_flow(flow, chat: chat, variables: { nomes: %w[Ana Bia Caio] }).reload

      expect(execution.status).to eq("completed")
      expect(sent_texts).to eq([ "0: Ana", "1: Bia", "2: Caio", "acabou" ])
    end

    it "lista vazia vai direto para done" do
      run_flow(flow, chat: chat, variables: { nomes: [] })

      expect(sent_texts).to eq([ "acabou" ])
    end

    it "uma lista maior que o teto de passos por rodada termina" do
      execution = run_flow(flow, chat: chat, variables: { nomes: Array.new(60) { |index| "n#{index}" } }).reload

      expect(execution.status).to eq("completed")
      expect(sent_texts.length).to eq(61)
    end

    it "respeita o máximo de voltas" do
      flow_curto = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("l", "loop", source: "nomes", max_iterations: 1), node("corpo", "send_text", text: "{{vars.item}}") ],
        [ edge("t", "l"), edge("l", "corpo", "each"), edge("corpo", "l") ]
      )

      run_flow(flow_curto, chat: chat, variables: { nomes: %w[Ana Bia] })

      expect(sent_texts).to eq([ "Ana" ])
    end
  end

  describe "add_tag e remove_tag" do
    let!(:tag) { ChatTag.create!(name: "vip", color: "#000000", organization_id: organization.id.to_s) }

    it "aplica pelo id, uma vez" do
      run_block("add_tag", { tag_id: tag.id.to_s })
      run_block("add_tag", { tag_id: tag.id.to_s })

      expect(chat.reload.chat_tag_ids).to eq([ tag.id ])
    end

    it "aplica pelo nome, criando se preciso" do
      run_block("add_tag", { tag_name: "Quer Orçamento" })

      expect(ChatTag.where(organization_id: organization.id.to_s, name: "quer-orcamento")).to exist
      expect(chat.reload.chat_tag_ids.length).to eq(1)
    end

    it "não alcança etiqueta de outra organização" do
      alheia = ChatTag.create!(name: "alheia", color: "#000000", organization_id: other_organization.id.to_s)

      execution = run_block("add_tag", { tag_id: alheia.id.to_s })

      expect(chat.reload.chat_tag_ids).to be_empty
      expect(log_of(execution, "b").output).to eq("skipped" => "tag_not_found")
    end

    it "sem id, passa adiante" do
      expect(log_of(run_block("add_tag"), "b").output).to eq("skipped" => "no_tag_id")
    end

    it "remove pelo id e pelo nome" do
      chat.add_to_set(chat_tag_ids: tag.id)
      run_block("remove_tag", { tag_id: tag.id.to_s })
      expect(chat.reload.chat_tag_ids).to be_empty

      chat.add_to_set(chat_tag_ids: tag.id)
      run_block("remove_tag", { tag_name: "vip" })
      expect(chat.reload.chat_tag_ids).to be_empty
    end
  end

  describe "set_custom_attribute" do
    it "grava no campo do contato, com a chave saneada" do
      run_block("set_custom_attribute", { key: "Cor Preferida!", value: "{{vars.cor}}" }, variables: { cor: "azul" })

      expect(chat.reload.custom_attributes).to eq("cor_preferida" => "azul")
    end

    it "sem chave, passa adiante" do
      expect(log_of(run_block("set_custom_attribute", { value: "x" }), "b").output).to eq("skipped" => "no_key")
    end
  end

  describe "assign_agent" do
    let(:account) { create(:account, organization: organization) }

    it "atribui a pessoa escolhida" do
      run_block("assign_agent", { account_id: account.id })

      expect(chat.reload.assigned_account_id).to eq(account.id)
    end

    it "sorteia no grupo, sem sair da organização" do
      alheia = create(:account, organization: other_organization)

      run_block("assign_agent", { account_pool: [ account.id, alheia.id ] })

      expect(chat.reload.assigned_account_id).to eq(account.id)
    end

    it "não atribui pessoa de outra organização nem revogada" do
      alheia = create(:account, organization: other_organization)

      expect(log_of(run_block("assign_agent", { account_id: alheia.id }), "b").output).to eq("skipped" => "no_account")
      expect(chat.reload.assigned_account_id).to be_nil
    end
  end

  describe "assign_team" do
    it "atribui o departamento da organização, e não o de outra" do
      team = create(:team, organization: organization)
      alheio = create(:team, organization: other_organization)

      expect(log_of(run_block("assign_team", { team_id: alheio.id }), "b").output).to eq("skipped" => "team_not_found")
      expect(chat.reload.team_id).to be_nil

      run_block("assign_team", { team_id: team.id })
      expect(chat.reload.team_id).to eq(team.id)
    end
  end

  describe "transfer_to_human" do
    it "pausa a automação e passa para o departamento" do
      team = create(:team, organization: organization)

      run_block("transfer_to_human", { team_id: team.id })

      expect(chat.reload).to have_attributes(automation_enabled: false, team_id: team.id)
    end

    it "dispara os fluxos de transferência" do
      published_flow(organization, [ node("t", "trigger_human_handoff") ], [], trigger_type: "human_handoff")

      expect { run_block("transfer_to_human") }.to have_enqueued_job(Flows::EventDispatchJob).with(chat.id.to_s, organization.id.to_s, "human_handoff", "")
    end
  end

  describe "finalize_chat" do
    it "fecha a conversa e termina" do
      execution = run_block("finalize_chat")

      expect(chat.reload.status).to eq("closed")
      expect(execution.status).to eq("completed")
    end
  end

  describe "pause_automation e resume_automation" do
    it "pausa sem volta quando não há período" do
      run_block("pause_automation")

      expect(chat.reload).to have_attributes(automation_enabled: false, automation_resume_at: nil)
    end

    it "pausa por um período" do
      expect { run_block("pause_automation", { period: "hours", amount: 2 }) }.to have_enqueued_job(EnableContactJob)

      expect(chat.reload.automation_resume_at).to be_within(1.minute).of(2.hours.from_now)
    end

    it "retoma" do
      chat.update!(automation_enabled: false)

      run_block("resume_automation")

      expect(chat.reload.automation_enabled).to be(true)
    end

    it "ignora ação desconhecida" do
      expect(log_of(run_block("pause_automation", { action: "outra" }), "b").output).to eq("skipped" => "invalid_action")
    end
  end

  describe "set_funnel_stage" do
    let(:funnel) { create(:funnel, organization: organization) }
    let(:stage) { funnel.stages.second }

    def alert_of(execution)
      organization.organization_alerts.active.for_origin("Flow", execution.flow_id).for_code("flow_funnel_stage_missing").take
    end

    it "move a conversa só naquele funil, e avisa a lista" do
      other = create(:funnel, organization: organization)
      chat.place_in_funnel!(other.id, other.stages.first.id)

      execution = run_block("set_funnel_stage", { funnel_id: funnel.id, stage_id: stage.id })

      fresh = Chat.scoped(organization.id, chat.id)
      expect(fresh.funnel_stage_id(funnel.id)).to eq(stage.id)
      expect(fresh.funnel_stage_id(other.id)).to eq(other.stages.first.id)
      expect(log_of(execution, "b").output).to eq("funnel_id" => funnel.id, "stage_id" => stage.id, "moved" => true)
    end

    it "aceita a etapa em variável" do
      run_block("set_funnel_stage", { funnel_id: funnel.id, stage_id: "{{vars.etapa}}" }, variables: { "etapa" => stage.id })

      expect(Chat.scoped(organization.id, chat.id).funnel_stage_id(funnel.id)).to eq(stage.id)
    end

    it "passar de novo não move nem avisa" do
      chat.place_in_funnel!(funnel.id, stage.id)

      expect(log_of(run_block("set_funnel_stage", { funnel_id: funnel.id, stage_id: stage.id }), "b").output).to include("moved" => false)
    end

    it "etapa de outro funil não entra: fica no log, alerta e o fluxo segue" do
      alheia = create(:funnel, organization: organization).stages.first

      execution = run_block("set_funnel_stage", { funnel_id: funnel.id, stage_id: alheia.id }, handles: [ nil ])

      expect(execution).to have_attributes(status: "completed")
      expect(execution.context["variables"]["saiu_por"]).to eq("padrao")
      expect(log_of(execution, "b").output).to eq("skipped" => "funnel_stage_not_found")
      expect(Chat.scoped(organization.id, chat.id).funnel_stage_id(funnel.id)).to be_nil
      expect(alert_of(execution).message).to include(execution.flow.name)
    end

    it "funil de outra organização é como se não existisse" do
      alheio = create(:funnel, organization: create(:organization))

      execution = run_block("set_funnel_stage", { funnel_id: alheio.id, stage_id: alheio.stages.first.id })

      expect(log_of(execution, "b").output).to eq("skipped" => "funnel_stage_not_found")
      expect(Chat.scoped(organization.id, chat.id).funnel_stages.to_h).to be_empty
    end

    it "funil apagado e id que nem é id não derrubam o fluxo" do
      funnel_id = funnel.id
      stage_id = stage.id
      funnel.destroy!

      expect(run_block("set_funnel_stage", { funnel_id: funnel_id, stage_id: stage_id })).to have_attributes(status: "completed")
      expect(run_block("set_funnel_stage", { funnel_id: "a.b", stage_id: "c" })).to have_attributes(status: "completed")
    end

    it "sem funil ou etapa, só registra" do
      expect(log_of(run_block("set_funnel_stage", { funnel_id: funnel.id, stage_id: "{{vars.nada}}" }), "b").output).to eq("skipped" => "no_funnel_stage")
    end

    it "publicar de novo resolve o alerta" do
      execution = run_block("set_funnel_stage", { funnel_id: SecureRandom.uuid, stage_id: SecureRandom.uuid })

      expect(alert_of(execution)).to be_present

      OrganizationAlertService.flow_resolved(organization, execution.flow)

      expect(alert_of(execution)).to be_nil
    end
  end

  describe "http_request" do
    before { stub_public_dns("api.exemplo.test") }

    it "sai por success, guarda a resposta e não grava a credencial no histórico" do
      stub_request(:post, "https://api.exemplo.test/pedidos")
        .with(body: { nome: "Fernanda Lima" }.to_json, headers: { "Authorization" => "Bearer segredo", "Content-Type" => "application/json" })
        .to_return(status: 200, body: { pedido: 7 }.to_json, headers: { "Content-Type" => "application/json" })

      execution = run_block(
        "http_request",
        { url: "https://api.exemplo.test/pedidos", method: "POST", save_response_to: "resposta",
          headers: [ { key: "Authorization", value: "Bearer segredo" } ], body: { nome: "{{contact.name}}" } },
        handles: %w[success error]
      )

      expect(execution.variables).to include("saiu_por" => "success", "resposta" => { "pedido" => 7 }, "last_http_status" => 200)
      expect(log_of(execution, "b").input["headers"]).to eq("Authorization" => "[FILTERED]")
    end

    it "um 500 sai por error" do
      stub_request(:get, "https://api.exemplo.test/x").to_return(status: 500, body: "ops")

      execution = run_block("http_request", { url: "https://api.exemplo.test/x" }, handles: %w[success error])

      expect(execution.variables).to include("saiu_por" => "error", "last_http_status" => 500)
    end

    it "não alcança a rede interna" do
      stub_public_dns("interno.exemplo.test", ip: "169.254.169.254")

      execution = run_block("http_request", { url: "http://interno.exemplo.test/latest/meta-data" }, handles: %w[success error])

      expect(execution.variables["saiu_por"]).to eq("error")
      expect(log_of(execution, "b").output).to eq("error" => "destination_not_allowed")
      expect(a_request(:any, /interno/)).not_to have_been_made
    end

    it "não alcança endereço interno direto, nem por variável do contato" do
      execution = run_block("http_request", { url: "http://{{vars.host}}:6379/" }, handles: %w[success error], variables: { host: "127.0.0.1" })

      expect(execution.variables["saiu_por"]).to eq("error")
    end

    it "URL vazia e método desconhecido saem por error" do
      expect(log_of(run_block("http_request", {}, handles: %w[error]), "b").output).to eq("error" => "invalid_url")
      expect(log_of(run_block("http_request", { url: "https://api.exemplo.test", method: "LOAD" }, handles: %w[error]), "b").output).to eq("error" => "invalid_method")
    end

    it "um tempo esgotado sai por error" do
      stub_request(:get, "https://api.exemplo.test/lento").to_timeout

      expect(run_block("http_request", { url: "https://api.exemplo.test/lento" }, handles: %w[success error]).variables["saiu_por"]).to eq("error")
    end
  end

  describe "execute_tool" do
    def run_tool(data, **options)
      execution = nil
      perform_enqueued_jobs { execution = run_block("execute_tool", data, **options) }
      execution.reload
    end

    it "roda a função com os parâmetros e guarda a resposta" do
      tool = create(:tool_function, organization: organization, js_code: "return { saudacao: 'oi ' + params.nome, contato: getContactInfo().name };")

      execution = run_tool({ tool_id: tool.id.to_s, params: { nome: "{{contact.name}}" }, save_response_to: "r" }, handles: %w[success error])

      expect(execution.variables).to include("saiu_por" => "success", "r" => { "saudacao" => "oi Fernanda Lima", "contato" => "Fernanda Lima" })
    end

    it "um erro do script sai por error" do
      tool = create(:tool_function, organization: organization, js_code: "throw new Error('faltou o CPF');")

      execution = run_tool({ tool_id: tool.id.to_s }, handles: %w[success error])

      expect(execution.variables["saiu_por"]).to eq("error")
      expect(log_of(execution, "b").output["error"]).to include("faltou o CPF")
    end

    it "não alcança função de outra organização" do
      tool = create(:tool_function, organization: other_organization)

      expect(log_of(run_tool({ tool_id: tool.id.to_s }, handles: %w[error]), "b").output).to eq("error" => "tool_not_found")
    end

    it "não roda função de ferramenta desligada, e passa a credencial da ligada" do
      installation = create(:tool_installation, organization: organization)
      installation.credentials = { "api_key" => "segredo" }
      installation.save!
      tool = create(:tool_function, organization: organization, tool_installation_id: installation.id.to_s, js_code: "return credentials.api_key;")

      expect(run_tool({ tool_id: tool.id.to_s, save_response_to: "r" }).variables["r"]).to eq("segredo")

      installation.update!(enabled: false)
      expect(log_of(run_tool({ tool_id: tool.id.to_s }), "b").output).to eq("error" => "tool_not_found")
    end

    it "sem função escolhida, sai por error" do
      expect(log_of(run_tool({}, handles: %w[error]), "b").output).to eq("error" => "no_tool_id")
    end
  end

  describe "goto_flow" do
    let(:target) do
      published_flow(organization, [ node("t", "trigger_manual"), node("v", "set_variable", assignments: [ { name: "de_la", value: "ok" } ]) ], [ edge("t", "v") ])
    end

    it "roda o outro fluxo e traz o que ele guardou" do
      execution = run_block("goto_flow", { target_flow_id: target.id, merge_variables: true })

      expect(execution.status).to eq("completed")
      expect(execution.variables).to include("de_la" => "ok")
      expect(FlowExecution.where(flow: target).take.status).to eq("completed")
    end

    it "não alcança fluxo de outra organização" do
      alheio = published_flow(other_organization, [ node("t", "trigger_manual") ])

      expect(log_of(run_block("goto_flow", { target_flow_id: alheio.id }), "b").output).to eq("skipped" => "flow_not_found")
      expect(FlowExecution.where(flow: alheio)).not_to exist
    end

    it "um fluxo que chama a si mesmo não entra em círculo" do
      flow = create(:flow, organization: organization)
      version = flow.versions.create!(
        version_number: 1,
        definition: { "nodes" => [ node("t", "trigger_manual"), node("b", "goto_flow", target_flow_id: flow.id) ], "edges" => [ edge("t", "b") ] }
      )
      flow.update!(status: "published", published_version: version)

      execution = run_flow(flow, chat: chat).reload

      expect(execution.status).to eq("completed")
      expect(log_of(execution, "b").output).to eq("skipped" => "already_running")
    end
  end

  describe "catalog_search" do
    before do
      create(:product_item, organization: organization, title: "Caneca de Cerâmica Artesanal", external_id: "CAN-1")
      create(:product_item, organization: other_organization, title: "Caneca de outra loja", external_id: "CAN-2")
    end

    it "guarda o que achou, só da organização, e sai por found" do
      execution = run_block("catalog_search", { query: "caneca", save_to: "produtos" }, handles: %w[found not_found])

      expect(execution.variables["saiu_por"]).to eq("found")
      expect(execution.variables["produtos"].pluck("sku")).to eq([ "CAN-1" ])
      expect(execution.variables["produtos_total"]).to eq(1)
    end

    it "sem query, busca pela mensagem do contato" do
      execution = run_block("catalog_search", {}, handles: %w[found not_found], message: "tem caneca?")

      expect(execution.variables["catalog_results"].pluck("sku")).to eq([ "CAN-1" ])
    end

    it "sem resultado, sai por not_found" do
      expect(run_block("catalog_search", { query: "bicicleta" }, handles: %w[found not_found]).variables["saiu_por"]).to eq("not_found")
    end
  end

  describe "end" do
    it "termina, mesmo com bloco ligado depois" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("e", "end"), node("a", "send_text", text: "nunca") ], [ edge("t", "e"), edge("e", "a") ])

      expect(run_flow(flow, chat: chat).reload.status).to eq("completed")
      expect(sent_texts).to be_empty
    end
  end

  describe "blocos de Pipelines (ainda não ligados)" do
    FlowRuntime::NodeRegistry::CATALOG["pipeline"].each_key do |type|
      it "#{type} para a execução com um erro claro" do
        execution = run_block(type, { title: "x" })

        expect(execution).to have_attributes(status: "failed", error_message: "Pipelines ainda não disponível")
      end

      it "#{type} segue por onError, quando ligado" do
        execution = run_block(type, { title: "x" }, handles: %w[onError])

        expect(execution.status).to eq("completed")
        expect(execution.variables).to include("saiu_por" => "onError", "pipeline_error" => "Pipelines ainda não disponível")
      end
    end

    it "traduz o erro" do
      I18n.with_locale(:en) do
        expect(FlowRuntime::Nodes::KanbanBase.humanize_error(error: "pipelines_unavailable")).to eq("Pipelines not available yet")
      end
    end
  end
end
