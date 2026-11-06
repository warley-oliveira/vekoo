# frozen_string_literal: true

require "rails_helper"

# As duas traduções do mesmo filtro, sempre contra o Mongo de verdade: é o que descobre um cast
# faltando, porque o filtro errado não dá erro, só "nunca casa".
RSpec.describe Chats::Filters do
  let(:organization) { create(:organization) }
  let(:time_zone) { ActiveSupport::TimeZone["America/Sao_Paulo"] }

  def condition(key, operator, *values, value_type: nil, query_operator: "and")
    { attribute_key: key, filter_operator: operator, values: values, value_type: value_type, query_operator: query_operator }
  end

  def conditions_of(*raw)
    described_class.conditions(raw)
  end

  # O que a consulta acha.
  def by_query(*raw)
    query = described_class.query(conditions_of(*raw), time_zone: time_zone)
    Chat.where(organization_id: organization.id).where("$and" => [ query ]).pluck(:id)
  end

  # O que a expressão marca como `matched`, passando pela agregação de verdade.
  def by_expression(*raw)
    expression = described_class.expression(conditions_of(*raw), time_zone: time_zone)

    Chat.collection.aggregate(
      [
        { "$match" => { "organization_id" => organization.id.to_s } },
        # Como no controlador: sem condição que sobre, todas casam.
        { "$addFields" => { "matched" => expression || true } },
        { "$match" => { "matched" => true } }
      ]
    ).map { |row| row["_id"] }
  end

  # As duas saídas precisam concordar: o mesmo filtro serve às duas listas.
  def expect_both(*raw, to_find:)
    expect(by_query(*raw)).to match_array(to_find.map(&:id))
    expect(by_expression(*raw)).to match_array(to_find.map(&:id))
  end

  def chat_with(**attributes)
    create(:chat, organization: organization, **attributes)
  end

  describe ".conditions" do
    it "aceita a lista em forma de mapa, como vem da query" do
      parsed = described_class.conditions("0" => condition("status", "equal_to", "open"))

      expect(parsed.first.key).to eq("status")
    end

    it "lê chaves de ActionController::Parameters" do
      params = ActionController::Parameters.new("0" => condition("status", "equal_to", "open"))

      expect(described_class.conditions(params).first.values).to eq([ "open" ])
    end

    it "não deixa filtrar por campo fora da lista" do
      parsed = conditions_of(
        condition("organization_id", "equal_to", "outra"),
        condition("$where", "equal_to", "1"),
        condition("flow_data", "is_set"),
        condition("custom_attributes.a.b", "is_set"),
        condition("custom_attributes.$where", "is_set")
      )

      expect(parsed).to be_empty
    end

    it "aceita o nome em camelCase e o apelido de etiquetas" do
      parsed = conditions_of(condition("assignedAccountId", "is_set"), condition("tagIds", "is_set"), condition("customAttributes.faixaEtaria", "is_set"))

      expect(parsed.map(&:key)).to eq(%w[assigned_account_id chat_tag_ids custom_attributes.faixaEtaria])
    end

    it "descarta valor que não é escalar: um hash viraria operador do Mongo" do
      parsed = conditions_of(condition("status", "equal_to", { "$ne" => "x" }))

      expect(parsed).to be_empty
    end

    it "ignora condição sem valor, menos as de existência" do
      expect(conditions_of(condition("status", "equal_to"))).to be_empty
      expect(conditions_of(condition("status", "is_set")).size).to eq(1)
    end
  end

  describe "igualdade e lista" do
    it "equal_to casa com o texto" do
      open_chat = chat_with(status: "open")
      chat_with(status: "closed")

      expect_both(condition("status", "equal_to", "open"), to_find: [ open_chat ])
    end

    it "equal_to com `all` não filtra" do
      expect(described_class.query(conditions_of(condition("status", "equal_to", "all")))).to eq({})
      expect(described_class.expression(conditions_of(condition("status", "equal_to", "all")))).to be_nil
    end

    it "not_equal_to inclui quem não tem o campo" do
      assigned = chat_with(assigned_account_id: "pessoa-a")
      other = chat_with(assigned_account_id: "pessoa-b")
      none = chat_with

      expect_both(condition("assigned_account_id", "not_equal_to", "pessoa-a"), to_find: [ other, none ])
      expect(assigned).to be_persisted
    end

    it "converte para ObjectId: sem isso, o filtro nunca casa" do
      connector = create(:connector_web_widget, organization: organization)
      mine = chat_with(connector: connector)
      chat_with

      expect_both(condition("connector_id", "equal_to", connector.id.to_s), to_find: [ mine ])
    end

    it "ignora ObjectId inválido sem estourar" do
      chat_with

      expect_both(condition("connector_id", "equal_to", "não-é-id"), to_find: Chat.where(organization_id: organization.id).to_a)
    end

    it "lista casa por interseção" do
      vip = create(:chat_tag, organization_id: organization.id)
      novo = create(:chat_tag, organization_id: organization.id)
      tagged = chat_with(chat_tag_ids: [ vip.id ])
      chat_with(chat_tag_ids: [ novo.id ])
      chat_with

      expect_both(condition("chat_tag_ids", "contains", vip.id.to_s), to_find: [ tagged ])
    end

    it "converte para booleano" do
      paused = chat_with(automation_enabled: false)
      chat_with(automation_enabled: true)

      expect_both(condition("automation_enabled", "equal_to", "false"), to_find: [ paused ])
    end
  end

  describe "text_contains" do
    it "ignora caixa e não interpreta o valor como regex" do
      found = chat_with(custom_attributes: { "cidade" => "São (Paulo)" })
      chat_with(custom_attributes: { "cidade" => "São Paulo" })

      expect_both(condition("custom_attributes.cidade", "text_contains", "são (paulo)", value_type: "text"), to_find: [ found ])
    end

    it "não derruba a agregação com valor que não é texto" do
      found = chat_with(custom_attributes: { "volume" => 42 })
      chat_with(custom_attributes: { "volume" => { "raw" => 1 } })

      expect(by_expression(condition("custom_attributes.volume", "text_contains", "42"))).to eq([ found.id ])
    end
  end

  describe "is_set e is_empty" do
    let!(:filled) { chat_with(custom_attributes: { "plano" => "ouro" }) }
    let!(:blank) { chat_with(custom_attributes: { "plano" => "" }) }
    let!(:missing) { chat_with }

    it "is_set é presente, não nulo e não vazio" do
      expect_both(condition("custom_attributes.plano", "is_set"), to_find: [ filled ])
    end

    it "is_empty cobre ausente, nulo e vazio" do
      expect_both(condition("custom_attributes.plano", "is_empty"), to_find: [ blank, missing ])
    end

    it "em lista, vazia conta como não preenchida" do
      tag = create(:chat_tag, organization_id: organization.id)
      tagged = chat_with(chat_tag_ids: [ tag.id ])

      expect_both(condition("chat_tag_ids", "is_set"), to_find: [ tagged ])
      expect_both(condition("chat_tag_ids", "is_empty"), to_find: [ filled, blank, missing ])
    end
  end

  describe "faixas" do
    it "número em campo personalizado converte para comparar, porque está gravado como texto" do
      nine = chat_with(custom_attributes: { "idade" => "9" })
      thirty = chat_with(custom_attributes: { "idade" => "30" })

      # Como texto, "9" seria maior que "30".
      expect_both(condition("custom_attributes.idade", "is_greater_than", "10", value_type: "number"), to_find: [ thirty ])
      expect_both(condition("custom_attributes.idade", "is_less_than", "10", value_type: "number"), to_find: [ nine ])
    end

    it "número não traz quem não tem o campo nem quem não tem número" do
      chat_with
      chat_with(custom_attributes: { "idade" => "não informou" })
      nine = chat_with(custom_attributes: { "idade" => "9" })

      expect_both(condition("custom_attributes.idade", "is_less_than", "10", value_type: "number"), to_find: [ nine ])
    end

    it "campo personalizado de texto compara como texto" do
      found = chat_with(custom_attributes: { "plano" => "c" })
      chat_with(custom_attributes: { "plano" => "a" })

      expect_both(condition("custom_attributes.plano", "is_greater_than", "b", value_type: "text"), to_find: [ found ])
    end

    it "número inteiro de verdade também é convertido" do
      unread = chat_with(unread_messages: 3)
      chat_with(unread_messages: 0)

      expect_both(condition("unread_messages", "is_greater_than", "0"), to_find: [ unread ])
    end

    it "data compara como data" do
      recent = chat_with
      old = chat_with
      old.set(created_at: Time.utc(2020, 1, 1))

      expect_both(condition("created_at", "is_greater_than", "2021-01-01"), to_find: [ recent ])
      expect_both(condition("created_at", "is_less_than", "2021-01-01"), to_find: [ old ])
    end

    it "número que não é número descarta a condição" do
      expect(described_class.query(conditions_of(condition("custom_attributes.idade", "is_less_than", "abc", value_type: "number")))).to eq({})
    end
  end

  describe "datas por dia" do
    it "equal_to é o dia inteiro no fuso da organização, não em UTC" do
      # 23h30 de 05/11 em São Paulo é 06/11 em UTC.
      late_night = chat_with
      late_night.set(created_at: time_zone.parse("2026-11-05 23:30"))
      next_day = chat_with
      next_day.set(created_at: time_zone.parse("2026-11-06 00:30"))

      expect_both(condition("created_at", "equal_to", "2026-11-05"), to_find: [ late_night ])
    end

    it "ignora a condição com data inválida em vez de estourar 500" do
      expect(described_class.query(conditions_of(condition("created_at", "equal_to", "não-é-data")))).to eq({})
      expect(described_class.expression(conditions_of(condition("created_at", "equal_to", "não-é-data")))).to be_nil
    end
  end

  describe "combinação" do
    it "mantém o query_operator alinhado quando uma condição é descartada" do
      open_chat = chat_with(status: "open", audience_type: "whatsapp_api")
      instagram = chat_with(status: "closed", audience_type: "instagram")
      chat_with(status: "closed", audience_type: "whatsapp_api")

      # A 1ª condição cai (data inválida). O `or` da 3ª é dela, e continua valendo entre as duas que ficaram.
      expect_both(
        condition("created_at", "equal_to", "xx"),
        condition("status", "equal_to", "open"),
        condition("audience_type", "equal_to", "instagram", query_operator: "or"),
        to_find: [ open_chat, instagram ]
      )
    end

    it "ignora operador desconhecido sem derrubar os demais filtros" do
      web = chat_with(audience_type: "web")
      chat_with(audience_type: "instagram")

      expect_both(
        condition("status", "quem_sabe", "open"),
        condition("audience_type", "equal_to", "web"),
        to_find: [ web ]
      )
    end

    it "`and` exige as duas" do
      both = chat_with(status: "open", audience_type: "web")
      chat_with(status: "open", audience_type: "instagram")

      expect_both(condition("status", "equal_to", "open"), condition("audience_type", "equal_to", "web"), to_find: [ both ])
    end
  end
end
