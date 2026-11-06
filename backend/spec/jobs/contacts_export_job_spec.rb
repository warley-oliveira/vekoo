require "rails_helper"
require "csv"

RSpec.describe ContactsExportJob, type: :job do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:stream) { ApplicationCable::Channel.organization_stream(organization.id, ContactsExportChannel.stream_name(owner.id)) }

  def chat_for(**attributes)
    create(:chat, organization: organization, **attributes)
  end

  def run(**arguments)
    described_class.perform_now(organization_id: organization.id, account_id: owner.id, **arguments)
  end

  # O que foi transmitido para a pessoa, já decodificado.
  def broadcasts
    ActionCable.server.pubsub.broadcasts(stream).map { |payload| JSON.parse(payload) }
  end

  def completed
    broadcasts.find { |event| event["action"] == "completed" }
  end

  def exported_rows
    token = Rack::Utils.parse_query(URI.parse(completed["data"]["downloadUrl"]).query)["token"]
    blob = ActiveStorage::Blob.find(Contacts::ExportToken.verify(token)[:blob_id])
    CSV.parse(blob.download.force_encoding("UTF-8"))
  end

  it "gera o arquivo, com progresso e o link de download" do
    create(:custom_field, organization_id: organization.id, name: "Cidade")
    chat_for(user_name: "Fernanda", custom_attributes: { "cidade" => "Curitiba" })
    chat_for(user_name: "Roberto")

    run(select_all: true)

    expect(broadcasts.first).to eq("action" => "progress", "data" => { "processed" => 0, "total" => 2 })
    expect(broadcasts).to include("action" => "progress", "data" => { "processed" => 2, "total" => 2 })
    expect(completed["data"]).to include("total" => 2)
    expect(completed["data"]["fileName"]).to match(/\Acontatos-\d{4}-\d{2}-\d{2}\.csv\z/)
    expect(completed["data"]["downloadUrl"]).to start_with("/contacts/download-export?token=")
    expect(exported_rows.first).to include("Nome", "Cidade")
    expect(exported_rows.drop(1).map(&:first)).to eq(%w[Fernanda Roberto])
  end

  it "guarda no Active Storage e não deixa nada em tmp" do
    chat_for

    expect { run }.to change(ActiveStorage::Blob, :count).by(1)

    expect(Rails.root.glob("tmp/contatos-*.csv")).to be_empty
  end

  it "agenda a limpeza do arquivo, depois de o link vencer" do
    chat_for

    expect { run }.to have_enqueued_job(Contacts::PurgeExportJob)
  end

  it "sem contatos, conclui sem link" do
    run

    expect(completed["data"]).to include("downloadUrl" => nil, "total" => 0, "message" => "Nenhum contato encontrado para exportar.")
  end

  it "aplica os filtros da tela" do
    chat_for(user_name: "Ana", status: "closed")
    chat_for(user_name: "Bia", status: "open")

    run(filters: { "status" => "closed" })

    expect(exported_rows.drop(1).map(&:first)).to eq([ "Ana" ])
  end

  it "exporta os marcados" do
    chosen = chat_for(user_name: "Ana")
    chat_for(user_name: "Bia")

    run(chat_ids: [ chosen.id.to_s ])

    expect(exported_rows.drop(1).map(&:first)).to eq([ "Ana" ])
  end

  it "tira os desmarcados de `todos`" do
    chat_for(user_name: "Ana")
    skipped = chat_for(user_name: "Bia")

    run(select_all: true, excluded_ids: [ skipped.id.to_s ])

    expect(exported_rows.drop(1).map(&:first)).to eq([ "Ana" ])
  end

  # Quem exporta só leva o que pode ver: o escopo é refeito no job, com a pessoa.
  it "respeita chat_list_to e a organização" do
    account = member_with(contacts: "all", chat_list_to: "assigned")
    allow(ContactsExportChannel).to receive(:broadcast_event).and_call_original
    mine = chat_for(user_name: "Minha", assigned_account_id: account.id)
    theirs = chat_for(user_name: "Dela", assigned_account_id: owner.id)
    foreign = create(:chat, organization: create(:organization), user_name: "De fora")

    described_class.perform_now(organization_id: organization.id, account_id: account.id, chat_ids: [ mine.id, theirs.id, foreign.id ].map(&:to_s))

    expect(ContactsExportChannel).to have_received(:broadcast_event).with(organization.id, account.id, "completed", hash_including(total: 1))
  end

  it "sai no idioma da pessoa" do
    owner.update!(locale: "en")
    chat_for

    run

    expect(exported_rows.first.first).to eq("Name")
  end

  it "não exporta para quem perdeu a permissão" do
    account = member_with(chat: "all")

    expect {
      described_class.perform_now(organization_id: organization.id, account_id: account.id)
    }.not_to change(ActiveStorage::Blob, :count)
  end

  it "não exporta para quem é de outra organização" do
    expect {
      described_class.perform_now(organization_id: organization.id, account_id: create(:account, organization: create(:organization)).id)
    }.not_to change(ActiveStorage::Blob, :count)
  end

  it "avisa do erro em vez de sumir" do
    chat_for
    allow(Media::Storage).to receive(:store_file).and_raise("disco cheio")

    run

    expect(broadcasts.last).to eq("action" => "error", "data" => { "error" => "Não foi possível exportar os contatos. Tente de novo." })
    expect(Rails.root.glob("tmp/contatos-*.csv")).to be_empty
  end

  describe Contacts::PurgeExportJob do
    include ActiveJob::TestHelper

    it "apaga o arquivo" do
      blob = Media::Storage.store_io(StringIO.new("x"), filename: "x.csv", content_type: "text/csv")

      perform_enqueued_jobs { described_class.perform_now(blob.id) }

      expect(ActiveStorage::Blob.find_by(id: blob.id)).to be_nil
    end

    it "não estoura com arquivo que já saiu" do
      expect { described_class.perform_now(SecureRandom.uuid) }.not_to raise_error
    end
  end
end
