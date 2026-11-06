require "rails_helper"

RSpec.describe Widget::ContextStore do
  let(:connector) { create(:connector_web_widget) }
  let(:chat) { create(:chat, connector: connector, external_id: "visitor-store-1", audience_type: "web", user_name: "Visitante") }

  def now
    Time.current.iso8601
  end

  describe ".apply" do
    it "devolve nil sem conversa ou sem contexto" do
      expect(described_class.apply(chat, nil)).to be_nil
      expect(described_class.apply(chat, {})).to be_nil
      expect(described_class.apply(nil, { "page" => {} })).to be_nil
    end

    it "substitui a seção inteira" do
      described_class.apply(chat, { "product" => { "name" => "A", "sku" => "S1", "captured_at" => now } })
      described_class.apply(chat, { "product" => { "name" => "B", "captured_at" => now } })

      chat.reload
      expect(chat.widget_context.dig("product", "name")).to eq("B")
      expect(chat.widget_context["product"]).not_to have_key("sku")
    end

    it "preserva as seções que não vieram" do
      described_class.apply(chat, { "product" => { "name" => "A", "captured_at" => now } })
      described_class.apply(chat, { "page" => { "title" => "Home", "captured_at" => now } })

      chat.reload
      expect(chat.widget_context.dig("product", "name")).to eq("A")
      expect(chat.widget_context.dig("page", "title")).to eq("Home")
    end

    it "acumula eventos sem repetir, guardando os 10 últimos" do
      first_batch = (1..8).map { |i| { "name" => "e#{i}", "at" => "t#{i}" } }
      second_batch = (5..14).map { |i| { "name" => "e#{i}", "at" => "t#{i}" } }

      described_class.apply(chat, { "events" => first_batch })
      described_class.apply(chat, { "events" => second_batch })

      names = chat.reload.widget_context["events"].map { |event| event["name"] }
      expect(names).to eq(%w[e5 e6 e7 e8 e9 e10 e11 e12 e13 e14])
    end

    it "considera eventos diferentes o mesmo nome em horários diferentes" do
      described_class.apply(chat, { "events" => [ { "name" => "view", "at" => "t1" } ] })
      described_class.apply(chat, { "events" => [ { "name" => "view", "at" => "t2" } ] })

      expect(chat.reload.widget_context["events"].size).to eq(2)
    end
  end

  describe "detecção de mudança" do
    it "acusa produto novo" do
      result = described_class.apply(chat, { "product" => { "name" => "A", "captured_at" => now } })

      expect(result.changed_sections).to eq([ "product" ])
      expect(result).to be_changed
    end

    it "ignora diferença só no carimbo captured_at" do
      described_class.apply(chat, { "product" => { "name" => "A", "captured_at" => 1.hour.ago.iso8601 } })

      result = described_class.apply(chat, { "product" => { "name" => "A", "captured_at" => now } })

      expect(result.changed_sections).to eq([])
      expect(result).not_to be_changed
    end

    it "acusa página e eventos de forma independente" do
      described_class.apply(chat, { "page" => { "url" => "https://a.com", "captured_at" => now } })

      result = described_class.apply(
        chat,
        {
          "page" => { "url" => "https://b.com", "captured_at" => now },
          "events" => [ { "name" => "add_to_cart", "at" => "t1" } ]
        }
      )

      expect(result.changed_sections).to contain_exactly("page", "events")
    end

    it "não acusa evento já conhecido" do
      described_class.apply(chat, { "events" => [ { "name" => "view", "at" => "t1" } ] })

      result = described_class.apply(chat, { "events" => [ { "name" => "view", "at" => "t1" } ] })

      expect(result.changed_sections).to eq([])
    end

    it "devolve o contexto já mesclado" do
      described_class.apply(chat, { "product" => { "name" => "A", "captured_at" => now } })

      result = described_class.apply(chat, { "page" => { "title" => "Home", "captured_at" => now } })

      expect(result.context.dig("product", "name")).to eq("A")
      expect(result.context.dig("page", "title")).to eq("Home")
    end
  end

  context "com identidade verificada" do
    let(:visitor) do
      { "visitor" => { "external_id" => "c1", "name" => "Ana", "email" => "ana@ex.com", "phone" => "+5511999999999", "verified" => true } }
    end

    it "preenche o nome e os dados de contato" do
      described_class.apply(chat, visitor)

      chat.reload
      expect(chat.user_name).to eq("Ana")
      expect(chat.custom_attributes["email"]).to eq("ana@ex.com")
      expect(chat.custom_attributes["phone"]).to eq("+5511999999999")
    end

    it "não sobrescreve um nome de verdade" do
      chat.set(user_name: "Maria")

      described_class.apply(chat, visitor)

      expect(chat.reload.user_name).to eq("Maria")
    end

    it "preenche o nome quando a conversa não tem nenhum" do
      chat.set(user_name: nil)

      described_class.apply(chat, visitor)

      expect(chat.reload.user_name).to eq("Ana")
    end
  end

  context "com identidade não verificada" do
    it "guarda só no contexto, sem tocar nos dados de contato" do
      described_class.apply(chat, { "visitor" => { "name" => "Impostor", "email" => "fake@ex.com", "verified" => false } })

      chat.reload
      expect(chat.user_name).to eq("Visitante")
      expect(chat.custom_attributes["email"]).to be_nil
      expect(chat.widget_context.dig("visitor", "name")).to eq("Impostor")
    end
  end
end
