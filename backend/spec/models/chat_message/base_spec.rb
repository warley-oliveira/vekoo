require "rails_helper"

RSpec.describe ChatMessage::Base do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization, last_message_at: 1.hour.ago) }
  let(:message_stream) { described_class.stream_for(chat) }

  def list_stream(name = "chat-list")
    ApplicationCable::Channel.organization_stream(chat.organization_id, name)
  end

  # Sem `ignore_events`: é o caminho de produção, com os hooks ligados.
  def create_message(klass = ChatMessage::Text, **attrs)
    klass.create!({ role: "user", content: "oi", chat: chat }.merge(attrs))
  end

  def enable_reopen!
    organization.update_with_settings!(chat_settings: { "reopen_conversation_on_inbound_enabled" => true })
  end

  describe "after_create #sync_chat_last_message" do
    context "quando entra uma mensagem real do contato" do
      it "sincroniza os 4 campos e avança last_message_at" do
        before_sync = chat.last_message_at

        create_message(role: "user", content: "olá")
        chat.reload

        expect(chat).to have_attributes(last_message_type: "text", last_message_content: "olá", last_message_by: "user")
        expect(chat.last_message_at).to be > before_sync
      end
    end

    context "quando entra uma mensagem do nosso lado" do
      it "marca last_message_by como assistant" do
        create_message(role: "assistant", content: "resposta")

        expect(chat.reload).to have_attributes(last_message_by: "assistant", last_message_content: "resposta")
      end
    end

    context "com o tipo de cada subclasse" do
      it "usa media para ChatMessage::Media" do
        create_message(ChatMessage::Media, content: "legenda", media_type: "video")

        expect(chat.reload.last_message_type).to eq("media")
      end

      it "usa audio para ChatMessage::Audio" do
        create_message(ChatMessage::Audio, content: "", audio_url: "http://x/a.mp3")

        expect(chat.reload.last_message_type).to eq("audio")
      end

      it "usa image para ChatMessage::Image" do
        create_message(ChatMessage::Image, image_url: "http://x/y.jpg")

        expect(chat.reload.last_message_type).to eq("image")
      end
    end

    context "com registros que não contam como última mensagem" do
      it "ignora nota do histórico (role base)" do
        create_message(role: "base", role_base_type: "context-clear", content: "nota do sistema")

        expect(chat.reload.last_message_content).to be_nil
      end

      it "ignora parte de mensagem dividida (is_span)" do
        create_message(role: "assistant", content: "fragmento", is_span: true)

        expect(chat.reload.last_message_content).to be_nil
      end

      it "ignora linha de chamada de ferramenta (tool_calls)" do
        create_message(role: "assistant", content: "", tool_calls: [ { "id" => "1", "name" => "buscar" } ])

        expect(chat.reload.last_message_content).to be_nil
      end

      it "ignora resposta de ferramenta (role tool)" do
        create_message(role: "tool", content: "{}", tool_call_id: "1")

        expect(chat.reload.last_message_content).to be_nil
      end

      it "ignora contexto da IA (role system)" do
        create_message(role: "system", content: "contexto")

        expect(chat.reload.last_message_content).to be_nil
      end

      it "ignora Base cru, cujo tipo está fora da lista" do
        create_message(described_class, role: "user", content: "x")

        expect(chat.reload.last_message_content).to be_nil
      end

      it "respeita skip_chat_sync" do
        create_message(content: "x", skip_chat_sync: true)

        expect(chat.reload.last_message_content).to be_nil
      end

      it "respeita ignore_events" do
        create_message(content: "x", ignore_events: true)

        expect(chat.reload.last_message_content).to be_nil
      end
    end

    context "com mensagem de data antiga" do
      it "não rebaixa last_message_at nem sobrescreve o resto" do
        original_at = chat.last_message_at

        create_message(content: "antiga", created_at: 2.days.ago)
        chat.reload

        expect(chat.last_message_at.to_i).to eq(original_at.to_i)
        expect(chat.last_message_content).to be_nil
      end

      it "aceita a mensagem com a mesma data da última" do
        moment = chat.last_message_at.to_time

        create_message(content: "mesmo instante", created_at: moment)

        expect(chat.reload.last_message_content).to eq("mesmo instante")
      end
    end

    context "com uma instância desatualizada em memória" do
      it "atualiza a instância, limpa o dirty e sobrevive a um save posterior" do
        create_message(content: "nova")

        # `chat` é a MESMA instância recebida pelo belongs_to, então o `set` já a atualizou.
        expect(chat.last_message_content).to eq("nova")
        expect(chat.changed).not_to include("last_message_at", "last_message_type", "last_message_by", "last_message_content")

        # Um job segurando a instância não reescreve com valor velho.
        chat.save

        expect(chat.reload.last_message_content).to eq("nova")
      end
    end

    context "com a lista de conversas em tempo real" do
      it "avisa a lista para reordenar" do
        chat

        expect { create_message(content: "oi") }.to have_broadcasted_to(list_stream).with(
          a_hash_including("action" => "upsert", "event" => a_hash_including("lastMessageContent" => "oi"))
        )
      end

      it "fica quieta quando a conversa está com ignore_events" do
        chat.ignore_events = true

        expect { create_message(content: "oi") }.not_to have_broadcasted_to(list_stream)
        expect(chat.reload.last_message_content).to eq("oi")
      end
    end
  end

  describe "after_create #reopen_chat_if_enabled" do
    # `set`, e não `update`: chega ao estado sem transmitir nada antes do exemplo.
    before { chat.set(status: "closed") }

    context "com o flag ligado na organização" do
      before { enable_reopen! }

      it "reabre a conversa quando o contato escreve" do
        create_message(content: "voltei")

        expect(chat.reload.status).to eq("open")
      end

      it "consulta o flag pela organização da conversa" do
        expect(Organization).to receive(:reopen_on_inbound_enabled?).with(organization.id).and_call_original

        create_message(content: "voltei")
      end

      it "transmite o novo status para a lista reordenar sem refresh" do
        expect { create_message(content: "voltei") }.to have_broadcasted_to(list_stream).with(
          a_hash_including("action" => "upsert", "event" => a_hash_including("status" => "open"))
        ).at_least(:once)
      end

      {
        "texto" => [ ChatMessage::Text, { content: "voltei" } ],
        "imagem" => [ ChatMessage::Image, { image_url: "http://x/y.jpg" } ],
        "mídia" => [ ChatMessage::Media, { media_type: "video", media_url: "http://x/y.mp4" } ],
        "áudio" => [ ChatMessage::Audio, { content: "-", audio_url: "http://x/a.ogg" } ]
      }.each do |type, (klass, attributes)|
        it "reabre em mensagem de #{type}" do
          create_message(klass, **attributes)

          expect(chat.reload.status).to eq("open")
        end
      end

      # Evolution: a mensagem é gravada com a data do provedor DEPOIS de last_message_at já
      # ter avançado. O sync "só avança" aborta nesse caso; a reabertura não pode abortar.
      it "reabre mesmo com mensagem de data antiga" do
        create_message(content: "antiga", created_at: 2.days.ago)

        expect(chat.reload.status).to eq("open")
      end

      it "atualiza a instância em memória para um save posterior não fechar de novo" do
        create_message(content: "voltei")

        chat.save

        expect(chat.reload.status).to eq("open")
      end

      it "não reabre em mensagem do nosso lado (role assistant)" do
        create_message(role: "assistant", content: "resposta")

        expect(chat.reload.status).to eq("closed")
      end

      it "não reabre em nota do histórico (role base)" do
        create_message(role: "base", role_base_type: "context-clear", content: "nota")

        expect(chat.reload.status).to eq("closed")
      end

      it "não reabre em parte de mensagem dividida (is_span)" do
        create_message(content: "fragmento", is_span: true)

        expect(chat.reload.status).to eq("closed")
      end

      it "não reabre em linha de chamada de ferramenta" do
        create_message(content: "", tool_calls: [ { "id" => "1" } ])

        expect(chat.reload.status).to eq("closed")
      end

      it "respeita ignore_events" do
        create_message(content: "x", ignore_events: true)

        expect(chat.reload.status).to eq("closed")
      end

      it "respeita skip_chat_sync" do
        create_message(content: "x", skip_chat_sync: true)

        expect(chat.reload.status).to eq("closed")
      end

      it "não transmite quando a conversa está com ignore_events, mas reabre" do
        chat.ignore_events = true

        expect { create_message(content: "voltei") }.not_to have_broadcasted_to(list_stream)
        expect(chat.reload.status).to eq("open")
      end
    end

    context "quando a conversa já está aberta" do
      before do
        enable_reopen!
        chat.set(status: "open")
      end

      # Guarda de custo: o flag mora no Postgres e o hook roda em toda mensagem recebida.
      it "não consulta o flag" do
        expect(Organization).not_to receive(:reopen_on_inbound_enabled?)

        create_message(content: "oi")
      end
    end

    context "com o flag desligado na organização" do
      it "mantém a conversa fechada" do
        create_message(content: "voltei")

        expect(chat.reload.status).to eq("closed")
      end
    end

    context "com o flag ligado só em outra organização" do
      it "mantém a conversa fechada" do
        create(:organization, features: { "reopen_conversation_on_inbound_enabled" => true })

        create_message(content: "voltei")

        expect(chat.reload.status).to eq("closed")
      end
    end

    context "com o valor do flag em cache" do
      before { enable_reopen! }

      it "só bate no Postgres na primeira mensagem" do
        expect(Organization).to receive(:where).once.and_call_original

        create_message(content: "voltei")
        chat.set(status: "closed")
        create_message(content: "de novo")

        expect(chat.reload.status).to eq("open")
      end

      it "desligar o flag só vale quando o cache expira" do
        create_message(content: "voltei")
        Organization.where(id: organization.id).update_all(settings: { "chat_settings" => { "reopen_conversation_on_inbound_enabled" => false } })

        chat.set(status: "closed")
        create_message(content: "ainda em cache")
        expect(chat.reload.status).to eq("open")

        travel(OrganizationRelations::Access::REOPEN_ON_INBOUND_CACHE_TTL + 1.second) do
          chat.set(status: "closed")
          create_message(content: "cache expirado")
          expect(chat.reload.status).to eq("closed")
        end
      end
    end
  end

  describe "#apply_reaction" do
    # `new`: apply_reaction é cálculo puro, não persiste nada.
    subject(:message) { ChatMessage::Text.new(reactions: existing) }

    let(:existing) { [] }

    context "quando ninguém reagiu ainda" do
      it "adiciona a reação com autor e horário" do
        result = message.apply_reaction("👍", from: "user", sender_name: "Warley")

        expect(result.size).to eq(1)
        expect(result.first).to include("emoji" => "👍", "from" => "user", "sender_name" => "Warley")
        expect(result.first["reacted_at"]).to be_present
      end

      it "guarda o account_id quando a reação parte do operador" do
        result = message.apply_reaction("❤️", from: "assistant", sender_name: "Ana", account_id: "conta-7")

        expect(result.first).to include("from" => "assistant", "account_id" => "conta-7")
      end

      it "omite as chaves opcionais em branco em vez de gravar nil" do
        result = message.apply_reaction("👍", from: "user")

        expect(result.first.keys).to contain_exactly("emoji", "from", "reacted_at")
      end

      it "não persiste nada" do
        message.apply_reaction("👍", from: "user")

        expect(message.reactions).to eq([])
      end
    end

    context "quando os dois lados já reagiram" do
      let(:existing) { [ { "emoji" => "❤️", "from" => "user" }, { "emoji" => "🎉", "from" => "assistant" } ] }

      # No 1:1 do WhatsApp cada lado tem no máximo uma reação por mensagem.
      it "substitui só a reação daquele lado" do
        result = message.apply_reaction("👍", from: "user")

        expect(result).to contain_exactly(
          { "emoji" => "🎉", "from" => "assistant" },
          hash_including("emoji" => "👍", "from" => "user")
        )
      end

      it "remove a reação daquele lado quando o emoji vem em branco" do
        expect(message.apply_reaction("", from: "assistant")).to eq([ { "emoji" => "❤️", "from" => "user" } ])
      end

      it "remove com emoji nil também" do
        expect(message.apply_reaction(nil, from: "user")).to eq([ { "emoji" => "🎉", "from" => "assistant" } ])
      end

      it "aceita o autor como símbolo" do
        result = message.apply_reaction("👍", from: :user)

        expect(result.map { |reaction| reaction["from"] }).to contain_exactly("assistant", "user")
      end
    end

    context "quando as entradas existentes vieram com chaves símbolo" do
      let(:existing) { [ { from: "user", emoji: "❤️" } ] }

      it "ainda reconhece o autor e substitui a entrada" do
        result = message.apply_reaction("👍", from: "user")

        expect(result.size).to eq(1)
        expect(result.first).to include("emoji" => "👍")
      end
    end

    context "com a lista vazia gravada como nil" do
      let(:existing) { nil }

      it "não quebra" do
        expect(message.apply_reaction("👍", from: "user").size).to eq(1)
      end
    end
  end

  describe "transmissão na criação" do
    before { chat }

    it "transmite a mensagem normal na stream da conversa" do
      expect { create_message(content: "oi") }.to have_broadcasted_to(message_stream).with(
        a_hash_including("chatId" => chat.id.to_s, "content" => "oi", "role" => "user", "typeElement" => "text")
      )
    end

    it "não transmite a original de uma mensagem dividida, só as partes" do
      expect { create_message(role: "assistant", content: "inteira", has_span: true) }.not_to have_broadcasted_to(message_stream)

      expect { create_message(role: "assistant", content: "parte", is_span: true) }.to have_broadcasted_to(message_stream).with(
        a_hash_including("content" => "parte", "isSpan" => true)
      )
    end

    it "transmite nota do histórico (role base)" do
      expect { create_message(role: "base", role_base_type: "assigned-user-notation", content: "nota") }
        .to have_broadcasted_to(message_stream).with(a_hash_including("roleBaseType" => "assigned-user-notation"))
    end

    it "não transmite ferramenta nem contexto da IA" do
      expect {
        create_message(role: "tool", content: "{}", tool_call_id: "1")
        create_message(role: "function", content: "{}")
        create_message(role: "system", content: "contexto")
      }.not_to have_broadcasted_to(message_stream)
    end

    it "transmite o cartão de contexto do widget, que a pessoa precisa ver" do
      expect { create_message(role: "system", content: "Página: /preco", message_origin: "widget_context") }
        .to have_broadcasted_to(message_stream)
    end

    it "não transmite com ignore_events" do
      expect { create_message(content: "oi", ignore_events: true) }.not_to have_broadcasted_to(message_stream)
    end

    it "transmite na stream da organização da conversa, e não em outra" do
      other_stream = "org:#{create(:organization).id}:chat:#{chat.id}"

      expect { create_message(content: "oi") }.not_to have_broadcasted_to(other_stream)
    end
  end

  describe "transmissão na atualização" do
    let!(:message) { create_message(content: "oi") }

    it "transmite quando as reações mudam" do
      expect { message.update(reactions: [ { "emoji" => "👍", "from" => "user" } ]) }.to have_broadcasted_to(message_stream).with(
        a_hash_including("id" => message.id.to_s, "reactions" => [ a_hash_including("emoji" => "👍") ])
      )
    end

    it "transmite quando o status muda" do
      expect { message.update(status: "read") }.to have_broadcasted_to(message_stream).with(
        a_hash_including("id" => message.id.to_s, "status" => "read")
      )
    end

    it "transmite quando é apagada para todos" do
      expect { message.update(deleted_at: Time.current, deleted_scope: "everyone") }.to have_broadcasted_to(message_stream).with(
        a_hash_including("id" => message.id.to_s, "deletedScope" => "everyone")
      )
    end

    it "não transmite quando nada relevante muda" do
      expect { message.update(content: "outro texto") }.not_to have_broadcasted_to(message_stream)
    end

    it "não transmite com ignore_events" do
      message.ignore_events = true

      expect { message.update(status: "read") }.not_to have_broadcasted_to(message_stream)
    end
  end

  describe "default_scope e list_for_chat" do
    # Mensagem dividida: `has_span` marca a original, que guarda o texto inteiro; `is_span`,
    # cada parte que foi de fato para o canal.
    let!(:plain) { create_message(role: "user", content: "normal") }
    let!(:original) { create_message(role: "assistant", content: "um\n\ndois", has_span: true) }
    let!(:first_part) { create_message(role: "assistant", content: "um", is_span: true) }
    let!(:second_part) { create_message(role: "assistant", content: "dois", is_span: true) }
    let!(:note) { create_message(role: "base", role_base_type: "assigned-user-notation", content: "nota") }
    let!(:tool_call) { create_message(role: "assistant", content: "", tool_calls: [ { "id" => "1" } ]) }
    let!(:tool_result) { create_message(role: "tool", content: "{}", tool_call_id: "1") }

    def ids(criteria)
      criteria.where(chat_id: chat.id).pluck(:id)
    end

    describe "default_scope, o que a automação lê" do
      it "traz a original e deixa de fora partes e notas" do
        expect(ids(described_class)).to contain_exactly(plain.id, original.id, tool_call.id, tool_result.id)
      end

      it "deixa de fora o que saiu de contexto" do
        plain.set(active: false)

        expect(ids(described_class)).not_to include(plain.id)
      end

      it "nasce ativa e sem ser parte, mesmo sem dizer nada" do
        expect(plain.reload).to have_attributes(active: true, is_span: false, has_span: false)
      end

      it "também vale nas subclasses" do
        expect(ids(ChatMessage::Text)).to include(plain.id)
        expect(ids(ChatMessage::Text)).not_to include(first_part.id, note.id)
      end
    end

    describe "unscoped" do
      it "enxerga tudo" do
        expect(ids(described_class.unscoped)).to contain_exactly(
          plain.id, original.id, first_part.id, second_part.id, note.id, tool_call.id, tool_result.id
        )
      end
    end

    describe "unscoped.list_for_chat, o que a tela lista" do
      it "traz as partes e nunca a original que as originou" do
        listed = ids(described_class.unscoped.list_for_chat)

        expect(listed).to include(plain.id, first_part.id, second_part.id, note.id)
        expect(listed).not_to include(original.id)
      end
    end

    describe "unscoped.visible" do
      it "tira da lista as chamadas de ferramenta" do
        listed = ids(described_class.unscoped.visible)

        expect(listed).to contain_exactly(plain.id, first_part.id, second_part.id, note.id)
      end
    end

    # A figurinha entra como parte de propósito: fora do contexto da IA, dentro da tela.
    describe "figurinha" do
      let!(:sticker) do
        create_message(ChatMessage::Media, media_type: "sticker", media_url: "https://cdn.exemplo.com/x.webp", has_span: false, is_span: true)
      end

      it "fica fora do default_scope" do
        expect(ids(described_class)).not_to include(sticker.id)
      end

      it "aparece em unscoped.list_for_chat" do
        listed = described_class.unscoped.list_for_chat.where(chat_id: chat.id, id: sticker.id)

        expect(listed.count).to eq(1)
        expect(listed.first.media_type).to eq("sticker")
      end
    end
  end

  describe "outros escopos" do
    it ".ia pega só o que saiu da plataforma pelo nosso lado" do
      ours = create_message(role: "assistant", content: "fluxo", message_origin: "platform")
      operator = create_message(role: "assistant", content: "pessoa", message_origin: "frontend")

      expect(described_class.ia.where(chat_id: chat.id).pluck(:id)).to include(ours.id)
      expect(described_class.ia.where(chat_id: chat.id).pluck(:id)).not_to include(operator.id)
    end

    it ".human pega as marcadas como intervenção humana" do
      human = create_message(role: "assistant", content: "pessoa", role_base_type: "human")
      create_message(role: "assistant", content: "fluxo")

      expect(described_class.human.where(chat_id: chat.id).pluck(:id)).to eq([ human.id ])
    end

    it ".within_range é fechado no início e aberto no fim" do
      inside = create_message(content: "dentro", created_at: Time.utc(2026, 11, 2, 12))
      create_message(content: "no fim", created_at: Time.utc(2026, 11, 3))
      create_message(content: "antes", created_at: Time.utc(2026, 11, 1, 23))

      range = [ Time.utc(2026, 11, 2), Time.utc(2026, 11, 3) ]

      expect(described_class.within_range(range).where(chat_id: chat.id).pluck(:id)).to eq([ inside.id ])
    end
  end

  describe "#type_element" do
    it "dá o tipo de cada subclasse" do
      expect(ChatMessage::Text.new.type_element).to eq("text")
      expect(ChatMessage::Image.new.type_element).to eq("image")
      expect(ChatMessage::Media.new.type_element).to eq("media")
      expect(ChatMessage::Audio.new.type_element).to eq("audio")
    end

    it "em Base cru é o nome da classe" do
      expect(described_class.new.type_element).to eq("ChatMessage::Base")
    end
  end

  describe "#media_url" do
    it "em imagem é a image_url" do
      expect(ChatMessage::Image.new(image_url: "/foto.jpg").media_url).to eq("/foto.jpg")
    end

    it "em áudio é a audio_url" do
      expect(ChatMessage::Audio.new(audio_url: "/a.ogg").media_url).to eq("/a.ogg")
    end
  end

  describe "#deleted?" do
    it "reflete deleted_at" do
      expect(ChatMessage::Text.new).not_to be_deleted
      expect(ChatMessage::Text.new(deleted_at: Time.current)).to be_deleted
    end
  end

  describe "validações" do
    it "recusa papel desconhecido" do
      expect(ChatMessage::Text.new(role: "robô", chat: chat)).not_to be_valid
    end

    it "exige a conversa" do
      message = ChatMessage::Text.new(role: "user")

      expect(message).not_to be_valid
      expect(message.errors[:chat]).to be_present
    end
  end

  describe "arquivo da mensagem" do
    include ActiveJob::TestHelper

    let(:blob) { ActiveStorage::Blob.create_and_upload!(io: StringIO.new("fake"), filename: "foto.jpg", content_type: "image/jpeg") }

    it "apagar a mensagem apaga o arquivo que pertence só a ela" do
      message = create_message(ChatMessage::Image, image_url: "/foto.jpg", media_blob_id: blob.id)

      expect { message.destroy }.to have_enqueued_job(ActiveStorage::PurgeJob).with(blob)
    end

    it "apagar mensagem sem arquivo não enfileira nada" do
      message = create_message(content: "oi")

      expect { message.destroy }.not_to have_enqueued_job(ActiveStorage::PurgeJob)
    end
  end
end
