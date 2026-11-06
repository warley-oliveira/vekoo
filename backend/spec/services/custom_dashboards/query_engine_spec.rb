require "rails_helper"

# Pipeline de agregação de verdade, no Mongo de teste, sem dublê.
RSpec.describe CustomDashboards::QueryEngine do
  let(:organization) { create(:organization) }
  let(:other_organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:zone) { organization.reporting_zone }

  def execute(data_source, base = {}, as: account, **query)
    described_class.execute(account: as, data_source: data_source, query: base.deep_stringify_keys.merge(query.deep_stringify_keys))
  end

  def count_metric(label = "Total", **extra)
    { "aggregation" => "count", "label" => label, **extra.deep_stringify_keys }
  end

  describe "dimensão por campo personalizado + métricas condicionais" do
    let!(:tag) { create(:chat_tag, name: "tag-agendou", organization_id: organization.id) }
    let(:query) do
      {
        "dimensions" => [ { "field" => "custom_attributes.origem_campanha" } ],
        "metrics" => [
          count_metric("Total"),
          count_metric("Com tag", filters: [ { field: "tags", operator: "in", value: [ "tag-agendou" ] } ])
        ],
        "sort" => { "field" => "Total", "direction" => "desc" }
      }
    end

    before do
      2.times { create(:chat, organization: organization, custom_attributes: { "origem_campanha" => "instagram" }, chat_tag_ids: [ tag.id ]) }
      create(:chat, organization: organization, custom_attributes: { "origem_campanha" => "instagram" })
      2.times { create(:chat, organization: organization, custom_attributes: { "origem_campanha" => "google" }) }
      create(:chat, organization: organization)
    end

    it "agrupa pelos valores do atributo, com contagem total e condicional por etiqueta" do
      expect(execute("conversations", query)[:rows]).to eq(
        [
          { "custom_attributes.origem_campanha" => "instagram", "Total" => 3, "Com tag" => 2 },
          { "custom_attributes.origem_campanha" => "google", "Total" => 2, "Com tag" => 0 },
          { "custom_attributes.origem_campanha" => "__empty__", "Total" => 1, "Com tag" => 0 }
        ]
      )
    end

    it "expõe as colunas na ordem dimensão → métricas" do
      expect(execute("conversations", query)[:columns]).to eq([ "custom_attributes.origem_campanha", "Total", "Com tag" ])
    end

    it "não vaza dados de outra organização" do
      create(:chat, organization: other_organization, custom_attributes: { "origem_campanha" => "instagram" })

      instagram = execute("conversations", query)[:rows].find { |row| row["custom_attributes.origem_campanha"] == "instagram" }

      expect(instagram["Total"]).to eq(3)
    end

    it "zera a coluna quando a etiqueta do filtro é de outra organização" do
      create(:chat_tag, name: "tag-exclusiva", organization_id: other_organization.id)

      rows = execute("conversations", query.except("sort").merge("metrics" => [ count_metric("Com tag", filters: [ { field: "tags", operator: "in", value: [ "tag-exclusiva" ] } ]) ]))[:rows]

      expect(rows.sum { |row| row["Com tag"] }).to eq(0)
    end

    it "valor não escalar no atributo cai no balde de inválido" do
      create(:chat, organization: organization, custom_attributes: { "origem_campanha" => { "a" => 1 } })

      expect(execute("conversations", query)[:rows].map { |row| row["custom_attributes.origem_campanha"] }).to include("__invalid__")
    end

    it "texto vazio é valor próprio, e não o balde de vazio" do
      create(:chat, organization: organization, custom_attributes: { "origem_campanha" => "" })

      expect(execute("conversations", query)[:rows].map { |row| row["custom_attributes.origem_campanha"] }).to include("", "__empty__")
    end

    it "dá nome ao campo só com o que é da organização, e ignora o que foi apagado" do
      create(:custom_field, organization_id: organization.id, name: "Origem Campanha")
      create(:custom_field, organization_id: other_organization.id, name: "Cidade")

      labels = execute("conversations", dimensions: [ { field: "custom_attributes.origem_campanha" }, { field: "custom_attributes.cidade" } ], metrics: [ count_metric ])[:field_labels]

      expect(labels).to include("custom_attributes.origem_campanha" => "Origem Campanha")
      expect(labels).not_to have_key("custom_attributes.cidade")
    end
  end

  describe "operadores de filtro" do
    before do
      create(:chat, organization: organization, user_name: "Ana Maria", status: "open", unread_messages: 5, custom_attributes: { "volume" => "30", "cidade" => "BH" })
      create(:chat, organization: organization, user_name: "Bruno", status: "closed", unread_messages: 0, custom_attributes: { "volume" => "20 a 40/dia" })
      create(:chat, organization: organization, user_name: "Carla", status: "open", unread_messages: 2, custom_attributes: { "volume" => "sem número" })
    end

    def names(filter)
      execute("conversations", filters: [ filter ])[:rows].map { |row| row["user_name"] }
    end

    it "eq e ne" do
      expect(names(field: "status", operator: "eq", value: "closed")).to eq([ "Bruno" ])
      expect(names(field: "status", operator: "ne", value: "closed")).to contain_exactly("Ana Maria", "Carla")
    end

    it "gt, gte, lt e lte convertem número" do
      expect(names(field: "unread_messages", operator: "gt", value: "2")).to eq([ "Ana Maria" ])
      expect(names(field: "unread_messages", operator: "gte", value: "2")).to contain_exactly("Ana Maria", "Carla")
      expect(names(field: "unread_messages", operator: "lt", value: "2")).to eq([ "Bruno" ])
      expect(names(field: "unread_messages", operator: "lte", value: "2")).to contain_exactly("Bruno", "Carla")
    end

    it "in e nin" do
      expect(names(field: "user_name", operator: "in", value: %w[Bruno Carla])).to contain_exactly("Bruno", "Carla")
      expect(names(field: "user_name", operator: "nin", value: %w[Bruno Carla])).to eq([ "Ana Maria" ])
    end

    it "contains escapa o texto: não é expressão regular" do
      expect(names(field: "user_name", operator: "contains", value: "ana")).to eq([ "Ana Maria" ])
      expect(names(field: "user_name", operator: "contains", value: ".*")).to eq([])
    end

    it "exists e not_exists" do
      expect(names(field: "custom_attributes", operator: "exists", value: { key: "cidade" })).to eq([ "Ana Maria" ])
      expect(names(field: "custom_attributes", operator: "not_exists", value: { key: "cidade" })).to contain_exactly("Bruno", "Carla")
    end

    def refusal(filter)
      names(filter)
      nil
    rescue described_class::QueryError => error
      error.code
    end

    it "contains só em texto" do
      expect(refusal(field: "unread_messages", operator: "contains", value: "5")).to eq("operatorNotAllowed")
      expect(refusal(field: "created_at", operator: "contains", value: "2026-10-10")).to eq("operatorNotAllowed")
      expect(refusal(field: "automation_enabled", operator: "contains", value: "true")).to eq("operatorNotAllowed")
      expect(names(field: "custom_attributes", operator: "contains", value: { key: "cidade", value: "bh" })).to eq([ "Ana Maria" ])
    end

    it "lista só em in e nin, menos em etiqueta, que é conjunto" do
      create(:chat_tag, name: "vip", organization_id: organization.id)

      expect(refusal(field: "user_name", operator: "eq", value: %w[Bruno Carla])).to eq("invalidFilterValue")
      expect(refusal(field: "unread_messages", operator: "gt", value: %w[1 2])).to eq("invalidFilterValue")
      expect(refusal(field: "custom_attributes", operator: "gt", value: { key: "volume", value: %w[1 2] })).to eq("invalidFilterValue")
      expect(refusal(field: "tags", operator: "eq", value: %w[vip])).to be_nil
    end

    it "número precisa ser número, e sem valor é o filtro que a tela ainda não preencheu" do
      expect(refusal(field: "unread_messages", operator: "gt", value: "abc")).to eq("invalidFilterValue")
      expect(refusal(field: "unread_messages", operator: "gt", value: "1e30")).to eq("invalidFilterValue")
      expect(refusal(field: "custom_attributes", operator: "gt", value: { key: "volume", value: "muito" })).to eq("invalidFilterValue")

      expect(names(field: "unread_messages", operator: "gt", value: "")).to contain_exactly("Ana Maria", "Carla")
      expect(names(field: "unread_messages", operator: "exists", value: "abc")).to contain_exactly("Ana Maria", "Bruno", "Carla")
    end

    it "recusa a data que nem cabe no banco" do
      expect(refusal(field: "created_at", operator: "gt", value: "9" * 25)).to eq("invalidFilterValue")
      expect { execute("conversations", time_range: { start: "9" * 25, end: "9" * 25 }) }
        .to raise_error(described_class::QueryError) { |error| expect(error.code).to eq("invalidTimeRange") }
    end

    it "dois filtros no mesmo campo somam: um não substitui o outro" do
      rows = execute("conversations", filters: [
        { field: "unread_messages", operator: "gte", value: "2" },
        { field: "unread_messages", operator: "lt", value: "5" }
      ])[:rows]

      expect(rows.map { |row| row["user_name"] }).to eq([ "Carla" ])
    end

    it "filtro não substitui o período" do
      old = create(:chat, organization: organization, user_name: "Antiga", created_at: 200.days.ago)

      rows = execute("conversations", filters: [ { field: "created_at", operator: "exists" } ])[:rows]

      expect(rows.map { |row| row["user_name"] }).not_to include(old.user_name)
    end

    describe "campo personalizado" do
      it "compara como número, com o menor número do texto, e deixa de fora quem não tem número" do
        expect(names(field: "custom_attributes", operator: "gte", value: { key: "volume", value: "25" })).to eq([ "Ana Maria" ])
        expect(names(field: "custom_attributes", operator: "lte", value: { key: "volume", value: "25" })).to eq([ "Bruno" ])
      end

      it "aceita as duas formas de filtro" do
        expect(names(field: "custom_attributes.cidade", operator: "eq", value: "BH")).to eq([ "Ana Maria" ])
        expect(names(field: "custom_attributes", operator: "in", value: { key: "cidade", value: %w[BH SP] })).to eq([ "Ana Maria" ])
      end
    end

    it "conversa de teste fica de fora" do
      create(:chat, organization: organization, external_id: Chat::TEST_EXTERNAL_ID, user_name: "Teste")

      expect(execute("conversations")[:rows].map { |row| row["user_name"] }).not_to include("Teste")
    end
  end

  describe "métricas condicionais" do
    before do
      create(:chat, organization: organization, status: "open", user_name: "Ana", unread_messages: 3)
      create(:chat, organization: organization, status: "closed", user_name: "Bruno", unread_messages: 7)
    end

    def metric_rows(*metrics)
      execute("conversations", metrics: metrics)[:rows].first
    end

    it "conta, soma, tira média, mínimo e máximo, condicionados" do
      filters = [ { field: "status", operator: "eq", value: "closed" } ]

      expect(
        metric_rows(
          count_metric("c", filters: filters),
          { field: "unread_messages", aggregation: "sum", label: "s", filters: filters },
          { field: "unread_messages", aggregation: "avg", label: "a", filters: filters },
          { field: "unread_messages", aggregation: "min", label: "n", filters: filters },
          { field: "unread_messages", aggregation: "max", label: "x", filters: filters }
        )
      ).to eq("c" => 1, "s" => 7, "a" => 7.0, "n" => 7, "x" => 7)
    end

    it "combina com or quando pedido, e com and por padrão" do
      filters = [ { field: "status", operator: "eq", value: "open" }, { field: "user_name", operator: "eq", value: "Bruno" } ]

      expect(metric_rows(count_metric("e", filters: filters), count_metric("ou", filters: filters, filters_operator: "or"))).to eq("e" => 0, "ou" => 2)
    end

    it "todos os operadores de expressão aceitam valor com $, sem virar caminho de campo" do
      %w[eq ne in nin contains].each do |operator|
        expect { execute("conversations", metrics: [ count_metric("c", filters: [ { field: "user_name", operator: operator, value: "$$ROOT" } ]) ]) }.not_to raise_error
      end
    end

    it "condiciona pelo valor de campo personalizado, inclusive como número" do
      create(:chat, organization: organization, custom_attributes: { "status_venda" => "ganho", "volume" => "30" })
      create(:chat, organization: organization, custom_attributes: { "status_venda" => "perdido", "volume" => "20 a 40/dia" })
      create(:chat, organization: organization, custom_attributes: { "volume" => "sem número" })

      rows = metric_rows(
        count_metric("Ganho", filters: [ { field: "custom_attributes", operator: "eq", value: { key: "status_venda", value: "ganho" } } ]),
        count_metric("Em lista", filters: [ { field: "custom_attributes", operator: "in", value: { key: "status_venda", value: %w[ganho perdido] } } ]),
        count_metric("Tem", filters: [ { field: "custom_attributes", operator: "exists", value: { key: "status_venda" } } ]),
        count_metric("Não tem", filters: [ { field: "custom_attributes", operator: "not_exists", value: { key: "status_venda" } } ]),
        count_metric("Contém", filters: [ { field: "custom_attributes", operator: "contains", value: { key: "status_venda", value: "GAN" } } ]),
        count_metric("Volume alto", filters: [ { field: "custom_attributes", operator: "gte", value: { key: "volume", value: "25" } } ]),
        count_metric("Volume baixo", filters: [ { field: "custom_attributes", operator: "lt", value: { key: "volume", value: "25" } } ])
      )

      # As duas conversas do `before` não têm o campo.
      expect(rows).to eq("Ganho" => 1, "Em lista" => 2, "Tem" => 2, "Não tem" => 3, "Contém" => 1, "Volume alto" => 1, "Volume baixo" => 1)
    end

    it "monta as colunas de um funil: reunião qualificada e venda" do
      calendar = create(:agenda_calendar, organization: organization)
      converted = create(:chat_tag, name: "convertido", organization_id: organization.id)
      qualified = create(:chat, organization: organization, custom_attributes: { "volume" => "30" })
      unqualified = create(:chat, organization: organization, custom_attributes: { "volume" => "10" })
      create(:chat, organization: organization, chat_tag_ids: [ converted.id ])
      create(:agenda_booking, calendar: calendar, chat: qualified, attendance_status: "show")
      create(:agenda_booking, calendar: calendar, chat: unqualified, attendance_status: "show")

      rows = metric_rows(
        count_metric("Reuniões qualificadas", filters: [
          { field: "booking_attendance", operator: "eq", value: "show" },
          { field: "custom_attributes", operator: "gte", value: { key: "volume", value: "20" } }
        ]),
        count_metric("Vendas", filters_operator: "or", filters: [
          { field: "tags", operator: "in", value: [ "convertido" ] },
          { field: "booking_attendance", operator: "eq", value: "no_show" }
        ])
      )

      expect(rows).to eq("Reuniões qualificadas" => 1, "Vendas" => 1)
    end

    it "condiciona por etiqueta também depois de agrupar por etiqueta, com o campo já achatado" do
      vip = create(:chat_tag, name: "vip", organization_id: organization.id)
      atacado = create(:chat_tag, name: "atacado", organization_id: organization.id)
      create(:chat, organization: organization, chat_tag_ids: [ vip.id, atacado.id ])

      rows = execute("conversations", dimensions: [ { field: "chat_tag_name" } ], metrics: [ count_metric("Só vip", filters: [ { field: "tags", operator: "in", value: [ "vip" ] } ]) ])[:rows]

      expect(rows).to contain_exactly({ "chat_tag_name" => "vip", "Só vip" => 1 }, { "chat_tag_name" => "atacado", "Só vip" => 0 })
    end

    it "duas colunas com o mesmo filtro por etiqueta fazem uma consulta só" do
      create(:chat_tag, name: "vip", organization_id: organization.id)
      filters = [ { field: "tags", operator: "in", value: [ "vip" ] } ]
      allow(ChatTag).to receive(:where).and_call_original

      metric_rows(count_metric("a", filters: filters), count_metric("b", filters: filters))

      expect(ChatTag).to have_received(:where).with(hash_including(organization_id: organization.id.to_s)).once
    end

    it "nomes repetidos de coluna ganham sufixo, em vez de se sobrescreverem" do
      result = execute("conversations", metrics: [ count_metric("Total"), count_metric("Total") ])

      expect(result[:columns]).to eq([ "Total", "Total (2)" ])
      expect(result[:rows]).to eq([ { "Total" => 2, "Total (2)" => 2 } ])
    end
  end

  describe "dimensões" do
    it "agrupa por etiqueta, pela coleção relacionada" do
      vip = create(:chat_tag, name: "vip", organization_id: organization.id)
      atacado = create(:chat_tag, name: "atacado", organization_id: organization.id)
      create(:chat, organization: organization, chat_tag_ids: [ vip.id, atacado.id ])
      create(:chat, organization: organization, chat_tag_ids: [ vip.id ])

      rows = execute("conversations", dimensions: [ { field: "chat_tag_name" } ], metrics: [ count_metric ], sort: { field: "Total", direction: "desc" })[:rows]

      expect(rows).to eq([ { "chat_tag_name" => "vip", "Total" => 2 }, { "chat_tag_name" => "atacado", "Total" => 1 } ])
    end

    it "data sem granularidade agrupa por dia, e não por instante" do
      at = zone.local(2026, 10, 10, 9)
      create(:chat, organization: organization, created_at: at)
      create(:chat, organization: organization, created_at: at + 3.hours)

      rows = execute("conversations", dimensions: [ { field: "created_at" } ], metrics: [ count_metric ], time_range: { start: "2026-10-01", end: "2026-10-31" })[:rows]

      expect(rows).to eq([ { "created_at" => zone.local(2026, 10, 10).utc, "Total" => 2 } ])
    end

    it "semana começa na segunda, igual ao Postgres" do
      sunday = zone.local(2026, 10, 11, 10)
      create(:chat, organization: organization, created_at: sunday)

      rows = execute("conversations", dimensions: [ { field: "created_at", granularity: "week" } ], metrics: [ count_metric ], time_range: { start: "2026-10-01", end: "2026-10-31" })[:rows]

      expect(rows.first["created_at"]).to eq(zone.local(2026, 10, 5).utc)
    end
  end

  describe "período" do
    it "sem período, valem os últimos 90 dias" do
      create(:chat, organization: organization, user_name: "Recente", created_at: 10.days.ago)
      create(:chat, organization: organization, user_name: "Antiga", created_at: 100.days.ago)

      result = execute("conversations")

      expect(result[:rows].map { |row| row["user_name"] }).to eq([ "Recente" ])
      expect(result[:meta][:timeRange][:field]).to eq("created_at")
    end

    it "só com a data, o último dia entra inteiro" do
      day = zone.today - 3.days
      create(:chat, organization: organization, created_at: zone.local(day.year, day.month, day.day, 22))

      result = execute("conversations", metrics: [ count_metric ], time_range: { start: (day - 1.day).iso8601, end: day.iso8601 })

      expect(result[:rows]).to eq([ { "Total" => 1 } ])
      # O último milissegundo do dia, e não a meia-noite do dia seguinte.
      expect(result[:meta][:timeRange][:to]).to eq((zone.local(day.year, day.month, day.day).end_of_day.to_i * 1000) + 999)
    end

    it "com a hora, vale a hora" do
      day = zone.today - 3.days
      create(:chat, organization: organization, created_at: zone.local(day.year, day.month, day.day, 22))

      rows = execute("conversations", metrics: [ count_metric ], time_range: { start: (day - 1.day).iso8601, end: "#{day.iso8601} 21:00" })[:rows]

      expect(rows).to eq([])
    end

    it "aceita o campo de data escolhido" do
      create(:chat, organization: organization, user_name: "Falou", created_at: 100.days.ago, last_message_at: 1.day.ago)

      rows = execute("conversations", time_range: { field: "last_message_at" })[:rows]

      expect(rows.map { |row| row["user_name"] }).to eq([ "Falou" ])
    end

    it "mensagem tem teto próprio de período" do
      expect { execute("messages", time_range: { start: "2024-01-01", end: "2026-01-01" }) }.to raise_error(described_class::QueryError) { |error| expect(error.code).to eq("rangeTooLong") }
    end
  end

  describe "fonte messages" do
    let(:chat) { create(:chat, organization: organization, last_message_at: Time.current) }

    it "conta por papel, a partir das conversas" do
      2.times { add_message(chat, kind: :inbound, at: 1.hour.ago) }
      add_message(chat, kind: :automation, at: 1.hour.ago)

      rows = execute("messages", dimensions: [ { field: "role" } ], metrics: [ count_metric ], sort: { field: "Total", direction: "desc" })[:rows]

      expect(rows).to eq([ { "role" => "user", "Total" => 2 }, { "role" => "assistant", "Total" => 1 } ])
    end

    it "ignora span e nota do histórico, e não alcança outra organização" do
      add_message(chat, kind: :inbound, at: 1.hour.ago)
      add_message(chat, kind: :inbound, at: 1.hour.ago, is_span: true)
      create(:chat_text_message, chat: chat, role: "base", content: "Nota", created_at: 1.hour.ago, ignore_events: true)
      add_message(create(:chat, organization: other_organization, last_message_at: Time.current), kind: :inbound, at: 1.hour.ago)

      expect(execute("messages", metrics: [ count_metric ])[:rows]).to eq([ { "Total" => 1 } ])
    end

    it "filtra pela conversa, com o id em texto" do
      add_message(chat, kind: :inbound, at: 1.hour.ago)
      add_message(create(:chat, organization: organization, last_message_at: Time.current), kind: :inbound, at: 1.hour.ago)

      rows = execute("messages", filters: [ { field: "chat_id", operator: "eq", value: chat.id.to_s } ], metrics: [ count_metric ])[:rows]

      expect(rows).to eq([ { "Total" => 1 } ])
    end

    it "sem agrupar, traz só os campos da lista: o texto da mensagem não sai" do
      add_message(chat, kind: :inbound, at: 1.hour.ago, content: "segredo")

      result = execute("messages")

      expect(result[:rows].first).to include("role" => "user", "chat_id" => chat.id)
      expect(result[:rows].first.keys).not_to include("content")
      expect(result[:rows].first.values).not_to include("segredo")
    end

    it "não consulta quem está fora do período pelas mensagens" do
      add_message(chat, kind: :inbound, at: 200.days.ago)

      expect(execute("messages", metrics: [ count_metric ])[:rows]).to eq([])
    end
  end

  describe "fonte agenda_bookings" do
    let(:calendar) { create(:agenda_calendar, organization: organization, name: "Estúdio") }
    let(:professional) { create(:agenda_professional, calendar: calendar, name: "Camila") }

    it "agrupa por profissional, com o id em texto e o nome em labels" do
      create(:agenda_booking, calendar: calendar, professional: professional, start: 1.day.ago, attendance_status: "show")
      create(:agenda_booking, calendar: calendar, start: 1.day.ago)

      result = execute("agenda_bookings", dimensions: [ { field: "professional_id" } ], metrics: [ count_metric ], filters: [ { field: "professional_id", operator: "eq", value: professional.id.to_s } ])

      expect(result[:rows].map { |row| row["Total"] }).to eq([ 1 ])
      expect(result[:labels]["professional_id"]).to eq(professional.id.to_s => "Camila")
    end

    it "agrupa pelo nome do profissional, pela coleção relacionada" do
      create(:agenda_booking, calendar: calendar, professional: professional, start: 1.day.ago)

      rows = execute("agenda_bookings", dimensions: [ { field: "professional_name" } ], metrics: [ count_metric ])[:rows]

      expect(rows).to eq([ { "professional_name" => "Camila", "Total" => 1 } ])
    end

    it "pendente é ausência de comparecimento" do
      create(:agenda_booking, calendar: calendar, start: 1.day.ago)
      create(:agenda_booking, calendar: calendar, start: 1.day.ago, attendance_status: "show")

      rows = execute("agenda_bookings", filters: [ { field: "attendance_status", operator: "eq", value: "" } ], metrics: [ count_metric ])[:rows]

      expect(rows).to eq([ { "Total" => 1 } ])
    end

    it "arquivado não aparece, e o período é pelo início" do
      create(:agenda_booking, calendar: calendar, start: 1.day.ago, status: "archived")
      create(:agenda_booking, calendar: calendar, start: 100.days.ago)
      create(:agenda_booking, calendar: calendar, start: 1.day.ago)

      result = execute("agenda_bookings", metrics: [ count_metric ])

      expect(result[:rows]).to eq([ { "Total" => 1 } ])
      expect(result[:meta][:timeRange][:field]).to eq("start")
    end

    it "não alcança outra organização" do
      foreign = create(:agenda_calendar, organization: other_organization)
      create(:agenda_booking, calendar: foreign, start: 1.day.ago)

      expect(execute("agenda_bookings", metrics: [ count_metric ])[:rows]).to eq([])
    end

    it "traduz os valores de comparecimento, com o pendente na chave vazia" do
      create(:agenda_booking, calendar: calendar, start: 1.day.ago, attendance_status: "no_show")

      labels = execute("agenda_bookings", dimensions: [ { field: "attendance_status" } ], metrics: [ count_metric ])[:labels]

      expect(labels["attendance_status"]).to include("show" => "Compareceu", "no_show" => "Não compareceu", "" => "Pendente")
    end
  end

  describe "fonte campaigns" do
    def campaign(**attributes)
      create(:outreach_campaign, organization_id: organization.id.to_s, **attributes)
    end

    it "agrupa por situação, que no banco é status_cd, e soma os contadores" do
      campaign(status_cd: "completed", sent_count: 100)
      campaign(status_cd: "completed", sent_count: 50)
      campaign(status_cd: "draft", sent_count: 0)

      rows = execute("campaigns", dimensions: [ { field: "status" } ], metrics: [ { field: "sent_count", aggregation: "sum", label: "Enviadas" } ], sort: { field: "Enviadas", direction: "desc" })[:rows]

      expect(rows).to eq([ { "status" => "completed", "Enviadas" => 150 }, { "status" => "draft", "Enviadas" => 0 } ])
    end

    it "filtra pela situação, e não alcança outra organização" do
      campaign(status_cd: "running")
      create(:outreach_campaign, organization_id: other_organization.id.to_s, status_cd: "running")

      rows = execute("campaigns", filters: [ { field: "status", operator: "eq", value: "running" } ], metrics: [ count_metric ])[:rows]

      expect(rows).to eq([ { "Total" => 1 } ])
    end

    it "sem agrupar, traz os campos com o nome da API" do
      campaign(name: "Black Friday", status_cd: "draft")

      expect(execute("campaigns")[:rows].first).to include("name" => "Black Friday", "status" => "draft")
    end
  end

  describe "filtro por presença em agendamento" do
    let(:calendar) { create(:agenda_calendar, organization: organization) }

    it "traz as conversas com agendamento naquele comparecimento, sem cancelados" do
      came = create(:chat, organization: organization, user_name: "Veio")
      missed = create(:chat, organization: organization, user_name: "Faltou")
      canceled = create(:chat, organization: organization, user_name: "Cancelou")
      create(:chat, organization: organization, user_name: "Sem agendamento")
      create(:agenda_booking, calendar: calendar, chat: came, attendance_status: "show")
      create(:agenda_booking, calendar: calendar, chat: missed, attendance_status: "no_show")
      create(:agenda_booking, calendar: calendar, chat: canceled, attendance_status: "show", status: "canceled")

      rows = execute("conversations", filters: [ { field: "booking_attendance", operator: "eq", value: "show" } ])[:rows]
      expect(rows.map { |row| row["user_name"] }).to eq([ "Veio" ])

      rows = execute("conversations", filters: [ { field: "booking_attendance", operator: "ne", value: "show" } ])[:rows]
      expect(rows.map { |row| row["user_name"] }).to contain_exactly("Faltou", "Cancelou", "Sem agendamento")
    end

    it "serve também como coluna condicional" do
      came = create(:chat, organization: organization)
      create(:chat, organization: organization)
      create(:agenda_booking, calendar: calendar, chat: came, attendance_status: "show")

      rows = execute("conversations", metrics: [ count_metric("Veio", filters: [ { field: "booking_attendance", operator: "eq", value: "show" } ]) ])[:rows]

      expect(rows).to eq([ { "Veio" => 1 } ])
    end

    it "não considera agendamento de outra organização" do
      chat = create(:chat, organization: organization)
      foreign_calendar = create(:agenda_calendar, organization: other_organization)
      foreign_chat = create(:chat, organization: other_organization)
      create(:agenda_booking, calendar: foreign_calendar, chat: foreign_chat, attendance_status: "show")

      rows = execute("conversations", filters: [ { field: "booking_attendance", operator: "eq", value: "show" } ])[:rows]

      expect(rows.map { |row| row["_id"] }).not_to include(chat.id)
      expect(rows).to eq([])
    end

    it "recusa quando o filtro alcançaria conversas demais" do
      stub_const("CustomDashboards::DocumentIdResolvers::MAX_IDS", 1)
      2.times { create(:agenda_booking, calendar: calendar, chat: create(:chat, organization: organization), attendance_status: "show") }

      expect { execute("conversations", filters: [ { field: "booking_attendance", operator: "eq", value: "show" } ]) }
        .to raise_error(described_class::QueryError) { |error| expect(error.code).to eq("tooManyMatches") }
    end
  end

  describe "sem agrupar" do
    it "traz só os campos da lista, nunca o documento inteiro" do
      create(:chat, organization: organization, user_name: "Ana", notes: "anotação", contact_storage: { "cpf" => "1" })

      result = execute("conversations")

      expect(result[:columns]).to include("user_name", "status")
      expect(result[:rows].first.keys).to match_array(result[:columns])
      expect(result[:rows].first.keys).not_to include("notes", "contact_storage", "organization_id", "_id")
    end

    it "traz os nomes das etiquetas, e não os ids" do
      tag = create(:chat_tag, name: "vip", organization_id: organization.id)
      create(:chat, organization: organization, chat_tag_ids: [ tag.id ])

      expect(execute("conversations")[:rows].first["tags"]).to eq([ "vip" ])
    end

    it "ordena pelo campo pedido, e recusa o que não está na lista" do
      create(:chat, organization: organization, user_name: "Ana")
      create(:chat, organization: organization, user_name: "Bia")

      expect(execute("conversations", sort: { field: "user_name", direction: "desc" })[:rows].first["user_name"]).to eq("Bia")
      expect { execute("conversations", sort: { field: "custom_attributes" }) }.to raise_error(described_class::QueryError)
    end

    it "corta no limite e diz que cortou" do
      3.times { create(:chat, organization: organization) }

      result = execute("conversations", limit: 2)

      expect(result[:rows].size).to eq(2)
      expect(result[:meta]).to include(total: 2, truncated: true)
    end

    it "sem limite, o padrão é menor do que o máximo" do
      stub_const("#{described_class}::DEFAULT_RAW_ROWS", 1)
      2.times { create(:chat, organization: organization) }

      expect(execute("conversations")[:rows].size).to eq(1)
    end
  end

  describe "depois de agrupar" do
    it "corta no limite e diz que cortou, sem falso positivo" do
      create(:chat, organization: organization, status: "open")
      create(:chat, organization: organization, status: "closed")

      truncated = execute("conversations", dimensions: [ { field: "status" } ], metrics: [ count_metric ], limit: 1)
      exact = execute("conversations", dimensions: [ { field: "status" } ], metrics: [ count_metric ], limit: 2)

      expect(truncated[:meta][:truncated]).to be(true)
      expect(exact[:meta][:truncated]).to be(false)
    end

    it "ordena por dimensão ou por métrica, pelo nome interno ou pelo que a tela mostra" do
      2.times { create(:chat, organization: organization, status: "open") }
      create(:chat, organization: organization, status: "closed")

      query = { dimensions: [ { field: "status" } ], metrics: [ count_metric ] }

      expect(execute("conversations", query.merge(sort: { field: "metric_0", direction: "asc" }))[:rows].first["status"]).to eq("closed")
      expect(execute("conversations", query.merge(sort: { field: "status", direction: "desc" }))[:rows].first["status"]).to eq("open")
    end

    it "por padrão, ordena pela primeira dimensão" do
      create(:chat, organization: organization, status: "open")
      create(:chat, organization: organization, status: "closed")

      rows = execute("conversations", dimensions: [ { field: "status" } ], metrics: [ count_metric ])[:rows]

      expect(rows.map { |row| row["status"] }).to eq(%w[closed open])
    end
  end

  it "passa o prazo para o Mongo em toda agregação" do
    collection = Chat.collection
    allow(Chat).to receive(:collection).and_return(collection)
    allow(collection).to receive(:aggregate).and_call_original

    execute("conversations", metrics: [ count_metric ])

    expect(collection).to have_received(:aggregate).with(anything, hash_including(max_time_ms: a_value_between(1, 30_000)))
  end

  describe "índice dito por hint" do
    def hint_for(source_model, source_key, **query)
      collection = source_model.collection
      allow(source_model).to receive(:collection).and_return(collection)
      seen = []
      allow(collection).to receive(:aggregate).and_wrap_original do |original, pipeline, **options|
        seen << options
        original.call(pipeline, **options)
      end

      execute(source_key, metrics: [ count_metric ], **query)

      seen.first[:hint]
    end

    it "conversas, pelo campo de data do período" do
      expect(hint_for(Chat, "conversations")).to eq("organization_id" => 1, "created_at" => -1)
      expect(hint_for(Chat, "conversations", time_range: { field: "last_message_at" })).to eq("organization_id" => 1, "last_message_at" => -1)
    end

    it "campo de data sem índice próprio deixa o Mongo escolher" do
      expect(hint_for(Chat, "conversations", time_range: { field: "updated_at" })).to be_nil
    end

    it "mensagens partem das conversas, pela última mensagem" do
      expect(hint_for(Chat, "messages")).to eq("organization_id" => 1, "last_message_at" => -1)
    end

    it "agendamentos, pelo início" do
      expect(hint_for(Agenda::Booking, "agenda_bookings")).to eq("organization_id" => 1, "start" => 1)
    end
  end

  # A última condição do `$and` é o escopo: é o que garante que nada do cliente o substitui.
  it "o escopo da organização é a última condição do $match" do
    collection = Chat.collection
    allow(Chat).to receive(:collection).and_return(collection)
    pipelines = []
    allow(collection).to receive(:aggregate).and_wrap_original do |original, pipeline, **options|
      pipelines << pipeline
      original.call(pipeline, **options)
    end

    execute("conversations", filters: [ { field: "status", operator: "eq", value: "open" } ], metrics: [ count_metric ])

    conditions = pipelines.first.first["$match"]["$and"]
    expect(conditions.last).to include("organization_id" => organization.id.to_s)
    expect(conditions.first(conditions.size - 1).map(&:keys).flatten).not_to include("organization_id")
  end
end
