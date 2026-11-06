require "rails_helper"

RSpec.describe "Widget::V1::Messages", type: :request do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_web_widget, organization: organization) }
  let(:visitor_id) { "visitor-msg-1" }
  let(:widget_headers) { { "Authorization" => "Bearer #{connector.issue_visitor_jwt(visitor_id)}" } }

  before { allow(Flows::InboundDispatcher).to receive(:call) }

  def send_message(content = "olá", **extras)
    post "/widget/v1/messages", params: { content: content, **extras }, headers: widget_headers, as: :json
  end

  def visitor_chat
    Chat.where(connector_id: connector.id, external_id: visitor_id).take
  end

  def history(chat = visitor_chat)
    ChatMessage::Base.where(chat_id: chat.id).order_by(created_at: :asc)
  end

  describe "POST /widget/v1/messages" do
    describe "autenticação" do
      it "responde 401 sem token" do
        post "/widget/v1/messages", params: { content: "olá" }, as: :json

        expect(response).to have_http_status(:unauthorized)
      end

      it "responde 401 com JWT assinado por outro conector" do
        other = create(:connector_web_widget)
        foreign = JWT.encode({ visitor_id: visitor_id, connector_id: connector.id.to_s, exp: 1.hour.from_now.to_i }, other.signing_secret, "HS256")

        post "/widget/v1/messages", params: { content: "olá" }, headers: { "Authorization" => "Bearer #{foreign}" }, as: :json

        expect(response).to have_http_status(:unauthorized)
      end

      it "responde 401 com JWT vencido" do
        expired = connector.issue_visitor_jwt(visitor_id, ttl: -1.second)

        post "/widget/v1/messages", params: { content: "olá" }, headers: { "Authorization" => "Bearer #{expired}" }, as: :json

        expect(response).to have_http_status(:unauthorized)
      end
    end

    describe "validação" do
      it "responde 400 com conteúdo em branco, sem criar conversa" do
        send_message("   ")

        expect(response).to have_http_status(:bad_request)
        expect(json["error"]).to include("code" => "contentRequired", "field" => "content")
        expect(visitor_chat).to be_nil
      end

      it "responde 400 sem conteúdo" do
        post "/widget/v1/messages", params: {}, headers: widget_headers, as: :json

        expect(response).to have_http_status(:bad_request)
      end

      it "responde 422 com conteúdo longo demais" do
        send_message("x" * (WidgetThrottling::MAX_CONTENT_LENGTH + 1))

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "contentTooLong", "field" => "content")
        expect(visitor_chat).to be_nil
      end

      it "aceita o tamanho máximo exato" do
        send_message("x" * WidgetThrottling::MAX_CONTENT_LENGTH)

        expect(response).to have_http_status(:created)
      end
    end

    describe "conversa" do
      it "cria a conversa do visitante, na organização do conector, na primeira mensagem" do
        expect { send_message }.to change { Chat.where(connector_id: connector.id).count }.by(1)

        expect(response).to have_http_status(:created)
        expect(visitor_chat).to have_attributes(
          external_id: visitor_id,
          audience_type: "web",
          organization_id: organization.id,
          automation_enabled: true,
          user_name: "Visitante"
        )
      end

      it "responde em camelCase" do
        send_message

        expect(json).to eq(
          "messageId" => history.first.id.to_s,
          "chatId" => visitor_chat.id.to_s,
          "status" => "queued"
        )
      end

      it "usa o nome informado, cortado no limite" do
        send_message("olá", visitorName: "A" * 200)

        expect(visitor_chat.user_name.length).to eq(WidgetThrottling::MAX_NAME_LENGTH)
      end

      it "nasce com a automação padrão da organização" do
        organization.update!(settings: { "default_automation_enabled" => false })

        send_message

        expect(visitor_chat.automation_enabled).to be(false)
      end

      it "aceita a mensagem de conector cuja organização sumiu, sem chamar o dispatcher" do
        connector
        Organization.where(id: organization.id).delete_all

        send_message

        expect(response).to have_http_status(:created)
        expect(visitor_chat.automation_enabled).to be(true)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "grava a mensagem do visitante" do
        send_message("mensagem do visitante")

        message = history.first
        expect(message).to be_a(ChatMessage::Text)
        expect(message).to have_attributes(role: "user", content: "mensagem do visitante", sender_name: "Visitante", message_origin: "platform")
      end

      it "tira os espaços das pontas" do
        send_message("  olá  ")

        expect(history.first.content).to eq("olá")
      end

      it "guarda o id que o cliente gerou" do
        send_message("olá", clientMessageId: "cliente-1")

        expect(history.first.message_id).to eq("cliente-1")
      end

      it "reaproveita a conversa nas mensagens seguintes" do
        send_message("primeira")
        send_message("segunda")

        expect(Chat.where(connector_id: connector.id).count).to eq(1)
        expect(history.count).to eq(2)
      end

      it "atualiza a prévia da lista e conta como não lida" do
        send_message("primeira")
        send_message("segunda")

        expect(visitor_chat).to have_attributes(
          last_message_content: "segunda",
          last_message_by: "user",
          last_message_type: "text",
          unread_messages: 2
        )
      end

      it "separa as conversas por visitante" do
        send_message

        other = connector.issue_visitor_jwt("visitor-msg-2")
        post "/widget/v1/messages", params: { content: "oi" }, headers: { "Authorization" => "Bearer #{other}" }, as: :json

        expect(Chat.where(connector_id: connector.id).count).to eq(2)
      end
    end

    describe "tempo real" do
      it "anuncia a conversa nova no stream do visitante" do
        expect { send_message }
          .to have_broadcasted_to(connector.visitor_stream(visitor_id))
          .with(hash_including(type: "chat_created"))
      end

      it "não anuncia de novo quando a conversa já existe" do
        send_message

        expect { send_message("segunda") }
          .not_to have_broadcasted_to(connector.visitor_stream(visitor_id))
          .with(hash_including(type: "chat_created"))
      end

      # O socket assina o stream antes de a primeira mensagem existir. O eco precisa sair no
      # mesmo stream, e não num stream por conversa.
      it "ecoa a mensagem do visitante no mesmo stream" do
        expect { send_message }
          .to have_broadcasted_to(connector.visitor_stream(visitor_id))
          .with(hash_including(type: "message", role: "user", content: "olá"))
      end

      it "manda o eco em camelCase" do
        expect { send_message }
          .to have_broadcasted_to(connector.visitor_stream(visitor_id))
          .with(a_hash_including("messageId" => a_kind_of(String), "sentAt" => a_kind_of(String)))
      end

      it "transmite para a tela de atendimento no stream da conversa" do
        send_message("primeira")

        expect { send_message("segunda") }
          .to have_broadcasted_to(ChatMessage::Base.stream_for(visitor_chat))
          .with(hash_including(content: "segunda", role: "user"))
      end
    end

    describe "automação" do
      it "avisa first_message na primeira mensagem" do
        send_message("olá", clientMessageId: "cliente-1")

        expect(Flows::InboundDispatcher).to have_received(:call).with(
          chat: visitor_chat, text: "olá", event: "first_message", message_id: "cliente-1"
        )
      end

      it "avisa message_received nas seguintes" do
        send_message("primeira")
        send_message("segunda")

        expect(Flows::InboundDispatcher).to have_received(:call).with(
          chat: visitor_chat, text: "segunda", event: "message_received", message_id: nil
        )
      end

      # O widget manda o contexto da página em toda mensagem. O cartão de contexto e a
      # abordagem proativa entram no histórico antes, e não são a primeira mensagem do visitante.
      it "avisa first_message mesmo com contexto da página na primeira mensagem" do
        send_message("olá", context: { product: { name: "Tênis X" } })

        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "first_message"))
      end

      it "avisa first_message mesmo com a abordagem proativa na primeira mensagem" do
        send_message("olá", proactiveMessage: "Posso ajudar?")

        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "first_message"))
      end

      it "avisa first_message quando o cartão de contexto chegou antes da primeira mensagem" do
        chat = create(:chat, connector: connector, external_id: visitor_id, organization_id: organization.id)
        Widget::ContextHistoryWriter.record(chat, { "product" => { "name" => "Tênis X" } })

        send_message

        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "first_message"))
      end

      it "não chama o dispatcher com a automação da conversa desligada" do
        organization.update!(settings: { "default_automation_enabled" => false })

        send_message

        expect(response).to have_http_status(:created)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "não chama o dispatcher com a automação da organização desligada" do
        organization.update!(settings: { "automation_enabled" => false })

        send_message

        expect(response).to have_http_status(:created)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end
    end

    describe "limite por minuto do conector" do
      before { connector.update!(rate_limit_per_min: 2) }

      it "corta quando o visitante chega ao teto" do
        2.times do |i|
          send_message("msg #{i}")

          expect(response).to have_http_status(:created)
        end

        send_message("transbordo")

        expect(response).to have_http_status(:too_many_requests)
        expect(json.dig("error", "code")).to eq("rateLimited")
        expect(history.count).to eq(2)
      end

      it "libera de novo depois de um minuto" do
        2.times { |i| send_message("msg #{i}") }
        history.each { |message| message.set(created_at: 2.minutes.ago) }

        send_message("voltei")

        expect(response).to have_http_status(:created)
      end
    end

    describe "contexto da página" do
      let(:context_params) do
        {
          page: { url: "https://loja.com/produtos/tenis-x", title: "Tênis X — Loja" },
          product: {
            name: "Tênis X",
            price: "199.90",
            currency: "BRL",
            url: "https://loja.com/produtos/tenis-x",
            image_url: "https://cdn.loja.com/tenis-x.jpg"
          }
        }
      end

      it "guarda o contexto higienizado na conversa e na mensagem do visitante" do
        send_message("quanto custa?", context: context_params)

        expect(response).to have_http_status(:created)

        context = visitor_chat.widget_context
        expect(context.dig("product", "name")).to eq("Tênis X")
        expect(context.dig("product", "image_url")).to eq("https://cdn.loja.com/tenis-x.jpg")
        expect(context.dig("product", "captured_at")).to be_present
        expect(context.dig("page", "url")).to eq("https://loja.com/produtos/tenis-x")

        message = history.where(role: "user").first
        expect(message.context_message.dig("product", "name")).to eq("Tênis X")
      end

      it "manda o contexto no eco ao visitante" do
        expect { send_message("quanto custa?", context: context_params) }
          .to have_broadcasted_to(connector.visitor_stream(visitor_id))
          .with(a_hash_including("context" => a_hash_including("product" => a_hash_including("name" => "Tênis X"))))
      end

      it "descarta chaves fora da lista e as que começam com $" do
        send_message("oi", context: { product: { name: "X", "$where" => "sleep(1000)", evil: "sim" } })

        expect(visitor_chat.widget_context["product"].keys).to contain_exactly("name", "captured_at")
      end

      it "responde 422 com contexto grande demais, sem criar conversa" do
        send_message("oi", context: { product: { description: "a" * 9_000 } })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("contextTooLarge")
        expect(visitor_chat).to be_nil
      end

      it "grava o cartão de contexto quando o contexto muda" do
        send_message("quanto custa?", context: context_params)

        card = history.where(role: "system", role_base_type: "widget-context").first
        expect(card).to be_present
        expect(card.message_origin).to eq("widget_context")
        expect(card.content).to include("Tênis X")
        expect(card.context_message.dig("product", "name")).to eq("Tênis X")
      end

      it "põe o cartão antes da mensagem do visitante" do
        send_message("quanto custa?", context: context_params)

        expect(history.pluck(:role)).to eq(%w[system user])
      end

      it "não repete o cartão quando o contexto não mudou" do
        2.times { |i| send_message("msg #{i}", context: context_params) }

        expect(history.where(role_base_type: "widget-context").count).to eq(1)
      end

      it "grava outro cartão quando o produto muda" do
        send_message("msg", context: context_params)
        send_message("msg", context: { product: { name: "Tênis Y" } })

        expect(history.where(role_base_type: "widget-context").count).to eq(2)
      end

      it "não guarda nada quando nada sobra da higienização" do
        send_message("oi", context: { product: { "$where" => "x" } })

        expect(response).to have_http_status(:created)
        expect(visitor_chat.widget_context).to eq({})
        expect(history.pluck(:role)).to eq(%w[user])
      end
    end

    describe "abordagem proativa" do
      it "guarda a abordagem como mensagem nossa, antes da resposta do visitante" do
        send_message("quero saber mais", proactiveMessage: "Posso ajudar com o Tênis X?")

        messages = history.to_a
        expect(messages.map(&:role)).to eq(%w[assistant user])
        expect(messages.first.content).to eq("Posso ajudar com o Tênis X?")
        expect(messages.first.message_origin).to eq("widget_proactive")
        expect(messages.first.sender_name).to eq(connector.bot_display_name)
      end

      it "mantém a prévia na mensagem do visitante" do
        send_message("quero saber mais", proactiveMessage: "Oferta especial!")

        expect(visitor_chat).to have_attributes(last_message_by: "user", last_message_content: "quero saber mais")
      end

      it "não repete o mesmo texto numa retentativa" do
        2.times { |i| send_message("msg #{i}", proactiveMessage: "Oferta especial!") }

        expect(history.where(message_origin: "widget_proactive").count).to eq(1)
      end

      it "aceita o mesmo texto de novo fora da janela de retentativa" do
        send_message("oi", proactiveMessage: "Oferta especial!")
        history.where(message_origin: "widget_proactive").first.set(created_at: 5.minutes.ago)

        send_message("voltei", proactiveMessage: "Oferta especial!")

        expect(history.where(message_origin: "widget_proactive").count).to eq(2)
      end

      it "aceita outro texto dentro da janela" do
        send_message("oi", proactiveMessage: "Oferta especial!")
        send_message("voltei", proactiveMessage: "Frete grátis!")

        expect(history.where(message_origin: "widget_proactive").count).to eq(2)
      end

      it "corta o texto em 500 caracteres" do
        send_message("oi", proactiveMessage: "x" * 600)

        expect(history.where(message_origin: "widget_proactive").first.content.length).to eq(500)
      end

      it "não guarda abordagem em branco" do
        send_message("oi", proactiveMessage: "   ")

        expect(history.pluck(:role)).to eq(%w[user])
      end

      it "não transmite a abordagem ao visitante, que já a viu" do
        expect { send_message("oi", proactiveMessage: "Oferta especial!") }
          .not_to have_broadcasted_to(connector.visitor_stream(visitor_id))
          .with(hash_including(content: "Oferta especial!"))
      end
    end
  end

  describe "GET /widget/v1/messages" do
    def list(**params)
      get "/widget/v1/messages", params: params, headers: widget_headers
    end

    it "responde 401 sem token" do
      get "/widget/v1/messages"

      expect(response).to have_http_status(:unauthorized)
    end

    it "devolve lista vazia sem conversa" do
      list

      expect(response).to have_http_status(:ok)
      expect(json["messages"]).to eq([])
    end

    it "devolve as mensagens do visitante em camelCase" do
      send_message("a", context: { product: { name: "Tênis X" } })
      send_message("b")

      list

      expect(json["messages"].map { |message| message["content"] }).to eq(%w[a b])
      expect(json["messages"].first).to include(
        "id" => a_kind_of(String),
        "role" => "user",
        "senderName" => "Visitante",
        "createdAt" => a_kind_of(String),
        "context" => a_hash_including("product" => a_hash_including("name" => "Tênis X"))
      )
    end

    it "não mostra ao visitante o cartão de contexto nem as notas" do
      send_message("a", context: { product: { name: "Tênis X" } })
      create(:chat_text_message, chat: visitor_chat, role: "base", content: "nota interna")

      list

      expect(json["messages"].map { |message| message["role"] }).to eq(%w[user])
    end

    it "mostra a abordagem proativa respondida" do
      send_message("a", proactiveMessage: "Oferta!")

      list

      expect(json["messages"].map { |message| message["content"] }).to eq(%w[Oferta! a])
    end

    it "não mostra a conversa de outro visitante" do
      send_message("minha")

      other = connector.issue_visitor_jwt("visitor-msg-2")
      get "/widget/v1/messages", headers: { "Authorization" => "Bearer #{other}" }

      expect(json["messages"]).to eq([])
    end

    it "traz as 100 mais recentes quando o histórico passa do limite" do
      send_message("primeira")
      105.times do |i|
        ChatMessage::Text.create!(
          role: "user",
          content: "extra #{i}",
          chat: visitor_chat,
          ignore_events: true,
          created_at: Time.current + (i + 1).seconds
        )
      end

      list

      contents = json["messages"].map { |message| message["content"] }
      expect(contents.length).to eq(100)
      expect(contents.last).to eq("extra 104")
      expect(contents).not_to include("primeira")
    end

    describe "?since=" do
      before do
        send_message("antiga")
        history.first.set(created_at: 1.minute.ago)
        send_message("nova")
      end

      it "traz só o que veio depois da mensagem informada" do
        list(since: history.first.id.to_s)

        expect(json["messages"].map { |message| message["content"] }).to eq(%w[nova])
      end

      it "ignora id desconhecido" do
        list(since: BSON::ObjectId.new.to_s)

        expect(json["messages"].map { |message| message["content"] }).to eq(%w[antiga nova])
      end

      it "ignora id de mensagem de outra conversa" do
        other = create(:chat_text_message, chat: create(:chat, connector: connector), created_at: 1.hour.from_now)

        list(since: other.id.to_s)

        expect(json["messages"].map { |message| message["content"] }).to eq(%w[antiga nova])
      end
    end
  end
end
