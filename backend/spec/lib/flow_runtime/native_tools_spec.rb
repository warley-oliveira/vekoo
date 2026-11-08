require "rails_helper"

# As ferramentas nativas do bloco "Conversa com IA", em Ruby e contra o banco de verdade: agenda, catálogo, contato,
# etiquetas e pipeline. O que importa aqui é o escopo (outra organização e outro contato não existem) e o teste do editor
# (o que mexe em agenda e pipeline é simulado).
RSpec.describe FlowRuntime::NativeTools do
  let(:organization) { create(:organization) }
  let(:other_organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization, user_name: "Fernanda Lima", external_id: "5541999990001") }
  let(:other_chat) { create(:chat, organization: organization, user_name: "Outro contato", external_id: "5541999990002") }

  def tools(groups, chat: self.chat, playground: false)
    described_class.new(organization: organization, chat: chat, groups: groups, playground: playground)
  end

  # Sem palavras-chave: a entrada tem chaves em texto, e o Ruby as tomaria por opções.
  def call(name, input = {}, options = {})
    set = tools(options.fetch(:groups, described_class::GROUPS), chat: options.fetch(:chat, chat), playground: options.fetch(:playground, false))
    set.run(name, input).deep_stringify_keys
  end

  describe ".availability" do
    it "diz o que a organização tem com o que usar" do
      create(:product_item, organization: organization)
      groups = described_class.availability(organization).to_h { |group| [ group[:key], group[:available] ] }

      expect(groups).to eq("agenda" => false, "catalog" => true, "contact" => true, "tags" => true, "pipeline" => false)
      expect(described_class.availability(organization).find { |group| group[:key] == "agenda" }[:tools]).to include("agenda_create_booking")
    end
  end

  it "só oferece os grupos escolhidos, e grupo sem dado nenhum não entra" do
    expect(tools(%w[contact tags]).tools.map(&:name)).to eq(%w[contact_get contact_update tags_list tag_add tag_remove])
    expect(tools(%w[agenda]).tools).to be_empty
    expect(tools(%w[inexistente]).tools).to be_empty
  end

  it "recusa ferramenta de grupo que o bloco não escolheu" do
    expect(call("tags_list", {}, groups: %w[contact])).to eq("error" => "Unknown tool tags_list")
  end

  describe "agenda" do
    let(:calendar) { create(:agenda_calendar, organization_id: organization.id.to_s) }
    let(:professional) { create(:agenda_professional, :with_rule, calendar: calendar, name: "Camila") }
    let(:service) { create(:agenda_offering, calendar: calendar, name: "Limpeza de pele", professionals: [ professional ]) }
    let(:tuesday) { Date.current.next_occurring(:tuesday) }

    before { professional.update!(service_ids: [ service.id ]) }

    it "lista, consulta horários, marca, lista e cancela um horário do contato" do
      expect(call("agenda_list_services")["services"]).to eq([ { "service_name" => "Limpeza de pele", "duration" => 60 } ])
      expect(call("agenda_list_professionals")["professionals"]).to eq([ { "name" => "Camila", "services" => [ "Limpeza de pele" ] } ])

      slots = call("agenda_available_slots", "service_name" => "Limpeza de pele", "date_start" => tuesday.iso8601)
      expect(slots["available_slots"].values.flatten).to include("10:00")

      created = call("agenda_create_booking", "service_name" => "Limpeza de pele", "professional_name" => "Camila", "start_time" => "#{tuesday} 10:00")
      expect(created).to include("success" => true)
      booking = chat.bookings.find(created["booking_id"])

      expect(call("agenda_list_bookings")["bookings"].first).to include("id" => booking.id.to_s, "service_name" => "Limpeza de pele")
      expect(call("agenda_cancel_booking", "booking_id" => booking.id.to_s)).to eq("message" => "Booking canceled successfully")
      expect(booking.reload.status).to eq("canceled")
    end

    it "não cancela o horário de outro contato, mesmo com o id certo" do
      booking = create(:agenda_booking, calendar: calendar, chat: other_chat, professional: professional, service: service)

      expect(call("agenda_cancel_booking", "booking_id" => booking.id.to_s)).to eq("error" => "Booking not found among this contact's bookings")
      expect(booking.reload.status).not_to eq("canceled")
    end

    it "diz o dia e a hora no fuso da agenda" do
      calendar
      expect(tools(%w[agenda]).agenda_clock).to match(/America\/Sao_Paulo.*\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
    end

    it "no teste do editor, marcar não marca nada" do
      result = call("agenda_create_booking", { "service_name" => "Limpeza de pele", "professional_name" => "Camila", "start_time" => "#{tuesday} 10:00" }, playground: true)

      expect(result).to include("ok" => true, "simulated" => true)
      expect(Agenda::Booking.where(calendar_id: calendar.id).count).to eq(0)
    end
  end

  describe "catálogo" do
    it "busca só no catálogo da organização, e abre o item pelo id" do
      item = create(:product_item, organization: organization, title: "Vestido midi de linho", summary: "Linho puro")
      create(:product_item, organization: other_organization, title: "Vestido de outra loja")

      found = call("catalog_search", "query" => "vestido")
      expect(found["items"].pluck("title")).to eq([ "Vestido midi de linho" ])

      expect(call("catalog_get_item", "item" => item.id)).to include("title" => "Vestido midi de linho", "summary" => "Linho puro")
      expect(call("catalog_get_item", "item" => create(:product_item, organization: other_organization).id)).to eq("error" => "Item not found")
    end
  end

  describe "contato" do
    let!(:field) { create(:custom_field, organization_id: organization.id.to_s, name: "Cidade", key: "cidade") }

    it "lê o que se sabe e grava nome e campos conhecidos" do
      expect(call("contact_get")).to include("name" => "Fernanda Lima", "phone" => chat.phone_number, "available_fields" => [ { "key" => "cidade", "label" => "Cidade" } ])

      expect(call("contact_update", "name" => "Fernanda Lima Souza", "fields" => { "cidade" => "Curitiba" })).to include("ok" => true)
      expect(chat.reload).to have_attributes(user_name: "Fernanda Lima Souza")
      expect(chat.custom_attributes["cidade"]).to eq("Curitiba")
      expect(call("contact_get")["fields"]).to eq("cidade" => { "label" => "Cidade", "value" => "Curitiba" })
    end

    it "recusa campo que a organização não tem" do
      expect(call("contact_update", "fields" => { "senha" => "x" })).to include("error" => "Unknown fields: senha", "available_fields" => [ "cidade" ])
    end
  end

  describe "etiquetas" do
    let!(:tag) { create(:chat_tag, organization_id: organization.id.to_s, name: "cliente-vip", description: "Comprou mais de 3 vezes") }

    it "põe e tira só etiqueta que já existe na organização" do
      create(:chat_tag, organization_id: other_organization.id.to_s, name: "de-outra-loja")

      expect(call("tags_list")["available"]).to eq([ { "name" => "cliente-vip", "description" => "Comprou mais de 3 vezes" } ])
      expect(call("tag_add", "name" => "Cliente VIP")).to eq("ok" => true, "tag" => "cliente-vip")
      expect(chat.reload.chat_tag_ids).to eq([ tag.id ])
      expect(call("tag_add", "name" => "de-outra-loja")).to include("error" => "Tag not found")
      expect(call("tag_remove", "name" => "cliente-vip")).to eq("ok" => true, "removed" => "cliente-vip")
      expect(chat.reload.chat_tag_ids).to be_empty
    end
  end

  describe "pipeline" do
    let(:board) { create(:pipeline_board, organization: organization, name: "Vendas") }
    let!(:first_stage) { create(:pipeline_stage, board: board, name: "Novo", position: 1) }
    let!(:second_stage) { create(:pipeline_stage, board: board, name: "Proposta", position: 2) }

    it "cria um card do contato, lista e move" do
      expect(call("pipeline_list_boards")).to eq("boards" => [ { "name" => "Vendas", "stages" => %w[Novo Proposta] } ])

      created = call("pipeline_create_card", "board" => "vendas", "title" => "Orçamento de vestido", "deal_value" => 320)
      expect(created).to include("ok" => true, "stage" => "Novo")
      card = Pipelines::Card.find(created["card_id"])
      expect(card).to have_attributes(chat_id: chat.id.to_s, deal_value: 320)

      expect(call("pipeline_list_cards")["cards"]).to eq([ { "id" => card.id, "title" => "Orçamento de vestido", "board" => "Vendas", "stage" => "Novo", "status" => "open", "deal_value" => 320.0 } ])
      expect(call("pipeline_move_card", "card_id" => card.id, "stage" => "proposta")).to eq("ok" => true, "stage" => "Proposta")
      expect(card.reload.stage_id).to eq(second_stage.id)
    end

    it "não move card de outro contato, e não acha quadro de outra organização" do
      card = create(:pipeline_card, stage: first_stage, organization_id: organization.id, chat_id: other_chat.id.to_s)
      create(:pipeline_board, organization: other_organization, name: "Alheio")

      expect(call("pipeline_move_card", "card_id" => card.id, "stage" => "Proposta")).to eq("error" => "Card not found among this contact's cards")
      expect(call("pipeline_create_card", "board" => "Alheio", "title" => "x")).to include("error" => "Pipeline not found", "available" => [ "Vendas" ])
    end

    it "no teste do editor, criar card não cria nada" do
      expect(call("pipeline_create_card", { "board" => "Vendas", "title" => "Teste" }, playground: true)).to include("simulated" => true)
      expect(Pipelines::Card.count).to eq(0)
    end
  end

  it "sem conversa, o que depende do contato avisa em vez de levantar" do
    expect(call("contact_get", {}, chat: nil)).to eq("error" => "This tool needs a conversation")
  end
end
