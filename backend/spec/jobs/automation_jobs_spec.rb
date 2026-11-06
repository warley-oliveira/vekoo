require "rails_helper"

RSpec.describe "Jobs de automação" do
  include ActiveJob::TestHelper
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:flow) { create(:flow, organization: organization) }

  describe "as filas" do
    it "quem roda script de cliente está na fila scripts, sem nova tentativa" do
      expect(Flows::ScriptStepJob.new.queue_name).to eq("scripts")
      expect(Tools::TestRunJob.new.queue_name).to eq("scripts")
      expect(Hooks::CodeRunnerJob.new.queue_name).to eq("scripts")
    end

    it "quem não roda script fica nas filas normais" do
      expect(Flows::StartExecutionJob.new.queue_name).to eq("default")
      expect(Flows::ResumeExecutionJob.new.queue_name).to eq("default")
      expect(Hooks::ProcessRequestJob.new.queue_name).to eq("default")
      expect(Flows::PruneExecutionsJob.new.queue_name).to eq("low")
    end

    it "os recorrentes estão no agendamento" do
      schedule = YAML.load_file(Rails.root.join("config/schedule/automation.yml"))

      expect(schedule.values.pluck("class")).to match_array(%w[Flows::SweepStaleExecutionsJob Flows::PruneExecutionsJob Hooks::PruneLogsJob])
      schedule.each_value { |entry| expect(entry["class"].constantize).to be < ApplicationJob }
    end

    it "um script que levanta não volta para a fila, e a execução para com o motivo" do
      execution = create(:flow_execution, flow: flow, status: "running", run_token: "t")
      allow(FlowRuntime::Engine).to receive(:new).and_raise("explodiu")

      expect { Flows::ScriptStepJob.perform_now(execution.id, organization.id, "t") }.not_to raise_error

      expect(enqueued_jobs).to be_empty
      expect(execution.reload).to have_attributes(status: "failed", error_message: "explodiu")
    end
  end

  describe Flows::StartExecutionJob do
    let(:chat) { create(:chat, organization: organization) }
    let(:published) { published_flow(organization, [ node("t", "trigger_manual"), node("v", "set_variable", assignments: [ { name: "x", value: "1" } ]) ], [ edge("t", "v") ]) }

    it "começa o fluxo" do
      described_class.perform_now(published.id, organization.id, chat.id.to_s)

      expect(FlowExecution.for_chat(organization.id, chat.id).take.status).to eq("completed")
    end

    it "não alcança fluxo de outra organização" do
      described_class.perform_now(published.id, create(:organization).id, chat.id.to_s)

      expect(FlowExecution.count).to eq(0)
    end

    it "não alcança conversa de outra organização" do
      alheia = create(:chat, organization: create(:organization))

      described_class.perform_now(published.id, organization.id, alheia.id.to_s)

      expect(FlowExecution.count).to eq(0)
    end
  end

  describe Flows::ResumeExecutionJob do
    let(:published) { published_flow(organization, [ node("t", "trigger_manual"), node("p", "wait_for_message", save_to: "fala") ], [ edge("t", "p") ]) }
    let(:chat) { create(:chat, organization: organization) }

    it "não alcança execução de outra organização" do
      execution = run_flow(published, chat: chat)

      described_class.perform_now(execution.id, create(:organization).id, { "message" => { "content" => "oi" } })

      expect(execution.reload.status).to eq("waiting_for_message")
    end

    it "não faz nada na terminada" do
      execution = create(:flow_execution, flow: flow, status: "completed")

      expect(FlowRuntime::Engine).not_to receive(:resume)
      described_class.perform_now(execution.id, organization.id, { "message" => { "content" => "oi" } })
    end

    it "duas entregas da mesma mensagem: a segunda não acha o que retomar" do
      execution = run_flow(published, chat: chat)

      2.times { described_class.perform_now(execution.id, organization.id, { "message" => { "content" => "oi" } }) }

      expect(execution.reload.status).to eq("completed")
      expect(execution.logs.where(node_id: "p").count).to eq(2)
    end

    it "a mensagem que perde a corrida para outra rodada volta para a caixa" do
      execution = run_flow(published, chat: chat)
      FlowExecution.claim(execution.id, from: "waiting_for_message")

      expect do
        described_class.perform_now(execution.id, organization.id, { "message" => { "content" => "cheguei tarde", "message_id" => "EXT-9" } })
      end.to have_enqueued_job(Flows::DebouncedDispatchJob)

      expect(chat.reload.flow_inbox.pluck("text")).to eq([ "cheguei tarde" ])
    end

    it "a entrega repetida da mesma mensagem não vale como resposta nova" do
      flow_two = published_flow(organization, [ node("t", "trigger_manual"), node("a", "wait_for_message", save_to: "um"), node("b", "wait_for_message", save_to: "dois") ], [ edge("t", "a"), edge("a", "b") ])
      execution = run_flow(flow_two, chat: chat)

      2.times { described_class.perform_now(execution.id, organization.id, { "message" => { "content" => "oi", "message_id" => "EXT-1" } }) }

      expect(execution.reload.variables).to include("um" => "oi")
      expect(execution.variables).not_to have_key("dois")
      expect(execution.current_node_id).to eq("b")
    end

    it "a volta do processo de scripts só vale com o mesmo dono" do
      execution = create(:flow_execution, flow: flow, status: "running", run_token: "certo", current_node_id: "x")

      expect(FlowRuntime::Engine).not_to receive(:new)
      described_class.perform_now(execution.id, organization.id, { "run_token" => "outro" })
    end
  end

  describe Flows::SweepStaleExecutionsJob do
    let(:chat) { create(:chat, organization: organization) }

    it "dá por interrompida a execução parada no meio de um bloco, sem repetir nada, e avisa" do
      parada = create(:flow_execution, flow: flow, chat_id: chat.id.to_s, status: "running", run_token: "t", locked_at: 20.minutes.ago)
      andando = create(:flow_execution, flow: create(:flow, organization: organization), status: "running", run_token: "u", locked_at: 1.minute.ago)

      described_class.perform_now

      expect(parada.reload).to have_attributes(status: "failed", error_message: I18n.t("automation.flows.errors.interrupted"))
      expect(andando.reload.status).to eq("running")
      expect(organization.organization_alerts.active.for_origin("Flow", flow.id).for_code("flow_execution_failed")).to exist
    end

    it "entrega o que estava na caixa da conversa" do
      create(:flow_execution, flow: flow, chat_id: chat.id.to_s, status: "running", run_token: "t", locked_at: 20.minutes.ago)
      chat.set(flow_inbox: [ { "text" => "oi" } ], flow_inbox_deadline: 20.minutes.ago)

      expect { described_class.perform_now }.to have_enqueued_job(Flows::DebouncedDispatchJob)
    end

    it "reagenda a espera vencida cujo job sumiu, com o mesmo token" do
      atrasada = create(:flow_execution, flow: flow, status: "waiting", resume_token: "tk", resume_at: 1.hour.ago)
      create(:flow_execution, flow: create(:flow, organization: organization), status: "waiting", resume_token: "tk2", resume_at: 1.hour.from_now)

      expect { described_class.perform_now }.to have_enqueued_job(Flows::ResumeExecutionJob).with(atrasada.id, organization.id, { "resume_token" => "tk" }).once
    end

    it "não avisa a organização do teste do editor" do
      create(:flow_execution, flow: flow, status: "running", run_token: "t", locked_at: 20.minutes.ago, playground: true)

      described_class.perform_now

      expect(organization.organization_alerts.active).not_to exist
    end
  end

  describe Flows::PruneExecutionsJob do
    it "apaga o histórico vencido, com os logs, e deixa o resto" do
      old = create(:flow_execution, flow: flow, status: "completed", completed_at: 31.days.ago)
      log = old.logs.create!(node_id: "a", node_type: "send_text", status: "success", executed_at: 31.days.ago)
      recent = create(:flow_execution, flow: flow, status: "completed", completed_at: 1.day.ago)

      described_class.perform_now

      expect(FlowExecution.exists?(old.id)).to be(false)
      expect(FlowExecutionLog.exists?(log.id)).to be(false)
      expect(FlowExecution.exists?(recent.id)).to be(true)
    end

    it "apaga os testes do editor em um dia" do
      teste = create(:flow_execution, flow: flow, status: "pending", playground: true)
      teste.update_columns(updated_at: 2.days.ago)

      described_class.perform_now

      expect(FlowExecution.exists?(teste.id)).to be(false)
    end

    it "encerra a pergunta sem resposta há tempo demais" do
      parada = create(:flow_execution, flow: flow, status: "waiting_for_message", chat_id: "c1")
      parada.update_columns(updated_at: 31.days.ago)

      described_class.perform_now

      expect(parada.reload.status).to eq("cancelled")
    end

    it "corta os logs antigos de uma execução que continua viva" do
      viva = create(:flow_execution, flow: flow, status: "waiting_for_message", chat_id: "c1")
      velho = viva.logs.create!(node_id: "a", node_type: "send_text", status: "success", executed_at: 40.days.ago)
      novo = viva.logs.create!(node_id: "b", node_type: "send_text", status: "success", executed_at: 1.day.ago)

      described_class.perform_now

      expect(FlowExecutionLog.exists?(velho.id)).to be(false)
      expect(FlowExecutionLog.exists?(novo.id)).to be(true)
    end

    it "corta as versões antigas, sem tocar nas que estão em uso nem na publicada" do
      versions = Array.new(described_class::VERSIONS_KEPT + 3) { |index| create(:flow_version, flow: flow, version_number: index + 1) }
      in_use = versions.first
      published = versions.second
      create(:flow_execution, flow: flow, flow_version: in_use, status: "running")
      flow.update!(published_version: published)

      described_class.perform_now

      expect(FlowVersion.exists?(in_use.id)).to be(true)
      expect(FlowVersion.exists?(published.id)).to be(true)
      expect(FlowVersion.exists?(versions.third.id)).to be(false)
      expect(flow.versions.count).to eq(described_class::VERSIONS_KEPT + 2)
    end
  end

  describe Hooks::PruneLogsJob do
    it "deixa só os mais novos de cada webhook, na mesma organização" do
      stub_const("HookLog::MAX_PER_HOOK", 2)
      hook = create(:hook, organization: organization)
      oldest = create(:hook_log, hook_id: hook.id, organization_id: organization.id, created_at: 3.days.ago)
      middle = create(:hook_log, hook_id: hook.id, organization_id: organization.id, created_at: 2.days.ago)
      newest = create(:hook_log, hook_id: hook.id, organization_id: organization.id, created_at: 1.day.ago)
      other = create(:hook_log, hook_id: "outro", organization_id: organization.id, created_at: 5.days.ago)

      described_class.perform_now

      expect(HookLog.where(:_id.in => [ oldest.id, middle.id, newest.id, other.id ]).pluck(:_id)).to match_array([ middle.id, newest.id, other.id ])
    end
  end

  describe Tools::TestRunJob do
    it "guarda o resultado para a tela, com os eventos" do
      tool = create(:tool_function, organization: organization, js_code: "console.log('oi'); return params.a;")
      id = Tools::TestRuns.start(organization.id.to_s, tool.id.to_s)

      described_class.perform_now(organization.id.to_s, tool.id.to_s, id, { "a" => 1 })

      run = Tools::TestRuns.read(organization.id.to_s, tool.id.to_s, id)
      expect(run).to include("status" => "done", "response" => 1)
      expect(run["events"].first).to include("name" => "console_log")
      expect(run["durationMs"]).to be_a(Integer)
    end

    it "um resultado enorme perde o corpo, mas não o status" do
      id = Tools::TestRuns.start(organization.id.to_s, "t")

      Tools::TestRuns.finish(organization.id.to_s, "t", id, { "status" => "done", "response" => "a" * (Tools::TestRuns::MAX_BYTES + 1) })

      run = Tools::TestRuns.read(organization.id.to_s, "t", id)
      expect(run["status"]).to eq("done")
      expect(run["response"].bytesize).to be <= Tools::TestRuns::MAX_BYTES
    end

    it "não alcança a conversa de outra organização" do
      tool = create(:tool_function, organization: organization, js_code: "return getContactInfo();")
      alheia = create(:chat, organization: create(:organization))
      id = Tools::TestRuns.start(organization.id.to_s, tool.id.to_s)

      described_class.perform_now(organization.id.to_s, tool.id.to_s, id, {}, alheia.id.to_s)

      expect(Tools::TestRuns.read(organization.id.to_s, tool.id.to_s, id)).to include("status" => "failed", "error" => a_string_including("No chat"))
    end
  end

  describe Ai::Chat, "#respond" do
    let(:messages) { instance_double("Anthropic::Resources::Messages") }
    let(:beta_messages) { instance_double("Anthropic::Resources::Beta::Messages") }
    let(:client) { instance_double("Anthropic::Client", messages: messages, beta: instance_double("Anthropic::Resources::Beta", messages: beta_messages)) }
    let(:reply) { FlowHelpers::FakeMessage.new(stop_reason: :end_turn, content: [ FlowHelpers::FakeText.new("oi") ]) }

    it "no modelo rápido, chamada normal, sem temperatura e com o esquema pedido" do
      allow(messages).to receive(:create).and_return(reply)

      described_class.new(client: client).respond(
        system: "s", messages: [ { role: "user", content: "x" } ], schema: { "type" => "object" }, model: described_class::FAST_MODEL, effort: "low"
      )

      expect(messages).to have_received(:create).with(hash_including(
        model: described_class::FAST_MODEL,
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: { type: :json_schema, schema: { "type" => "object" } } }
      ))
      expect(messages).not_to have_received(:create).with(hash_including(:temperature))
    end

    it "no modelo principal, com a virada de modelo em caso de recusa" do
      allow(beta_messages).to receive(:create).and_return(reply)

      described_class.new(client: client).respond(system: "s", messages: [], tools: [ { name: "t" } ], context: "agora")

      expect(beta_messages).to have_received(:create).with(hash_including(
        model: described_class::AGENT_MODEL,
        betas: [ described_class::FALLBACK_BETA ],
        fallbacks: :default,
        tools: [ { name: "t" } ],
        system_: [ { type: "text", text: "s", cache_control: { type: "ephemeral" } }, { type: "text", text: "agora" } ]
      ))
    end

    it "recusa vira Failed" do
      allow(messages).to receive(:create).and_return(FlowHelpers::FakeMessage.new(stop_reason: :refusal, content: []))

      expect { described_class.new(client: client).respond(system: "s", messages: [], model: described_class::FAST_MODEL) }
        .to raise_error(described_class::Failed, "refusal")
    end

    it "erro de conexão vira Failed" do
      allow(messages).to receive(:create).and_raise(Anthropic::Errors::APIConnectionError.new(url: "x", request: nil))

      expect { described_class.new(client: client).respond(system: "s", messages: [], model: described_class::FAST_MODEL) }
        .to raise_error(described_class::Failed)
    end
  end
end
