require "rails_helper"

RSpec.describe ChatFunnel do
  let(:organization) { create(:organization) }
  let(:funnel) { create(:funnel, organization: organization, name: "Vendas") }
  let(:stages) { funnel.stages.to_a }
  let(:period) { { from: 7.days.ago, to: Time.current } }

  def chat_in(stage, target = funnel, **attributes)
    create(:chat, organization: organization, **attributes).tap { |chat| chat.place_in_funnel!(target.id, stage.id) }
  end

  def analyze(scope = Chat.where(organization_id: organization.id.to_s), funnels = [ funnel ], **options)
    described_class.analyze(scope, funnels, **period, **options)
  end

  it "conta quantos estão em cada etapa e quantos chegaram até ela" do
    chat_in(stages[0])
    2.times { chat_in(stages[1]) }
    chat_in(stages[3])

    entry = analyze.first

    expect(entry[:funnel]).to eq(funnel)
    expect(entry[:total]).to eq(4)
    expect(entry[:stages].map { |stage| stage.slice(:name, :count, :reached) }).to eq(
      [
        { name: "Novo", count: 1, reached: 4 },
        { name: "Atendimento", count: 2, reached: 3 },
        { name: "Proposta", count: 0, reached: 1 },
        { name: "Fechado", count: 1, reached: 1 }
      ]
    )
  end

  it "calcula a conversão e a perda entre as etapas" do
    chat_in(stages[0])
    2.times { chat_in(stages[1]) }
    chat_in(stages[3])

    rows = analyze.first[:stages]

    expect(rows.map { |stage| stage[:conversion_rate] }).to eq([ 100.0, 75.0, 25.0, 25.0 ])
    expect(rows.map { |stage| stage[:step_rate] }).to eq([ 100.0, 75.0, 33.3, 100.0 ])
    expect(rows.map { |stage| stage[:drop_off] }).to eq([ 0, 1, 2, 0 ])
  end

  it "funil sem conversa nenhuma sai zerado, sem dividir por zero" do
    entry = analyze.first

    expect(entry[:total]).to eq(0)
    expect(entry[:stages].map { |stage| stage[:conversion_rate] }).to all(eq(0.0))
  end

  it "só conta quem está em etapa que existe: id apagado fica de fora" do
    chat_in(stages[0])
    create(:chat, organization: organization).place_in_funnel!(funnel.id, "etapa-apagada")

    expect(analyze.first[:total]).to eq(1)
  end

  it "conta vários funis na mesma passada" do
    second = create(:funnel, organization: organization, name: "Suporte", stage_names: %w[Aberto Resolvido])
    chat_in(stages[0])
    chat_in(second.stages.first, second)

    collection = Chat.collection
    allow(Chat).to receive(:collection).and_return(collection)
    expect(collection).to receive(:aggregate).once.and_call_original

    result = analyze(Chat.where(organization_id: organization.id.to_s), [ funnel, second ])

    expect(result.map { |entry| [ entry[:funnel].name, entry[:total] ] }).to eq([ [ "Vendas", 1 ], [ "Suporte", 1 ] ])
  end

  it "traz as etiquetas mais usadas de quem está no funil, com nome e cor" do
    vip = create(:chat_tag, organization_id: organization.id, name: "vip", color: "#7c3aed")
    atacado = create(:chat_tag, organization_id: organization.id, name: "atacado", color: "#4f46e5")
    chat_in(stages[0], chat_tag_ids: [ vip.id, atacado.id ])
    chat_in(stages[1], chat_tag_ids: [ vip.id ])
    create(:chat, organization: organization, chat_tag_ids: [ atacado.id ])

    expect(analyze.first[:tags]).to eq(
      [
        { id: vip.id.to_s, name: "vip", color: "#7c3aed", count: 2 },
        { id: atacado.id.to_s, name: "atacado", color: "#4f46e5", count: 1 }
      ]
    )
  end

  it "respeita o período e o campo de data" do
    chat_in(stages[0], created_at: 30.days.ago, last_message_at: 1.day.ago)
    chat_in(stages[0], created_at: 1.day.ago, last_message_at: 1.day.ago)

    expect(analyze.first[:total]).to eq(1)
    expect(analyze(date_field: "last_message_at").first[:total]).to eq(2)
  end

  it "respeita o escopo recebido" do
    person = member_with(organization, chat: "all", chat_list_to: "assigned")
    chat_in(stages[0], assigned_account_id: person.id)
    chat_in(stages[0], assigned_account_id: "outra-pessoa")

    expect(analyze(Chat.visible_to(person)).first[:total]).to eq(1)
  end

  it "não consulta nada sem funis" do
    expect(Chat).not_to receive(:collection)

    expect(described_class.analyze(Chat.all, [], **period)).to eq([])
  end
end
