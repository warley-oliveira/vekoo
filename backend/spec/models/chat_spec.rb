require "rails_helper"

RSpec.describe Chat do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization) }

  def stream(name, org = organization)
    ApplicationCable::Channel.organization_stream(org.id, name)
  end

  def notes(type = nil)
    scope = ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "base")
    type ? scope.where(role_base_type: type) : scope
  end

  describe "#display_name" do
    def build_chat(**attributes)
      build(:chat, organization: organization, **attributes)
    end

    it "aceita um texto" do
      expect(build_chat(display_name: "Maria").display_name).to eq("Maria")
    end

    it "aceita em branco" do
      expect(build_chat(display_name: "")).to be_valid
    end

    it "aceita nil" do
      expect(build_chat(display_name: nil)).to be_valid
    end

    it "recusa mais de 120 caracteres" do
      record = build_chat(display_name: "x" * 121)

      expect(record).not_to be_valid
      expect(record.errors[:display_name]).to be_present
    end

    it "aceita até 120 caracteres" do
      expect(build_chat(display_name: "x" * 120)).to be_valid
    end

    it "sai no serializer da conversa" do
      expect(ChatSerializer.one(create(:chat, organization: organization, display_name: "Maria"))).to include(displayName: "Maria")
    end
  end

  describe "validações" do
    it "exige a organização" do
      record = described_class.new

      expect(record).not_to be_valid
      expect(record.errors[:organization_id]).to be_present
    end

    it "recusa status fora da lista" do
      expect(build(:chat, organization: organization, status: "arquivada")).not_to be_valid
    end

    it "nasce aberta, com a automação ligada" do
      expect(described_class.new).to have_attributes(status: "open", automation_enabled: true, unread_messages: 0)
    end
  end

  describe ".scoped" do
    it "acha a conversa dentro da organização" do
      expect(described_class.scoped(organization.id, chat.id)).to eq(chat)
    end

    it "não alcança a conversa de outra organização" do
      expect(described_class.scoped(create(:organization).id, chat.id)).to be_nil
    end

    it "devolve nil para um id que não existe" do
      expect(described_class.scoped(organization.id, BSON::ObjectId.new.to_s)).to be_nil
    end

    it "devolve nil para um id malformado" do
      expect(described_class.scoped(organization.id, "nao-e-um-id")).to be_nil
    end
  end

  describe "escopos" do
    it ".valid_records tira a conversa de teste" do
      probe = create(:chat, organization: organization, external_id: Chat::TEST_EXTERNAL_ID)

      expect(described_class.for_organization(organization.id).valid_records.to_a).not_to include(probe)
    end

    it ".for_organization só traz as da organização" do
      own = create(:chat, organization: organization)
      create(:chat, organization: create(:organization))

      expect(described_class.for_organization(organization.id).to_a).to eq([ own ])
    end

    it ".within_range é fechado no início e aberto no fim" do
      inside = create(:chat, organization: organization, created_at: Time.utc(2026, 11, 2, 12))
      create(:chat, organization: organization, created_at: Time.utc(2026, 11, 3))

      expect(described_class.within_range([ Time.utc(2026, 11, 2), Time.utc(2026, 11, 3) ]).to_a).to eq([ inside ])
    end
  end

  describe "#organization" do
    it "carrega a organização da conversa" do
      expect(chat.organization).to eq(organization)
    end

    it "não quebra quando a organização não existe mais" do
      expect(build(:chat, organization_id: SecureRandom.uuid).organization).to be_nil
    end
  end

  describe "#phone_number" do
    it "tira o sufixo do JID" do
      expect(build(:chat, organization: organization, external_id: "553183794137@s.whatsapp.net").phone_number).to eq("553183794137")
    end

    it "devolve o número como está quando não há sufixo" do
      expect(build(:chat, organization: organization, external_id: "553183794137").phone_number).to eq("553183794137")
    end

    it "não quebra sem external_id" do
      expect(build(:chat, organization: organization, external_id: nil).phone_number).to be_nil
    end
  end

  describe "audiência" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:other_connector) { create(:connector_whatsapp_cloud, organization: organization) }

    it "cria uma audiência com o nome do contato" do
      expect(create(:chat, connector: connector, user_name: "Joana").audience.user_name).to eq("Joana")
    end

    it "reusa a audiência do mesmo número em outro conector da organização" do
      first = create(:chat, connector: connector, external_id: "5531971810932")
      second = create(:chat, connector: other_connector, external_id: "5531971810932")

      expect(second.audience_id).to eq(first.audience_id)
    end

    it "não reusa a audiência de outra organização" do
      first = create(:chat, connector: connector, external_id: "5531971810932")
      second = create(:chat, organization: create(:organization), external_id: "5531971810932")

      expect(second.audience_id).not_to eq(first.audience_id)
    end

    it "mantém a audiência informada" do
      audience = Audience.create!(user_name: "Quem veio antes")

      expect(create(:chat, organization: organization, audience: audience).audience).to eq(audience)
    end

    it "aponta de volta para as conversas" do
      expect(chat.audience.chats.to_a).to eq([ chat ])
    end
  end

  describe "#dispatch_event!" do
    before { chat }

    it "mantém a data e o tempo da última mensagem no evento" do
      chat.set(last_message_at: 10.minutes.ago)

      expect { chat.dispatch_event! }.to have_broadcasted_to(stream("chat-list")).with(
        a_hash_including(
          "action" => "upsert",
          "event" => a_hash_including("id" => chat.id.to_s, "lastMessageAt" => kind_of(Integer), "lastMessageFrom" => "10min")
        )
      )
    end

    it "transmite na stream principal da organização" do
      expect { chat.dispatch_event! }.to have_broadcasted_to(stream("chat-list"))
    end

    it "transmite também na stream de quem está atribuído" do
      chat.assigned_account_id = "conta-5"

      expect { chat.dispatch_event! }.to have_broadcasted_to(stream("chat-list-account-conta-5"))
    end

    it "transmite também na stream do departamento" do
      chat.team_id = "time-9"

      expect { chat.dispatch_event! }.to have_broadcasted_to(stream("chat-list-team-time-9"))
    end

    it "transmite em unassigned quando não há dono nem departamento" do
      expect { chat.dispatch_event! }.to have_broadcasted_to(stream("chat-list-unassigned"))
    end

    it "não transmite em unassigned quando há dono" do
      chat.assigned_account_id = "conta-5"

      expect { chat.dispatch_event! }.not_to have_broadcasted_to(stream("chat-list-unassigned"))
    end

    it "não transmite em unassigned quando há departamento" do
      chat.team_id = "time-9"

      expect { chat.dispatch_event! }.not_to have_broadcasted_to(stream("chat-list-unassigned"))
    end

    it "não transmite nada com ignore_events" do
      chat.ignore_events = true

      expect { chat.dispatch_event! }.not_to have_broadcasted_to(stream("chat-list"))
    end

    it "não transmite na stream de outra organização" do
      expect { chat.dispatch_event! }.not_to have_broadcasted_to(stream("chat-list", create(:organization)))
    end

    it "sai sozinho ao atualizar a conversa" do
      expect { chat.update(notes: "cliente VIP") }.to have_broadcasted_to(stream("chat-list")).with(
        a_hash_including("event" => a_hash_including("notes" => "cliente VIP"))
      )
    end

    it "sai sozinho ao criar a conversa" do
      other = build(:chat, organization: organization)

      expect { other.save! }.to have_broadcasted_to(stream("chat-list")).with(
        a_hash_including("event" => a_hash_including("id" => other.id.to_s))
      )
    end
  end

  describe "#dispatch_removal!" do
    before do
      chat.assigned_account_id = "conta-5"
      chat.team_id = "time-9"
    end

    it "avisa a remoção nas mesmas streams do upsert" do
      payload = { "action" => "remove", "event" => { "id" => chat.id.to_s } }

      expect { chat.dispatch_removal! }
        .to have_broadcasted_to(stream("chat-list")).with(payload)
        .and have_broadcasted_to(stream("chat-list-account-conta-5")).with(payload)
        .and have_broadcasted_to(stream("chat-list-team-time-9")).with(payload)
    end

    it "não transmite com ignore_events" do
      chat.ignore_events = true

      expect { chat.dispatch_removal! }.not_to have_broadcasted_to(stream("chat-list"))
    end
  end

  describe "#sync_system_tags!" do
    def tag_names
      chat.reload.chat_tags.pluck(:name)
    end

    it "cria e aplica a etiqueta com a cor do sistema" do
      chat.sync_system_tags!(:deal, :won)

      tag = ChatTag.where(name: "ganho", organization_id: organization.id).take
      expect(tag.color).to eq("#2ecc71")
      expect(tag_names).to eq([ "ganho" ])
    end

    it "é idempotente" do
      3.times { chat.sync_system_tags!(:deal, :won) }

      expect(ChatTag.where(name: "ganho", organization_id: organization.id).count).to eq(1)
      expect(chat.reload.chat_tag_ids.size).to eq(1)
    end

    it "tira a etiqueta oposta do grupo" do
      chat.sync_system_tags!(:deal, :lost)
      chat.sync_system_tags!(:deal, :won)

      expect(tag_names).to eq([ "ganho" ])
    end

    it "tira todas as etiquetas do grupo quando keep é nil" do
      chat.sync_system_tags!(:deal, :won)
      chat.sync_system_tags!(:deal, nil)

      expect(tag_names).to be_empty
    end

    it "não mexe nas etiquetas de outro grupo" do
      chat.sync_system_tags!(:attendance, :show)
      chat.sync_system_tags!(:deal, :won)
      chat.sync_system_tags!(:deal, nil)

      expect(tag_names).to eq([ "compareceu" ])
    end

    it "preserva as etiquetas que a pessoa colocou" do
      manual = ChatTag.create!(name: "vip", color: "#000000", organization_id: organization.id)
      chat.add_to_set(chat_tag_ids: manual.id)

      chat.sync_system_tags!(:deal, :won)
      chat.sync_system_tags!(:deal, nil)

      expect(tag_names).to eq([ "vip" ])
    end

    it "não tira etiqueta de mesmo nome de outra organização" do
      other_tag = ChatTag.create!(name: "ganho", color: "#2ecc71", organization_id: create(:organization).id)
      chat.add_to_set(chat_tag_ids: other_tag.id)

      chat.sync_system_tags!(:deal, nil)

      expect(chat.reload.chat_tag_ids).to eq([ other_tag.id ])
    end

    it "recusa etiqueta que não é do grupo" do
      expect { chat.sync_system_tags!(:deal, :show) }.to raise_error(ArgumentError)
    end

    it "recusa grupo desconhecido" do
      expect { chat.sync_system_tags!(:nope, nil) }.to raise_error(KeyError)
    end

    it "não faz nada numa conversa sem organização" do
      expect { described_class.new.sync_system_tags!(:deal, :won) }.not_to raise_error
      expect(ChatTag.count).to eq(0)
    end

    it "não dispara os callbacks da conversa" do
      chat

      expect { chat.sync_system_tags!(:deal, :won) }.not_to have_broadcasted_to(stream("chat-list"))
    end
  end

  describe "#add_tag!" do
    it "cria a etiqueta com o nome em forma de slug e aplica" do
      tag = chat.add_tag!("Cliente VIP")

      expect(tag.name).to eq("cliente-vip")
      expect(tag.color).to eq(ChatTag::DEFAULT_COLOR)
      expect(chat.reload.chat_tag_ids).to eq([ tag.id ])
    end

    it "reusa a etiqueta existente, sem trocar a cor" do
      existing = ChatTag.create!(name: "vip", color: "#123456", organization_id: organization.id)

      expect(chat.add_tag!("vip", color: "#ffffff")).to eq(existing)
      expect(existing.reload.color).to eq("#123456")
      expect(chat.reload.chat_tag_ids).to eq([ existing.id ])
    end

    it "não duplica ao etiquetar de novo" do
      2.times { chat.add_tag!("vip") }

      expect(chat.reload.chat_tag_ids.size).to eq(1)
    end

    it "não reusa a etiqueta de mesmo nome de outra organização" do
      other = ChatTag.create!(name: "vip", color: "#123456", organization_id: create(:organization).id)

      expect(chat.add_tag!("vip").id).not_to eq(other.id)
    end
  end

  describe "nota de pausar e retomar a automação" do
    let(:account) { create(:account, organization: organization, name: "Ana Lima") }

    def toggle_notes
      notes("automation-toggle-notation").map(&:content)
    end

    it "registra quem pausou" do
      chat.updated_by_account = account
      chat.update(automation_enabled: false)

      expect(toggle_notes).to eq([ "Ana Lima pausou a automação." ])
    end

    it "registra quem retomou" do
      chat.set(automation_enabled: false)
      chat.updated_by_account = account
      chat.update(automation_enabled: true)

      expect(toggle_notes).to eq([ "Ana Lima retomou a automação." ])
    end

    it "sai no idioma pedido" do
      chat.updated_by_account = account

      I18n.with_locale(:en) { chat.update(automation_enabled: false) }

      expect(toggle_notes).to eq([ I18n.t("connectors.notes.automation_paused_by", name: "Ana Lima", locale: :en) ])
    end

    context "quando a mudança parte do backend" do
      it "registra uma nota genérica ao pausar" do
        chat.update(automation_enabled: false)

        expect(toggle_notes).to eq([ "A automação foi pausada." ])
      end

      it "registra uma nota genérica ao retomar" do
        chat.set(automation_enabled: false)
        chat.update(automation_enabled: true)

        expect(toggle_notes).to eq([ "A automação foi retomada." ])
      end

      it "não registra quando quem pausou já criou a própria nota" do
        chat.update(automation_enabled: false, automation_toggle_noted: true)

        expect(toggle_notes).to be_empty
      end

      it "não carrega a marcação para o save seguinte" do
        chat.update(automation_enabled: false, automation_toggle_noted: true)
        chat.update(automation_enabled: true)

        expect(toggle_notes).to eq([ "A automação foi retomada." ])
      end
    end

    it "não registra quando outro campo muda" do
      chat.updated_by_account = account
      chat.update(notes: "cliente VIP")

      expect(toggle_notes).to be_empty
    end

    it "não registra com `set`, que não passa por callback" do
      chat.set(automation_enabled: false)

      expect(toggle_notes).to be_empty
    end

    it "a nota fica fora do que a automação lê, mas aparece na tela" do
      chat.update(automation_enabled: false)

      note = notes("automation-toggle-notation").take
      expect(ChatMessage::Base.where(chat_id: chat.id).to_a).not_to include(note)
      expect(ChatMessage::Base.unscoped.list_for_chat.where(chat_id: chat.id).to_a).to include(note)
    end
  end

  describe "nota de atribuição" do
    let(:actor) { create(:account, organization: organization, name: "Ana Lima") }
    let(:assignee) { create(:account, organization: organization, name: "Bruno Reis") }

    def assignment_notes
      notes("assigned-user-notation").map(&:content)
    end

    it "diz que a pessoa assumiu para si" do
      chat.updated_by_account = actor
      chat.update(assigned_account_id: actor.id)

      expect(assignment_notes).to eq([ "Ana Lima assumiu esta conversa para si." ])
    end

    it "diz quem atribuiu a quem" do
      chat.updated_by_account = actor
      chat.update(assigned_account_id: assignee.id)

      expect(assignment_notes).to eq([ "Ana Lima atribuiu Bruno Reis a esta conversa." ])
    end

    it "sem autor, diz só a quem foi atribuída" do
      chat.update(assigned_account_id: assignee.id)

      expect(assignment_notes).to eq([ "Esta conversa foi atribuída a Bruno Reis." ])
    end

    it "ao tirar, diz quem tirou e de quem" do
      chat.set(assigned_account_id: assignee.id)
      chat.updated_by_account = actor
      chat.update(assigned_account_id: nil)

      expect(assignment_notes).to eq([ "Ana Lima removeu a atribuição de Bruno Reis desta conversa." ])
    end

    it "ao tirar de alguém que não existe mais, diz só quem tirou" do
      chat.set(assigned_account_id: SecureRandom.uuid)
      chat.updated_by_account = actor
      chat.update(assigned_account_id: nil)

      expect(assignment_notes).to eq([ "Ana Lima removeu a atribuição desta conversa." ])
    end

    it "ao tirar sem autor, não registra" do
      chat.set(assigned_account_id: assignee.id)
      chat.update(assigned_account_id: nil)

      expect(assignment_notes).to be_empty
    end

    it "não registra atribuição para conta de outra organização" do
      outsider = create(:account, name: "De Fora")
      chat.updated_by_account = actor
      chat.update(assigned_account_id: outsider.id)

      expect(assignment_notes).to be_empty
    end

    it "não registra quando outro campo muda" do
      chat.updated_by_account = actor
      chat.update(notes: "cliente VIP")

      expect(assignment_notes).to be_empty
    end
  end

  describe "#send_text_message" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:chat) { create(:chat, connector: connector, external_id: "553183794137@s.whatsapp.net") }
    let(:send_url) { "http://evolution.test/message/sendText/#{connector.instance_name}" }

    def sent_message
      ChatMessage::Text.unscoped.where(chat_id: chat.id, role: "assistant").take
    end

    before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

    def provider_reply(id)
      { status: 201, body: { key: { id: id } }.to_json, headers: { "Content-Type" => "application/json" } }
    end

    context "quando o canal aceita" do
      it "cria a mensagem como pending antes de despachar" do
        status_during_send = nil
        stub_request(:post, send_url).to_return do
          status_during_send = sent_message&.status
          provider_reply("ext-1")
        end

        chat.send_text_message("olá")

        expect(status_during_send).to eq("pending")
      end

      it "envia para o número sem o sufixo do JID" do
        stub = stub_request(:post, send_url)
               .with(body: hash_including("number" => "553183794137@s.whatsapp.net", "text" => "olá"))
               .to_return(provider_reply("ext-1"))

        chat.send_text_message("olá")

        expect(stub).to have_been_requested
      end

      it "grava o id externo depois do retorno" do
        stub_request(:post, send_url).to_return(provider_reply("ext-1"))

        message = chat.send_text_message("olá")

        expect(message.reload).to have_attributes(message_id: "ext-1", status: "pending", role: "assistant", content: "olá")
      end

      it "assina com o nome da organização quando não há remetente" do
        stub_request(:post, send_url).to_return(provider_reply("ext-1"))

        expect(chat.send_text_message("olá").sender_name).to eq(organization.name)
      end

      it "assina com o remetente informado" do
        stub_request(:post, send_url).to_return(provider_reply("ext-1"))

        expect(chat.send_text_message("olá", "Bot da Loja").sender_name).to eq("Bot da Loja")
      end

      it "guarda os atributos extras" do
        stub_request(:post, send_url).to_return(provider_reply("ext-1"))

        expect(chat.send_text_message("olá", nil, { campaign_id: "camp-1" }).campaign_id).to eq("camp-1")
      end

      it "atualiza a prévia da lista" do
        stub_request(:post, send_url).to_return(provider_reply("ext-1"))

        chat.send_text_message("olá")

        expect(chat.reload).to have_attributes(last_message_content: "olá", last_message_by: "assistant", last_message_type: "text")
      end
    end

    context "quando o canal levanta erro" do
      before { stub_request(:post, send_url).to_timeout }

      it "marca como failed com a causa e deixa o erro seguir" do
        expect { chat.send_text_message("olá") }.to raise_error(Net::OpenTimeout)

        expect(sent_message).to have_attributes(status: "failed", status_message: "execution expired")
      end

      it "mantém a tentativa visível no chat" do
        expect { chat.send_text_message("olá") }.to raise_error(Net::OpenTimeout)

        expect(ChatMessage::Base.unscoped.list_for_chat.where(chat_id: chat.id).count).to eq(1)
      end
    end

    context "quando o canal não devolve id" do
      it "marca como failed" do
        stub_request(:post, send_url).to_return(status: 201, body: "{}", headers: { "Content-Type" => "application/json" })

        expect(chat.send_text_message("olá").reload).to have_attributes(message_id: nil, status: "failed")
      end
    end

    context "com o conector fechado" do
      it "não chama o provedor e marca como failed" do
        connector.set(status_cd: "closed")

        expect(chat.send_text_message("olá").reload.status).to eq("failed")
        expect(a_request(:post, send_url)).not_to have_been_made
      end
    end
  end

  describe "#send_text_message_without_event" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:chat) { create(:chat, connector: connector, last_message_at: 1.hour.ago) }
    let(:send_url) { "http://evolution.test/message/sendText/#{connector.instance_name}" }

    def sent_message
      ChatMessage::Text.unscoped.where(chat_id: chat.id, role: "assistant").take
    end

    before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

    it "devolve o id externo e grava a mensagem depois do envio" do
      stub_request(:post, send_url).to_return(status: 201, body: { key: { id: "ext-1" } }.to_json, headers: { "Content-Type" => "application/json" })

      expect(chat.send_text_message_without_event("olá", "Fluxo", true)).to eq("ext-1")
      expect(sent_message).to have_attributes(message_id: "ext-1", status: "pending", sender_name: "Fluxo")
    end

    it "com update_event sobe a conversa para o topo" do
      stub_request(:post, send_url).to_return(status: 201, body: { key: { id: "ext-1" } }.to_json, headers: { "Content-Type" => "application/json" })

      chat.send_text_message_without_event("olá", "Fluxo", true)

      expect(chat.reload.last_message_at.to_time).to be_within(5.seconds).of(Time.current)
    end

    it "sem update_event joga a data 6 meses para trás e o sync não desfaz" do
      stub_request(:post, send_url).to_return(status: 201, body: { key: { id: "ext-1" } }.to_json, headers: { "Content-Type" => "application/json" })

      chat.send_text_message_without_event("olá", "Fluxo", false)

      expect(chat.reload.last_message_at.to_time).to be_within(5.seconds).of(Time.now - 6.months)
    end

    it "falha do canal não levanta: fica failed com a causa" do
      stub_request(:post, send_url).to_timeout

      expect(chat.send_text_message_without_event("olá", "Fluxo", true)).to be_nil
      expect(sent_message).to have_attributes(message_id: nil, status: "failed", status_message: "execution expired")
    end
  end

  describe "#pause_automation_for_human!" do
    it "pelo padrão da organização, pausa sem volta automática" do
      expect { chat.pause_automation_for_human! }.not_to have_enqueued_job(EnableContactJob)

      expect(chat.reload).to have_attributes(automation_enabled: false, active_job_id: nil, automation_resume_at: nil)
    end

    it "usa o período configurado na organização" do
      organization.update!(settings: { "automation_pause_period" => "minutes", "automation_pause_time_to" => 30 })

      expect { chat.pause_automation_for_human! }.to have_enqueued_job(EnableContactJob)

      expect(chat.reload.automation_resume_at).to be_within(5.seconds).of(30.minutes.from_now)
    end

    it "sem a organização, pausa sem volta automática" do
      orphan = create(:chat, organization: organization)
      orphan.set(organization_id: SecureRandom.uuid)

      expect { described_class.scoped(orphan.organization_id, orphan.id).pause_automation_for_human! }.not_to have_enqueued_job(EnableContactJob)
    end
  end

  describe "#disable_automation_to" do
    include ActiveJob::TestHelper

    { "minutes" => 15.minutes, "hours" => 15.hours, "days" => 15.days }.each do |period, duration|
      it "agenda a volta em #{period}" do
        freeze_time do
          expect { chat.disable_automation_to(period, 15) }.to have_enqueued_job(EnableContactJob)
            .with(chat.id.to_s, organization.id, kind_of(String))
            .at(duration.from_now)
        end

        expect(chat.reload.automation_enabled).to be(false)
      end
    end

    it "guarda o horário da volta para o painel exibir" do
      chat.disable_automation_to("hours", 2)

      expect(chat.reload.automation_resume_at).to be_within(5.seconds).of(2.hours.from_now)
    end

    it "guarda no job o mesmo token da conversa" do
      chat.disable_automation_to("hours", 2)

      expect(EnableContactJob).to have_been_enqueued.with(chat.id.to_s, organization.id, chat.reload.active_job_id)
    end

    %w[disabled inexistente].each do |period|
      it "com o período #{period} pausa sem agendar volta" do
        expect { chat.disable_automation_to(period, 2) }.not_to have_enqueued_job(EnableContactJob)

        expect(chat.reload).to have_attributes(automation_enabled: false, active_job_id: nil, automation_resume_at: nil)
      end
    end

    it "sem período pausa sem agendar volta" do
      expect { chat.disable_automation_to(nil, nil) }.not_to have_enqueued_job(EnableContactJob)
    end

    it "aceita o período como símbolo" do
      expect { chat.disable_automation_to(:hours, 1) }.to have_enqueued_job(EnableContactJob)
    end

    describe "cancelamento por token" do
      it "pausar de novo troca o token e o agendamento antigo não religa" do
        chat.disable_automation_to("hours", 2)
        stale_token = chat.active_job_id

        chat.disable_automation_to("hours", 4)

        expect(chat.active_job_id).not_to eq(stale_token)

        EnableContactJob.perform_now(chat.id.to_s, organization.id, stale_token)

        expect(chat.reload.automation_enabled).to be(false)
        expect(chat.automation_resume_at).to be_within(5.seconds).of(4.hours.from_now)
      end

      it "o agendamento vigente religa" do
        chat.disable_automation_to("hours", 2)

        EnableContactJob.perform_now(chat.id.to_s, organization.id, chat.active_job_id)

        expect(chat.reload).to have_attributes(automation_enabled: true, active_job_id: nil, automation_resume_at: nil)
      end

      it "pausar sem volta invalida o agendamento anterior" do
        chat.disable_automation_to("hours", 2)
        stale_token = chat.active_job_id

        chat.disable_automation_to("disabled", nil)

        EnableContactJob.perform_now(chat.id.to_s, organization.id, stale_token)

        expect(chat.reload).to have_attributes(automation_enabled: false, active_job_id: nil, automation_resume_at: nil)
      end

      it "uma pessoa religar à mão e pausar de novo também invalida" do
        chat.disable_automation_to("hours", 2)
        stale_token = chat.active_job_id

        chat.update(automation_enabled: true, active_job_id: nil, automation_resume_at: nil)
        chat.disable_automation_to("disabled", nil)

        EnableContactJob.perform_now(chat.id.to_s, organization.id, stale_token)

        expect(chat.reload.automation_enabled).to be(false)
      end
    end

    it "registra a pausa uma vez só" do
      chat.disable_automation_to("hours", 2)
      chat.disable_automation_to("hours", 4)

      expect(notes("automation-toggle-notation").count).to eq(1)
    end
  end

  describe "#update_last_message" do
    it "pega a mensagem real mais recente, ignorando notas" do
      create(:chat_text_message, chat: chat, role: "user", content: "primeira", created_at: 2.minutes.ago)
      create(:chat_text_message, chat: chat, role: "assistant", content: "resposta", created_at: 1.minute.ago)
      create(:chat_text_message, chat: chat, role: "base", role_base_type: "context-clear", content: "nota")
      chat.set(last_message_content: "velho", last_message_by: "user", last_message_type: "audio")

      chat.update_last_message

      expect(chat).to have_attributes(last_message_content: "resposta", last_message_by: "assistant", last_message_type: "text")
    end

    it "enxerga as partes de uma mensagem dividida" do
      create(:chat_text_message, chat: chat, role: "assistant", content: "inteira", has_span: true, created_at: 2.minutes.ago)
      create(:chat_text_message, chat: chat, role: "assistant", content: "última parte", is_span: true, created_at: 1.minute.ago)

      chat.update_last_message

      expect(chat.last_message_content).to eq("última parte")
    end

    it "não mexe em nada numa conversa sem mensagens" do
      chat.set(last_message_content: "velho")

      chat.update_last_message

      expect(chat.last_message_content).to eq("velho")
    end

    it "#update_last_message! persiste" do
      create(:chat_text_message, chat: chat, content: "persistida")
      chat.set(last_message_content: "velho")

      chat.update_last_message!

      expect(chat.reload.last_message_content).to eq("persistida")
    end
  end

  describe "#clear_context!" do
    before { chat.set(automation_enabled: false, flow_next_node_id: "no-3") }

    let!(:message) { create(:chat_text_message, chat: chat, content: "antes da limpeza") }

    it "tira o histórico do que a automação lê, sem apagar" do
      chat.clear_context!

      expect(ChatMessage::Base.where(chat_id: chat.id).to_a).to be_empty
      expect(ChatMessage::Base.unscoped.where(chat_id: chat.id, id: message.id).exists?).to be(true)
    end

    it "deixa uma nota do que aconteceu" do
      chat.clear_context!

      expect(notes("context-clear").map(&:content)).to eq([ "Contexto limpo" ])
    end

    it "aceita outro texto na nota" do
      chat.clear_context!("Limpeza de contexto por inatividade")

      expect(notes("context-clear").map(&:content)).to eq([ "Limpeza de contexto por inatividade" ])
    end

    it "religa a automação e volta o fluxo para o início" do
      chat.clear_context!

      expect(chat.reload).to have_attributes(automation_enabled: true, flow_next_node_id: nil)
    end

    it "não mexe no histórico de outra conversa" do
      other = create(:chat_text_message, chat: create(:chat, organization: organization), content: "de outra conversa")

      chat.clear_context!

      expect(ChatMessage::Base.where(id: other.id).exists?).to be(true)
    end

    it "#clear_context não persiste os campos da conversa" do
      chat.clear_context

      expect(chat.automation_enabled).to be(true)
      expect(chat.reload.automation_enabled).to be(false)
    end
  end

  describe "#set_default_session!" do
    it "começa na primeira mensagem do contato do último dia" do
      create(:chat_text_message, chat: chat, role: "user", content: "antiga", created_at: 2.days.ago)
      first = create(:chat_text_message, chat: chat, role: "user", content: "primeira", created_at: 5.hours.ago)
      create(:chat_text_message, chat: chat, role: "user", content: "segunda", created_at: 1.hour.ago)
      create(:chat_text_message, chat: chat, role: "assistant", content: "nossa", created_at: 6.hours.ago)

      chat.set_default_session!

      expect(chat.reload.session_start_at.to_i).to eq(first.created_at.to_i)
    end

    it "sem mensagem recente, começa na criação da conversa" do
      chat.set_default_session!

      expect(chat.reload.session_start_at.to_i).to eq(chat.created_at.to_i)
    end
  end

  describe "#active_session" do
    it "é falso sem sessão" do
      expect(described_class.new.active_session).to be(false)
    end

    it "é verdadeiro dentro das 24 horas" do
      expect(described_class.new(session_start_at: 23.hours.ago).active_session).to be(true)
    end

    it "é falso depois das 24 horas" do
      expect(described_class.new(session_start_at: 25.hours.ago).active_session?).to be(false)
    end
  end

  describe "#simple_time_ago" do
    let(:now) { Time.zone.parse("2026-11-06 12:00:00") }

    around { |example| travel_to(now) { example.run } }

    {
      "5 segundos" => [ 5.seconds, "5s" ],
      "59,5 segundos" => [ 59.5.seconds, "59s" ],
      "1 minuto" => [ 60.seconds, "1min" ],
      "59,5 minutos" => [ 3599.5.seconds, "59min" ],
      "1 hora" => [ 3600.seconds, "1h" ],
      "23,5 horas" => [ 86_399.5.seconds, "23h" ],
      "1 dia" => [ 86_400.seconds, "1d" ],
      "29 dias" => [ 29.days, "29d" ],
      "fração antes de 30 dias" => [ 2_591_999.5.seconds, "29d" ]
    }.each do |label, (elapsed, expected)|
      it "#{label} viram #{expected}" do
        expect(described_class.new.simple_time_ago(now - elapsed)).to eq(expected)
      end
    end

    it "conta meses de calendário depois de 30 dias" do
      expect(described_class.new.simple_time_ago(Time.zone.parse("2026-09-06 12:00:00"))).to eq("2m")
    end

    it "data no futuro, comum com o relógio do provedor adiantado, vira 0s" do
      expect(described_class.new.simple_time_ago(now + 30.seconds)).to eq("0s")
    end
  end

  describe "#last_message_nano" do
    it "dá a última mensagem em milissegundos" do
      moment = Time.utc(2026, 11, 6, 12, 0, 0)

      expect(described_class.new(last_message_at: moment).last_message_nano).to eq(moment.to_i * 1000)
    end
  end

  describe "#abbreviated_name" do
    {
      nil => "",
      "" => "",
      "Maria" => "MA",
      "maria souza" => "MS",
      "Maria da Silva Souza" => "MS"
    }.each do |name, expected|
      it "#{name.inspect} vira #{expected.inspect}" do
        expect(described_class.new(user_name: name).abbreviated_name).to eq(expected)
      end
    end
  end

  describe "#contact" do
    it "é a visão da conversa como pessoa" do
      expect(chat.contact).to be_a(Contact)
      expect(chat.contact.external_id).to eq(chat.external_id)
    end
  end

  describe "ao apagar a conversa" do
    it "apaga todas as mensagens, inclusive notas e partes, que ficam fora do default_scope" do
      create(:chat_text_message, chat: chat, content: "normal")
      create(:chat_text_message, chat: chat, role: "base", role_base_type: "context-clear", content: "nota")
      create(:chat_text_message, chat: chat, role: "assistant", content: "parte", is_span: true)

      chat.destroy

      expect(ChatMessage::Base.unscoped.where(chat_id: chat.id).count).to eq(0)
    end

    it "apaga junto o arquivo das mensagens" do
      blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("fake"), filename: "foto.jpg", content_type: "image/jpeg")
      create(:chat_image_message, chat: chat, media_blob_id: blob.id)

      expect { chat.destroy }.to have_enqueued_job(ActiveStorage::PurgeJob).with(blob)
    end
  end
end
