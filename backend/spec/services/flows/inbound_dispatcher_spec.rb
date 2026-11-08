require "rails_helper"

RSpec.describe Flows::InboundDispatcher do
  include ActiveJob::TestHelper
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector) }

  before do
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    stub_flow_channel(connector)
  end

  def say(text, event: "message_received", message_id: SecureRandom.hex(4))
    described_class.call(chat: chat, text: text, event: event, message_id: message_id)
  end

  def message_flow(trigger: "message_received", text: "respondi", **extra)
    published_flow(
      organization,
      [ node("t", "trigger_#{trigger}", extra), node("a", "send_text", text: text) ],
      [ edge("t", "a") ],
      trigger_type: trigger
    )
  end

  def run_debounce
    Flows::DebouncedDispatchJob.perform_now(chat.id.to_s, organization.id.to_s)
  end

  # Passa o tempo do debounce e roda o que ele agendou, até o fim.
  def settle
    travel 10.seconds
    perform_enqueued_jobs { run_debounce }
  end

  describe "o caminho rápido" do
    it "a organização sem fluxo nem chega a tocar na caixa" do
      expect { say("oi") }.not_to have_enqueued_job

      expect(chat.reload.flow_inbox).to be_nil
    end

    it "responde false sem conversa" do
      expect(described_class.call(chat: nil, text: "oi")).to be(false)
    end
  end

  describe "o debounce" do
    before { message_flow }

    it "a primeira mensagem agenda um job, e as seguintes só empurram o prazo" do
      freeze_time do
        expect { say("oi") }.to have_enqueued_job(Flows::DebouncedDispatchJob).at(3.seconds.from_now).once
        expect { say("tudo bem?"); say("queria um orçamento") }.not_to have_enqueued_job
      end

      expect(chat.reload.flow_inbox.pluck("text")).to eq([ "oi", "tudo bem?", "queria um orçamento" ])
    end

    it "uma resposta só, com as mensagens juntas" do
      say("oi")
      say("tudo bem?")

      settle

      expect(sent_texts).to eq([ "respondi" ])
      expect(chat.reload).to have_attributes(flow_inbox: nil, flow_inbox_deadline: nil)
    end

    it "a rajada sai na ordem em que o contato mandou, mesmo chegando fora de ordem" do
      echo = published_flow(organization, [ node("t", "trigger_message_received"), node("a", "send_text", text: "{{message.text}}") ], [ edge("t", "a") ], trigger_type: "message_received")
      Flow.where.not(id: echo.id).update_all(status: "archived")
      sent = 1.minute.ago.change(usec: 0)

      described_class.call(chat: chat, text: "três", message_id: "m3", sent_at: sent + 2.seconds)
      described_class.call(chat: chat, text: "uma", message_id: "m1", sent_at: sent)
      described_class.call(chat: chat, text: "duas", message_id: "m2", sent_at: sent + 1.second)
      settle

      expect(sent_texts).to eq([ "uma\nduas\ntrês" ])
      expect(FlowExecution.where(flow: echo).take.context["last_message_id"]).to be_nil
    end

    it "o job que acorda antes do prazo se reagenda, sem nascer outro" do
      freeze_time do
        say("oi")
        travel 1.second
        say("mais uma") # empurra o prazo

        expect { run_debounce }.to have_enqueued_job(Flows::DebouncedDispatchJob).at(3.seconds.from_now).once
        expect(chat.reload.flow_inbox.length).to eq(2)
      end
    end

    describe "com o contato digitando" do
      include InboundHelpers

      def contact_is(presence)
        Inbound::EvolutionEvents.new(
          webhook_payload(event: "presence.update", data: { id: "#{chat.external_id}@s.whatsapp.net", presences: { "#{chat.external_id}@s.whatsapp.net" => { lastKnownPresence: presence } } }),
          connector: connector
        ).call
      end

      %w[composing recording].each do |presence|
        it "#{presence} segura a resposta: o que a Evolution avisou é o que o debounce lê" do
          say("oi")
          travel 4.seconds
          contact_is(presence)

          expect { run_debounce }.to have_enqueued_job(Flows::DebouncedDispatchJob)
          expect(chat.reload.flow_inbox.length).to eq(1)
          expect(sent_texts).to be_empty
        end
      end

      %w[paused available].each do |presence|
        it "#{presence} não segura" do
          say("oi")
          travel 4.seconds
          contact_is(presence)

          perform_enqueued_jobs { run_debounce }

          expect(sent_texts).to eq([ "respondi" ])
        end
      end

      it "digitando sem parar ainda tem resposta, porque a espera tem teto" do
        say("oi")
        travel 4.seconds
        contact_is("composing")
        run_debounce

        travel Flows::DebouncedDispatchJob::MAX_HOLD + 1.second
        contact_is("composing")
        perform_enqueued_jobs { run_debounce }

        expect(sent_texts).to eq([ "respondi" ])
      end

      it "o aviso que venceu não segura: o de parou pode nunca chegar" do
        say("oi")
        contact_is("composing")
        travel 11.seconds

        perform_enqueued_jobs { run_debounce }

        expect(sent_texts).to eq([ "respondi" ])
      end
    end

    it "duas mensagens simultâneas: nenhuma se perde" do
      threads = Array.new(5) { |index| Thread.new { say("m#{index}") } }
      threads.each(&:join)

      expect(chat.reload.flow_inbox.pluck("text")).to match_array(%w[m0 m1 m2 m3 m4])
    end

    it "uma rajada não incha o documento" do
      (described_class::MAX_INBOX + 5).times { |index| say("m#{index}") }

      expect(chat.reload.flow_inbox.length).to eq(described_class::MAX_INBOX)
    end

    it "a conversa de teste não vira contato nem transferência" do
      published_flow(organization, [ node("t", "trigger_human_handoff") ], [], trigger_type: "human_handoff")
      test_chat = create(:chat, organization: organization, external_id: Chat::TEST_EXTERNAL_ID)

      expect { test_chat.pause_automation_for_human! }.not_to have_enqueued_job(Flows::EventDispatchJob)
    end

    it "a pessoa que assumiu no meio-tempo leva a caixa junto" do
      say("oi")
      chat.update!(automation_enabled: false)
      travel 5.seconds

      expect { run_debounce }.not_to have_enqueued_job(Flows::StartExecutionJob)
      expect(chat.reload.flow_inbox).to be_nil
    end

    it "o prazo pode ser ajustado por organização, e zero é sem espera" do
      organization.update!(settings: organization.settings.merge("flow_debounce_seconds" => 0))

      expect { say("oi") }.to have_enqueued_job(Flows::DebouncedDispatchJob).with(chat.id.to_s, organization.id.to_s)
    end

    it "se o job agendado sumiu, a próxima mensagem agenda outro" do
      chat.set(flow_inbox: [ { "text" => "antiga" } ], flow_inbox_deadline: 10.minutes.ago)

      expect { say("nova") }.to have_enqueued_job(Flows::DebouncedDispatchJob)
    end

    it "um job repetido não encontra nada para fazer" do
      say("oi")
      settle

      expect { run_debounce }.not_to have_enqueued_job
    end
  end

  describe "a corrida com uma execução rodando" do
    it "a mensagem espera na caixa, e o fim da rodada a entrega" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_message_received"), node("espera", "wait_for_message"), node("a", "send_text", text: "recebi") ],
        [ edge("t", "espera"), edge("espera", "a") ],
        trigger_type: "message_received"
      )
      execution = run_flow(flow, chat: chat)
      token = FlowExecution.claim(execution.id, from: "waiting_for_message")

      say("cheguei")
      travel 5.seconds
      expect { run_debounce }.not_to have_enqueued_job(Flows::ResumeExecutionJob)
      expect(chat.reload.flow_inbox.length).to eq(1)

      # A rodada acaba suspensa: é ela quem chama a caixa.
      execution.reload.update!(status: "waiting_for_message", run_token: nil, context: execution.context.merge("node_state" => { "espera" => { "waiting" => true } }))
      expect(token).to be_present
      expect { described_class.flush(execution) }.to have_enqueued_job(Flows::DebouncedDispatchJob)

      # O job da caixa, e depois a retomada que ele enfileira.
      2.times { perform_enqueued_jobs }

      expect(sent_texts).to eq([ "recebi" ])
    end

    it "o motor chama a caixa ao terminar a rodada" do
      flow = message_flow

      say("durante")
      expect { run_flow(flow, chat: chat) }.to have_enqueued_job(Flows::DebouncedDispatchJob)
    end
  end

  describe "retomar quem espera" do
    let(:flow) do
      published_flow(
        organization,
        [ node("t", "trigger_message_received"), node("p", "ask_question", text: "Nome?", save_to: "nome"), node("a", "send_text", text: "Oi {{vars.nome}}") ],
        [ edge("t", "p"), edge("p", "a") ],
        trigger_type: "message_received"
      )
    end

    it "a resposta vai para a execução que esperava, e não abre outra" do
      flow
      say("oi")
      settle
      expect(sent_texts).to eq([ "Nome?" ])

      say("Fernanda")
      settle

      expect(sent_texts).to eq([ "Nome?", "Oi Fernanda" ])
      expect(FlowExecution.where(flow: flow).count).to eq(1)
    end

    it "duas mensagens em sequência respondem uma só pergunta" do
      flow
      say("oi")
      settle

      say("Fernanda")
      say("Lima")
      settle

      expect(sent_texts).to eq([ "Nome?", "Oi Fernanda\nLima" ])
    end

    it "não mexe em execução de outra conversa" do
      flow
      other = create(:chat, connector: connector)
      execution = run_flow(flow, chat: other)

      say("oi")
      settle

      expect(execution.reload.status).to eq("waiting_for_message")
    end
  end

  describe "quais fluxos começam" do
    it "primeira mensagem só na primeira" do
      message_flow(trigger: "first_message")

      say("segunda vez")
      settle
      expect(sent_texts).to be_empty

      say("primeira", event: "first_message")
      settle
      expect(sent_texts).to eq([ "respondi" ])
    end

    it "mensagem recebida também vale na primeira" do
      message_flow

      say("primeira", event: "first_message")
      settle

      expect(sent_texts).to eq([ "respondi" ])
    end

    it "palavra-chave confere a palavra, sem ligar para caixa e acento" do
      message_flow(trigger: "keyword", keywords: [ "orçamento", "pix" ])

      say("só queria dar oi, gostei do pixel")
      settle
      expect(sent_texts).to be_empty

      say("Quero um ORCAMENTO")
      settle
      expect(sent_texts).to eq([ "respondi" ])
    end

    it "só os publicados" do
      create(:flow, organization: organization, trigger_type: "message_received", status: "draft")
      message_flow

      say("oi")
      settle

      expect(FlowExecution.pluck(:flow_id).uniq.length).to eq(1)
    end

    it "respeita o filtro de canais" do
      flow = message_flow
      flow.update!(connector_filter: { "connector_ids" => [ "outro-canal" ] })

      say("oi")
      settle
      expect(sent_texts).to be_empty

      flow.update!(connector_filter: { "connector_ids" => [ connector.id.to_s ] })
      say("oi de novo")
      settle
      expect(sent_texts).to eq([ "respondi" ])
    end

    it "não começa fluxo de outra organização" do
      other = create(:organization)
      message_flow(text: "minha")
      published_flow(other, [ node("t", "trigger_message_received"), node("a", "send_text", text: "de outra") ], [ edge("t", "a") ], trigger_type: "message_received")

      say("oi")
      settle

      expect(sent_texts).to eq([ "minha" ])
    end

    it "a mesma mensagem entregue duas vezes não começa duas vezes" do
      flow = message_flow

      2.times { perform_enqueued_jobs { Flows::Dispatch.call(chat: chat, text: "oi", event: "message_received", message_id: "EXT-1") } }

      expect(FlowExecution.where(flow: flow).count).to eq(1)
      expect(sent_texts).to eq([ "respondi" ])
    end
  end

  describe "campanhas" do
    let(:outreach_flow) { message_flow(trigger: "manual", text: "fluxo da campanha") }

    it "quem respondeu a uma campanha é atendido pelo fluxo dela, e só por ele" do
      message_flow(text: "fluxo comum")
      chat.set(outreach_flow_id: outreach_flow.id)

      say("oi")
      settle

      expect(sent_texts).to eq([ "fluxo da campanha" ])
    end

    it "fluxo de outra organização é o mesmo que não ter fluxo" do
      alheio = published_flow(create(:organization), [ node("t", "trigger_manual"), node("a", "send_text", text: "alheio") ], [ edge("t", "a") ])
      message_flow(text: "fluxo comum")
      chat.set(outreach_flow_id: alheio.id)

      say("oi")
      settle

      expect(sent_texts).to eq([ "fluxo comum" ])
    end

    it "fluxo em rascunho ou inexistente também" do
      message_flow(text: "fluxo comum")
      chat.set(outreach_flow_id: create(:flow, organization: organization).id)

      say("oi")
      settle
      expect(sent_texts).to eq([ "fluxo comum" ])

      chat.set(outreach_flow_id: SecureRandom.uuid)
      say("oi de novo")
      settle
      expect(sent_texts).to eq([ "fluxo comum", "fluxo comum" ])
    end

    it "basta ter o fluxo de campanha para valer a pena abrir a caixa" do
      chat.set(outreach_flow_id: outreach_flow.id)

      expect { say("oi") }.to have_enqueued_job(Flows::DebouncedDispatchJob)
    end
  end

  describe "Outreach::AvailableFlows" do
    it "lista só os publicados da organização, em ordem de nome" do
      b = published_flow(organization, [ node("t", "trigger_manual") ]).tap { |flow| flow.update!(name: "B") }
      a = published_flow(organization, [ node("t", "trigger_manual") ]).tap { |flow| flow.update!(name: "A") }
      create(:flow, organization: organization, name: "Rascunho")
      published_flow(create(:organization), [ node("t", "trigger_manual") ])

      expect(Outreach::AvailableFlows.for(organization)).to eq([ { id: a.id, name: "A" }, { id: b.id, name: "B" } ])
    end
  end

  describe "contato criado" do
    before { published_flow(organization, [ node("t", "trigger_contact_created"), node("a", "send_text", text: "bem-vindo") ], [ edge("t", "a") ], trigger_type: "contact_created") }

    it "dispara ao criar a conversa, e uma vez só" do
      expect { create(:chat, connector: connector) }.to have_enqueued_job(Flows::EventDispatchJob).once
    end

    it "roda o fluxo, com o evento" do
      new_chat = nil
      perform_enqueued_jobs { new_chat = create(:chat, connector: connector) }

      expect(sent_texts).to eq([ "bem-vindo" ])
      expect(FlowExecution.for_chat(organization.id, new_chat.id).take.context["event"]).to eq("contact_created")
    end

    it "não dispara em carga em lote, nem na conversa de teste, nem com automação desligada" do
      expect { create(:chat, connector: connector, ignore_events: true) }.not_to have_enqueued_job(Flows::EventDispatchJob)
      expect { create(:chat, connector: connector, external_id: Chat::TEST_EXTERNAL_ID) }.not_to have_enqueued_job(Flows::EventDispatchJob)
      expect { create(:chat, connector: connector, automation_enabled: false) }.not_to have_enqueued_job(Flows::EventDispatchJob)
    end

    it "não dispara em organização sem esse fluxo" do
      other = create(:connector_whatsapp_web, organization: create(:organization))

      expect { create(:chat, connector: other) }.not_to have_enqueued_job(Flows::EventDispatchJob)
    end

    it "não derruba quem cria a conversa" do
      allow(Flows::InboundDispatcher).to receive(:call).and_raise("fora do ar")

      expect { create(:chat, connector: connector) }.not_to raise_error
    end
  end

  describe "transferência humana" do
    before { published_flow(organization, [ node("t", "trigger_human_handoff"), node("a", "add_tag", tag_name: "transferido") ], [ edge("t", "a") ], trigger_type: "human_handoff") }

    it "dispara quando a pessoa assume, uma vez só, na virada" do
      expect { chat.pause_automation_for_human! }.to have_enqueued_job(Flows::EventDispatchJob).with(chat.id.to_s, organization.id.to_s, "human_handoff", "").once
      expect { chat.pause_automation_for_human! }.not_to have_enqueued_job(Flows::EventDispatchJob)
    end

    it "roda com a automação pausada, que é justamente quando ela existe" do
      perform_enqueued_jobs { chat.pause_automation_for_human! }

      expect(chat.reload.automation_enabled).to be(false)
      expect(chat.chat_tags.map(&:name)).to eq([ "transferido" ])
    end

    it "um fluxo de transferência que transfere não entra em círculo" do
      other = create(:chat, connector: connector)
      published_flow(organization, [ node("t", "trigger_human_handoff"), node("a", "transfer_to_human") ], [ edge("t", "a") ], trigger_type: "human_handoff")

      perform_enqueued_jobs { other.pause_automation_for_human! }

      expect(FlowExecution.for_chat(organization.id, other.id).count).to eq(2)
    end

    it "o interruptor da organização desliga" do
      organization.update_automation_settings!(automation_enabled: false)

      expect { perform_enqueued_jobs { chat.pause_automation_for_human! } }.not_to(change { FlowExecution.count })
    end

    it "falha ao disparar não impede a pessoa de assumir nem o contato de nascer" do
      allow(Flows::EventDispatchJob).to receive(:perform_later).and_raise(RedisClient::CannotConnectError)

      expect { chat.pause_automation_for_human! }.not_to raise_error

      expect(chat.reload.automation_enabled).to be(false)
    end
  end

  describe "limpar o contexto" do
    it "encerra o que estava esperando resposta" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("p", "wait_for_message") ], [ edge("t", "p") ])
      execution = run_flow(flow, chat: chat)

      chat.clear_context!

      expect(execution.reload.status).to eq("cancelled")
    end
  end

  describe "de ponta a ponta, pelo webhook de entrada" do
    include InboundHelpers

    let(:flow) { message_flow(text: "Olá! Sou o fluxo.") }

    def evolution_message(id, text)
      {
        event: "messages.upsert",
        data: {
          key: { remoteJid: "5531971810932@s.whatsapp.net", id: id, fromMe: false },
          message: { conversation: text },
          pushName: "Fernanda"
        }
      }
    end

    it "a mensagem que chega pela Evolution dispara o fluxo publicado" do
      flow

      perform_enqueued_jobs(except: Flows::DebouncedDispatchJob) do
        Inbound::EvolutionEvents.new(webhook_payload(evolution_message("EXT-1", "oi")), connector: connector).call
      end

      new_chat = Chats::Locator.find(connector: connector, phone: "5531971810932")
      expect(new_chat.flow_inbox.pluck("text")).to eq([ "oi" ])

      travel 5.seconds
      perform_enqueued_jobs { Flows::DebouncedDispatchJob.perform_now(new_chat.id.to_s, organization.id.to_s) }

      expect(sent_texts).to eq([ "Olá! Sou o fluxo." ])
    end
  end
end
