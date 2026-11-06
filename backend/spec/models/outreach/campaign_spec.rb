require "rails_helper"

RSpec.describe Outreach::Campaign, type: :model do
  let(:organization) { create(:organization) }
  let(:other_organization) { create(:organization) }

  def build_campaign(**attributes)
    build(:outreach_campaign, organization: organization, **attributes)
  end

  describe "nomes gerados pelos enums" do
    # `Criteria#read` e companhia: um escopo com o mesmo nome faria a consulta devolver outra
    # coisa sem erro nenhum. É por isso que o enum do destinatário tem prefixo.
    [ Outreach::Campaign, Outreach::Recipient, Outreach::Batch ].each do |model|
      it "em #{model}, nenhum escopo colide com um método de Criteria" do
        scopes = model.scopes.keys

        expect(scopes.select { |name| Mongoid::Criteria.method_defined?(name) }).to eq([])
      end
    end

    it "um enum não sobrescreve os métodos do outro" do
      expect(described_class.scopes.keys).to include(:message_text, :message_media, :mode_text, :mode_template)
      expect(described_class.scopes.keys).not_to include(:text)
    end

    it "os valores de cada enum ficam separados" do
      campaign = build_campaign(message_type_cd: "media", campaign_mode_cd: "text")

      expect(campaign.message_media?).to be(true)
      expect(campaign.mode_text?).to be(true)
      expect(campaign.message_text?).to be(false)
      expect(campaign.mode_template?).to be(false)
    end

    it "o destinatário tem o enum com prefixo, por causa de `read`" do
      expect(Outreach::Recipient.scopes.keys).to include(:status_read, :status_pending)
      expect(Outreach::Recipient.scopes.keys).not_to include(:read)
    end
  end

  describe "validações" do
    it "aceita o básico" do
      expect(build_campaign).to be_valid
    end

    it "exige nome" do
      expect(build_campaign(name: "")).not_to be_valid
    end

    it "exige a organização" do
      expect(build(:outreach_campaign, organization_id: nil)).not_to be_valid
    end

    it "no modo texto exige ao menos uma mensagem preenchida" do
      campaign = build_campaign(messages: [ "", "  " ])

      expect(campaign).not_to be_valid
      expect(campaign.errors[:messages]).to be_present
    end

    it "limita o lote a 200" do
      expect(build_campaign(batch_size: 201)).not_to be_valid
      expect(build_campaign(batch_size: 200)).to be_valid
      expect(build_campaign(batch_size: 0)).not_to be_valid
    end

    it "exige limite diário positivo" do
      expect(build_campaign(daily_limit_per_connector: 0)).not_to be_valid
    end

    it "não aceita intervalo máximo menor que o mínimo" do
      campaign = build_campaign(buffer_min_seconds: 10, buffer_max_seconds: 5)

      expect(campaign).not_to be_valid
      expect(campaign.errors[:buffer_max_seconds]).to be_present
    end

    it "não aceita intervalo menor que um segundo" do
      expect(build_campaign(buffer_min_seconds: 0)).not_to be_valid
    end

    # Sem dia nenhum, procurar "o próximo dia permitido" nunca terminaria.
    it "exige ao menos um dia de envio" do
      expect(build_campaign(send_days: [])).not_to be_valid
    end

    it "só aceita dias da semana de verdade" do
      expect(build_campaign(send_days: [ 7 ])).not_to be_valid
      expect(build_campaign(send_days: [ nil ])).not_to be_valid
    end

    it "só aceita horas possíveis" do
      expect(build_campaign(send_start_hour: 24)).not_to be_valid
      expect(build_campaign(send_end_hour: 25)).not_to be_valid
      expect(build_campaign(send_end_hour: 24)).to be_valid
    end

    it "exige um fuso que exista" do
      expect(build_campaign(timezone: "Marte/Olympus")).not_to be_valid
    end

    it "recusa um tipo de mensagem desconhecido em vez de levantar" do
      campaign = build_campaign(message_type_cd: "fax")

      expect(campaign).not_to be_valid
      expect(campaign.errors[:message_type]).to be_present
    end

    context "com mídia" do
      it "exige anexo, endereço, tipo e nome" do
        campaign = build_campaign(message_type_cd: "media", messages: [])

        expect(campaign).not_to be_valid
        expect(campaign.errors.attribute_names).to include(:attachment_id, :media_url, :media_content_type, :media_file_name)
      end

      it "aceita sem texto" do
        expect(build(:outreach_campaign, :media, organization: organization, messages: [])).to be_valid
      end

      it "recusa o que não é imagem, vídeo ou documento" do
        campaign = build(:outreach_campaign, :media, organization: organization, media_content_type: "audio/ogg")

        expect(campaign).not_to be_valid
        expect(campaign.errors[:media_content_type]).to be_present
      end
    end

    context "no modo modelo" do
      it "exige conta, número e modelo" do
        campaign = build_campaign(campaign_mode_cd: "template", messages: [])

        expect(campaign).not_to be_valid
        expect(campaign.errors.attribute_names).to include(:template_ids, :waba_connector_id, :phone_number_ids)
      end

      it "não conta número em branco" do
        campaign = build_campaign(campaign_mode_cd: "template", messages: [], phone_number_ids: [ "", nil ])

        campaign.valid?

        expect(campaign.errors[:phone_number_ids]).to be_present
      end
    end
  end

  # A origem buscava os canais pelos ids soltos: bastava conhecer o id para disparar pelo número de
  # outra organização.
  describe "isolamento entre organizações" do
    it "recusa um canal de outra organização" do
      foreign = create(:connector_whatsapp_web, organization: other_organization)
      campaign = build_campaign(connector_ids: [ foreign.id.to_s ])

      expect(campaign).not_to be_valid
      expect(campaign.errors[:connector_ids]).to be_present
    end

    it "recusa um canal que a campanha não usa" do
      widget = create(:connector_web_widget, organization: organization)

      expect(build_campaign(connector_ids: [ widget.id.to_s ])).not_to be_valid
    end

    it "aceita os canais da própria organização" do
      web = create(:connector_whatsapp_web, organization: organization)

      expect(build_campaign(connector_ids: [ web.id.to_s ])).to be_valid
    end

    it "recusa uma WABA de outra organização" do
      foreign = create(:connector_whatsapp_cloud, organization: other_organization)

      campaign = build_campaign(campaign_mode_cd: "template", messages: [], waba_connector_id: foreign.id.to_s, phone_number_ids: [ "1" ], template_ids: [ "x" ])

      expect(campaign).not_to be_valid
      expect(campaign.errors[:waba_connector_id]).to be_present
    end

    it "recusa um modelo de outra conta" do
      waba = create(:connector_whatsapp_cloud, organization: organization)
      foreign_template = create(:whatsapp_template, connector: create(:connector_whatsapp_cloud, organization: other_organization))

      campaign = build_campaign(campaign_mode_cd: "template", messages: [], waba_connector_id: waba.id.to_s, phone_number_ids: [ "1" ], template_ids: [ foreign_template.id.to_s ])

      expect(campaign).not_to be_valid
      expect(campaign.errors[:template_ids]).to be_present
    end

    it "recusa uma etiqueta de outra organização" do
      foreign = create(:chat_tag, organization_id: other_organization.id)

      expect(build_campaign(chat_tag_ids: [ foreign.id.to_s ])).not_to be_valid
    end

    it "ao consultar os canais, só devolve os da organização, mesmo com o id gravado" do
      foreign = create(:connector_whatsapp_web, organization: other_organization)
      campaign = create(:outreach_campaign, organization: organization)
      campaign.set(connector_ids: [ foreign.id.to_s ])

      expect(campaign.connectors.to_a).to eq([])
    end

    it "uma campanha antiga salva mesmo que o canal tenha sumido" do
      web = create(:connector_whatsapp_web, organization: organization)
      campaign = create(:outreach_campaign, organization: organization, connector_ids: [ web.id.to_s ])
      web.delete

      campaign.name = "Novo nome"

      expect(campaign.reload.tap { |saved| saved.name = "Novo nome" }).to be_valid
    end

    it "`scoped` não acha a campanha de outra organização" do
      campaign = create(:outreach_campaign, organization: other_organization)

      expect(described_class.scoped(organization.id, campaign.id)).to be_nil
      expect(described_class.scoped(other_organization.id, campaign.id)).to eq(campaign)
    end
  end

  describe "#transition!" do
    let(:campaign) { create(:outreach_campaign, organization: organization) }

    it "muda quando está no estado esperado" do
      expect(campaign.transition!(from: :draft, to: :running, run_token: "novo")).to be(true)
      expect(campaign).to have_attributes(status_cd: "running", run_token: "novo")
    end

    it "não muda quando outro já mudou" do
      other_copy = described_class.find(campaign.id)
      other_copy.transition!(from: :draft, to: :running)

      expect(campaign.transition!(from: :draft, to: :cancelled)).to be(false)
      expect(campaign.reload.status_cd).to eq("running")
    end
  end

  describe "#media_kind" do
    it "reconhece imagem, vídeo e documentos" do
      expect(described_class.resolve_media_kind("image/png")).to eq("image")
      expect(described_class.resolve_media_kind("video/mp4")).to eq("video")
      expect(described_class.resolve_media_kind("application/pdf")).to eq("document")
      expect(described_class.resolve_media_kind("application/vnd.ms-excel")).to eq("document")
      expect(described_class.resolve_media_kind("audio/ogg")).to be_nil
    end
  end

  # Origem: spec/models/campaign/base_media_url_spec.rb
  describe "#resolved_media_url" do
    # URL assinada do CDN interno da Meta: abre no navegador logado, mas o downloader da Meta leva
    # 403 nela.
    let(:meta_cdn_url) { "https://scontent.whatsapp.net/v/t61.29466-34/596415028_2098566691544694.jpg?ccb=1-7&oh=01_Q5Aa5&oe=6AA411FB" }
    let(:attachment_url) { "https://arquivos.vekoo.app/kjh2l3kj4h23" }
    let(:attachment) { instance_double("Attachment", file_url: attachment_url) }

    before { allow(Media::AttachmentLookup).to receive_messages(find: nil, from_file_url: nil) }

    it "recalcula a URL a partir do anexo ligado" do
      allow(Media::AttachmentLookup).to receive(:find).with("7", organization_id: organization.id).and_return(attachment)

      expect(build_campaign(attachment_id: "7", media_url: "https://arquivos.vekoo.app/url-velha").resolved_media_url).to eq(attachment_url)
    end

    it "sem anexo ligado, usa a URL guardada" do
      expect(build_campaign(media_url: attachment_url).resolved_media_url).to eq(attachment_url)
    end

    it "refaz a URL canônica a partir do anexo por trás de uma URL velha" do
      stale = "http://localhost:3000/rails/active_storage/blobs/redirect/abc/banner.jpg"
      allow(Media::AttachmentLookup).to receive(:from_file_url).with(stale).and_return(attachment)

      expect(build_campaign(media_url: stale).resolved_media_url).to eq(attachment_url)
    end

    it "recusa uma URL do CDN da Meta" do
      expect(build_campaign(media_url: meta_cdn_url).resolved_media_url).to be_nil
    end

    it "devolve nil quando o anexo ligado não existe mais" do
      expect(build_campaign(attachment_id: "7").resolved_media_url).to be_nil
    end

    it "devolve nil sem mídia nenhuma" do
      expect(build_campaign.resolved_media_url).to be_nil
    end
  end

  it "excluir leva junto destinatários, lotes e atividade" do
    campaign = create(:outreach_campaign, organization: organization)
    create(:outreach_recipient, campaign: campaign)
    create(:outreach_batch, campaign: campaign)
    create(:outreach_activity_log, campaign: campaign)

    campaign.destroy

    expect(Outreach::Recipient.count).to eq(0)
    expect(Outreach::Batch.count).to eq(0)
    expect(Outreach::ActivityLog.count).to eq(0)
  end
end
