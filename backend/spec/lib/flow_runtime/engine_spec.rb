require "rails_helper"

RSpec.describe FlowRuntime::Engine do
  include ActiveJob::TestHelper
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector) }

  before do
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    stub_flow_channel(connector)
  end

  describe "ida e volta numa pergunta" do
    let(:flow) do
      published_flow(
        organization,
        [
          node("t", "trigger_message_received"),
          node("pergunta", "ask_question", text: "Qual é o seu nome?", save_to: "nome"),
          node("oi", "send_text", text: "Prazer, {{vars.nome}}!")
        ],
        [ edge("t", "pergunta"), edge("pergunta", "oi") ]
      )
    end

    it "pergunta, espera e segue com a resposta, sem perguntar de novo" do
      execution = run_flow(flow, chat: chat, message: "oi")

      expect(execution.reload).to have_attributes(status: "waiting_for_message", current_node_id: "pergunta")
      expect(sent_texts).to eq([ "Qual é o seu nome?" ])

      resume_flow(execution, "Fernanda")

      expect(execution.reload.status).to eq("completed")
      expect(sent_texts).to eq([ "Qual é o seu nome?", "Prazer, Fernanda!" ])
    end

    it "numera cada mensagem nova do contato, para a IA saber se já foi avaliada" do
      execution = run_flow(flow, chat: chat)
      expect(execution.reload.context["message_seq"]).to eq(0)

      resume_flow(execution, "Fernanda")
      expect(execution.reload.context["message_seq"]).to eq(1)
    end
  end

  describe "a corrida entre dois eventos da mesma conversa" do
    let(:flow) do
      published_flow(
        organization,
        [ node("t", "trigger_manual"), node("espera", "wait_for_message"), node("fim", "send_text", text: "ok") ],
        [ edge("t", "espera"), edge("espera", "fim") ]
      )
    end

    it "só quem ganha a linha executa: o segundo não roda bloco nenhum" do
      execution = run_flow(flow, chat: chat)
      token = FlowExecution.claim(execution.id, from: "waiting_for_message")
      expect(token).to be_present

      expect(resume_flow(execution, "primeira")).to be_nil
      expect(sent_texts).to be_empty
      expect(execution.reload.status).to eq("running")
    end

    it "duas threads disputando a retomada executam o bloco uma vez" do
      execution = run_flow(flow, chat: chat)
      tokens = Array.new(2) do
        Thread.new { FlowExecution.connection_pool.with_connection { FlowExecution.claim(execution.id, from: "waiting_for_message") } }
      end.map(&:value)

      expect(tokens.compact.length).to eq(1)
    end

    it "um cancelamento durante a rodada para na hora o que vinha depois" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("a", "send_text", text: "um"), node("b", "send_text", text: "dois") ],
        [ edge("t", "a"), edge("a", "b") ]
      )
      allow(FlowRuntime::Nodes::SendText).to receive(:new).and_wrap_original do |original, *arguments|
        FlowExecution.update_all(status: "cancelled") if arguments.first["id"] == "a"
        original.call(*arguments)
      end

      run_flow(flow, chat: chat)

      expect(sent_texts).to eq([ "um" ])
    end

    it "não abre uma segunda execução viva do mesmo fluxo na conversa" do
      first = run_flow(flow, chat: chat)

      expect(run_flow(flow, chat: chat)).to be_nil
      expect(first.reload).to be_active
      expect(FlowExecution.where(flow: flow, chat_id: chat.id.to_s).count).to eq(1)
    end

    it "não começa de novo pela mesma mensagem, mesmo depois de terminada" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("a", "send_text", text: "oi") ], [ edge("t", "a") ])

      described_class.start(flow: flow, chat: chat, idempotency_key: "chave")
      expect(described_class.start(flow: flow, chat: chat, idempotency_key: "chave")).to be_nil

      expect(sent_texts).to eq([ "oi" ])
    end
  end

  describe "a espera por tempo" do
    let(:flow) do
      published_flow(
        organization,
        [ node("t", "trigger_manual"), node("espera", "wait", amount: 2, unit: "hours"), node("fim", "send_text", text: "voltei") ],
        [ edge("t", "espera"), edge("espera", "fim") ]
      )
    end

    it "agenda a volta por set(wait:), com a linha já gravada" do
      execution = nil
      freeze_time do
        expect { execution = run_flow(flow, chat: chat) }.to have_enqueued_job(Flows::ResumeExecutionJob).at(2.hours.from_now)
      end

      expect(execution.reload).to have_attributes(status: "waiting", current_node_id: "fim")
      expect(execution.resume_token).to be_present
      expect(execution.resume_at).to be_within(1.second).of(2.hours.from_now)
    end

    it "retoma com o token certo e segue" do
      execution = run_flow(flow, chat: chat)

      Flows::ResumeExecutionJob.perform_now(execution.id, organization.id, { "resume_token" => execution.reload.resume_token })

      expect(execution.reload.status).to eq("completed")
      expect(sent_texts).to eq([ "voltei" ])
    end

    it "não faz nada com um token que não é mais o da execução" do
      execution = run_flow(flow, chat: chat)

      Flows::ResumeExecutionJob.perform_now(execution.id, organization.id, { "resume_token" => "antigo" })

      expect(execution.reload.status).to eq("waiting")
      expect(sent_texts).to be_empty
    end

    it "cancela em vez de falar por cima de quem assumiu a conversa" do
      execution = run_flow(flow, chat: chat)
      chat.update!(automation_enabled: false)

      Flows::ResumeExecutionJob.perform_now(execution.id, organization.id, { "resume_token" => execution.reload.resume_token })

      expect(execution.reload.status).to eq("cancelled")
      expect(sent_texts).to be_empty
    end

    it "espera sem nada depois termina, em vez de se repetir para sempre" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("espera", "wait", amount: 1, unit: "days") ], [ edge("t", "espera") ])

      expect { expect(run_flow(flow, chat: chat).reload.status).to eq("completed") }.not_to have_enqueued_job(Flows::ResumeExecutionJob)
    end
  end

  describe "os tetos" do
    it "para um círculo sem espera antes de encher o contato de mensagens" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("a", "set_variable", assignments: []), node("b", "set_variable", assignments: []) ],
        [ edge("t", "a"), edge("a", "b"), edge("b", "a") ]
      )

      execution = run_flow(flow, chat: chat).reload

      expect(execution.status).to eq("failed")
      expect(execution.error_message).to include("50")
    end

    it "falha com clareza no bloco que não existe" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("x", "bloco_inventado") ], [ edge("t", "x") ])

      execution = run_flow(flow, chat: chat).reload

      expect(execution).to have_attributes(status: "failed", error_message: a_string_including("bloco_inventado"))
    end

    it "corta o que grava no log e nas variáveis" do
      grande = "a" * 100.kilobytes
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("v", "set_variable", assignments: [ { name: "grande", value: grande } ]) ],
        [ edge("t", "v") ]
      )

      execution = run_flow(flow, chat: chat).reload

      expect(execution.variables["grande"].bytesize).to be <= FlowRuntime::Limits::MAX_VARIABLE_BYTES
      expect(log_of(execution, "v").output.to_json.bytesize).to be < FlowRuntime::Limits::MAX_LOG_BYTES + 1.kilobyte
    end
  end

  describe "o histórico" do
    it "guarda uma linha por bloco, com entrada e saída" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("a", "send_text", text: "olá") ], [ edge("t", "a") ])

      execution = run_flow(flow, chat: chat)

      expect(execution.logs.reload.map(&:node_id)).to eq([ "a" ])
      expect(log_of(execution, "a")).to have_attributes(status: "success", output: { "sent" => "olá" })
    end

    it "levanta alerta na organização quando a execução falha, e publicar resolve" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("x", "bloco_inventado") ], [ edge("t", "x") ])

      run_flow(flow, chat: chat)

      alert = organization.organization_alerts.active.for_origin("Flow", flow.id).take
      expect(alert).to have_attributes(code: "flow_execution_failed", category: "flows")
    end
  end

  describe "o processo de scripts" do
    let(:tool) { create(:tool_function, organization: organization) }
    let(:flow) do
      published_flow(
        organization,
        [
          node("t", "trigger_manual"),
          node("ferramenta", "execute_tool", tool_id: tool.id.to_s, params: { cep: "80000000" }, save_response_to: "cep"),
          node("fim", "send_text", text: "CEP {{vars.cep.cep}}")
        ],
        [ edge("t", "ferramenta"), edge("ferramenta", "fim", "success") ]
      )
    end

    it "manda o bloco de script para a fila scripts e não roda nada dele aqui" do
      execution = nil
      expect { execution = run_flow(flow, chat: chat) }.to have_enqueued_job(Flows::ScriptStepJob).on_queue("scripts")

      expect(execution.reload).to have_attributes(status: "running", current_node_id: "ferramenta")
      expect(execution.logs.reload).to be_empty
    end

    it "faz o bloco lá e volta para a fila normal, até o fim" do
      perform_enqueued_jobs { run_flow(flow, chat: chat) }

      expect(sent_texts).to eq([ "CEP 80000000" ])
      expect(FlowExecution.where(flow: flow).take.status).to eq("completed")
    end

    it "não deixa uma entrega repetida do job rodar o bloco de novo" do
      execution = run_flow(flow, chat: chat).reload
      token = execution.run_token

      perform_enqueued_jobs { Flows::ScriptStepJob.perform_now(execution.id, organization.id, token) }
      logs = execution.logs.reload.length

      Flows::ScriptStepJob.perform_now(execution.id, organization.id, token)
      expect(execution.logs.reload.length).to eq(logs)
    end
  end

  describe "os dados da conversa" do
    let(:definition) { { fields: [ { key: "produto", type: "string" }, { key: "quantidade", type: "integer" } ] } }
    let(:flow) do
      published_flow(
        organization,
        [ node("t", "trigger_manual"), node("v", "set_variable", assignments: [ { name: "produto", value: "Caneca" }, { name: "solta", value: "x" } ]) ],
        [ edge("t", "v") ],
        **definition
      )
    end

    it "grava só os campos cadastrados, por chave" do
      run_flow(flow, chat: chat)

      data = chat.reload.flow_data[flow.id.to_s]
      expect(data).to include("produto" => "Caneca")
      expect(data).not_to have_key("solta")
    end

    it "começa do que o fluxo já coletou nesta conversa" do
      chat.update!(flow_data: { flow.id.to_s => { "quantidade" => 3, "nao_cadastrado" => "x" } })

      execution = run_flow(flow, chat: chat.reload).reload

      expect(execution.variables).to include("quantidade" => 3, "produto" => "Caneca")
      expect(execution.variables).not_to have_key("nao_cadastrado")
    end
  end
end
