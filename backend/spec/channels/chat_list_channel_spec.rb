require "rails_helper"

RSpec.describe ChatListChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }

  def stream(name, org = organization)
    "org:#{org.id}:#{name}"
  end

  def member_with(chat_list_to, chat: "all")
    role = create(:access_role, organization: organization, permissions: AccessRole::MEMBER_PERMISSIONS.merge("chat" => chat, "chat_list_to" => chat_list_to))
    create(:account, organization: organization, role: "member", access_role: role)
  end

  def listen_as(account)
    stub_connection current_account: account
    subscribe
  end

  describe "#subscribed" do
    context "com o dono" do
      before { listen_as(owner) }

      it "escuta a lista completa da organização" do
        expect(subscription).to be_confirmed
        expect(subscription).to have_stream_from(stream("chat-list"))
      end

      it "não escuta as listas parciais, que repetiriam os eventos" do
        expect(subscription).not_to have_stream_from(stream("chat-list-unassigned"))
      end
    end

    context "com chat_list_to all" do
      before { listen_as(member_with("all")) }

      it "escuta a lista completa" do
        expect(subscription).to have_stream_from(stream("chat-list"))
      end
    end

    context "sem grupo de permissões, com o padrão de membro" do
      before { listen_as(create(:account, organization: organization, role: "member")) }

      it "escuta a lista completa" do
        expect(subscription).to have_stream_from(stream("chat-list"))
      end
    end

    context "com chat_list_to assigned" do
      let(:member) { member_with("assigned") }

      before { listen_as(member) }

      it "escuta só as próprias e as sem dono" do
        expect(subscription).to have_stream_from(stream("chat-list-account-#{member.id}"))
        expect(subscription).to have_stream_from(stream("chat-list-unassigned"))
        expect(subscription).not_to have_stream_from(stream("chat-list"))
      end
    end

    %w[team].each do |level|
      context "com chat_list_to #{level}" do
        let(:member) { member_with(level) }
        let(:team) { create(:team, organization: organization) }
        let(:second_team) { create(:team, organization: organization) }

        before do
          create(:team_membership, team: team, account: member)
          create(:team_membership, team: second_team, account: member)
          listen_as(member)
        end

        it "escuta os próprios departamentos e as sem departamento" do
          expect(subscription).to have_stream_from(stream("chat-list-team-#{team.id}"))
          expect(subscription).to have_stream_from(stream("chat-list-team-#{second_team.id}"))
          expect(subscription).to have_stream_from(stream("chat-list-no-team"))
          expect(subscription).not_to have_stream_from(stream("chat-list-unassigned"))
          expect(subscription).not_to have_stream_from(stream("chat-list"))
        end

        it "não escuta departamento dos outros" do
          other_team = create(:team, organization: organization)

          expect(subscription).not_to have_stream_from(stream("chat-list-team-#{other_team.id}"))
        end
      end
    end

    # A validação do grupo só aceita all, team e assigned; `none` só vem de valor antigo no banco.
    context "com chat_list_to none" do
      it "rejeita" do
        member = member_with("all")
        member.access_role.update_columns(permissions: member.access_role.permissions.merge("chat_list_to" => "none"))

        listen_as(member)

        expect(subscription).to be_rejected
      end
    end

    context "sem a permissão de chat" do
      it "rejeita, mesmo com chat_list_to" do
        listen_as(member_with("all", chat: "none"))

        expect(subscription).to be_rejected
      end
    end

    describe "isolamento entre organizações" do
      let(:foreign) { create(:organization) }

      it "toda stream é da organização da conta" do
        member = member_with("assigned")

        listen_as(member)

        expect(subscription.streams).to all(start_with("org:#{organization.id}:"))
      end

      it "um parâmetro de organização é ignorado" do
        stub_connection current_account: owner

        subscribe(organizationId: foreign.id)

        expect(subscription).to have_stream_from(stream("chat-list"))
        expect(subscription).not_to have_stream_from(stream("chat-list", foreign))
      end

      it "o evento de outra organização não chega nas streams desta" do
        other_chat = create(:chat, organization: foreign)

        expect { other_chat.dispatch_event! }.not_to have_broadcasted_to(stream("chat-list"))
      end
    end

    it "as streams são as mesmas que a conversa usa para transmitir" do
      member = member_with("assigned")
      listen_as(member)
      chat = create(:chat, organization: organization, assigned_account_id: member.id)

      published = chat.list_streams.map { |name| stream(name) }

      expect(published & subscription.streams).to eq([ stream("chat-list-account-#{member.id}") ])
    end
  end

  describe "#unsubscribed" do
    it "para de escutar" do
      listen_as(owner)

      subscription.unsubscribe_from_channel

      expect(subscription).not_to have_stream_from(stream("chat-list"))
    end
  end

  describe "#request_recent" do
    def recent_ids
      perform :request_recent
      transmissions.last["events"].map { |event| event["id"] }
    end

    it "transmite as conversas com a data e o tempo da última mensagem" do
      chat = create(:chat, organization: organization, last_message_at: 5.minutes.ago)
      listen_as(owner)

      perform :request_recent

      expect(transmissions.last["action"]).to eq("recent_chats")
      expect(transmissions.last["events"].first).to include("id" => chat.id.to_s, "lastMessageFrom" => "5min")
      expect(transmissions.last["events"].first["lastMessageAt"]).to be_a(Integer)
    end

    it "traz as mais recentes primeiro" do
      older = create(:chat, organization: organization, last_message_at: 2.hours.ago)
      newer = create(:chat, organization: organization, last_message_at: 1.hour.ago)
      listen_as(owner)

      expect(recent_ids).to eq([ newer.id.to_s, older.id.to_s ])
    end

    it "traz no máximo RECENT_LIMIT" do
      stub_const("#{described_class}::RECENT_LIMIT", 2)
      3.times { create(:chat, organization: organization) }
      listen_as(owner)

      expect(recent_ids.size).to eq(2)
    end

    it "deixa de fora a conversa de teste" do
      create(:chat, organization: organization, external_id: Chat::TEST_EXTERNAL_ID)
      listen_as(owner)

      expect(recent_ids).to be_empty
    end

    it "não traz conversa de outra organização" do
      create(:chat, organization: create(:organization))
      own = create(:chat, organization: organization)
      listen_as(owner)

      expect(recent_ids).to eq([ own.id.to_s ])
    end

    context "com chat_list_to assigned" do
      let(:member) { member_with("assigned") }

      it "traz as próprias e as sem dono" do
        mine = create(:chat, organization: organization, assigned_account_id: member.id)
        unassigned = create(:chat, organization: organization)
        create(:chat, organization: organization, assigned_account_id: owner.id)
        listen_as(member)

        expect(recent_ids).to contain_exactly(mine.id.to_s, unassigned.id.to_s)
      end

      it "conversa sem dono mas de um departamento não é sem dono" do
        create(:chat, organization: organization, team_id: "time-1")
        listen_as(member)

        expect(recent_ids).to be_empty
      end
    end

    context "com chat_list_to team" do
      let(:member) { member_with("team") }
      let(:team) { create(:team, organization: organization) }

      before { create(:team_membership, team: team, account: member) }

      it "traz as do departamento e as sem departamento" do
        of_team = create(:chat, organization: organization, team_id: team.id)
        no_team = create(:chat, organization: organization)
        create(:chat, organization: organization, team_id: create(:team, organization: organization).id)
        listen_as(member)

        expect(recent_ids).to contain_exactly(of_team.id.to_s, no_team.id.to_s)
      end
    end

    context "com a permissão retirada depois de assinar" do
      it "não traz nada" do
        member = member_with("all")
        create(:chat, organization: organization)
        listen_as(member)
        # Pela validação do grupo `none` não entra: a coluna, para o caso de valor antigo no banco.
        member.access_role.update_columns(permissions: member.access_role.permissions.merge("chat_list_to" => "none"))

        expect(recent_ids).to be_empty
      end
    end
  end
  # A lista em tempo real e a API REST precisam concordar: `Chat.visible_to` mostra a quem vê
  # por departamento a conversa sem departamento, mesmo já tendo dono.
  describe "o que cada nível recebe, igual à API REST" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:team) { create(:team, organization: organization) }
    let(:someone) { create(:account, organization: organization) }

    def chat_with(**attributes)
      create(:chat, connector: connector, external_id: "55119#{rand(10_000_000..99_999_999)}@s.whatsapp.net", **attributes)
    end

    it "quem vê por departamento recebe conversa sem departamento que já tem dono" do
      member = member_with("team")
      create(:team_membership, team: team, account: member)
      chat = chat_with(assigned_account_id: someone.id.to_s, team_id: nil)

      stub_connection current_account: member
      subscribe

      expect(Chat.visible_to(member).where(id: chat.id).take).to eq(chat)
      expect(chat.list_streams.map { |name| stream(name) } & subscription.streams).not_to be_empty
    end

    it "quem só vê o que é seu não recebe conversa sem departamento de outra pessoa" do
      member = member_with("assigned")
      chat = chat_with(assigned_account_id: someone.id.to_s, team_id: nil)

      stub_connection current_account: member
      subscribe

      expect(Chat.visible_to(member).where(id: chat.id).take).to be_nil
      expect(chat.list_streams.map { |name| stream(name) } & subscription.streams).to be_empty
    end

    it "as conversas recentes obedecem o mesmo critério" do
      member = member_with("assigned")
      foreign = chat_with(assigned_account_id: someone.id.to_s, team_id: nil)
      mine = chat_with(assigned_account_id: member.id.to_s, team_id: nil)

      stub_connection current_account: member
      subscribe
      perform :request_recent

      ids = transmissions.last["events"].map { |event| event["id"] }
      expect(ids).to include(mine.id.to_s)
      expect(ids).not_to include(foreign.id.to_s)
    end
  end
end
