require "rails_helper"

RSpec.describe CampaignChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:campaign) { create(:outreach_campaign, organization: organization) }
  let(:list_stream) { described_class.organization_stream(organization.id, described_class::LIST_STREAM) }
  let(:campaign_stream) { described_class.organization_stream(organization.id, described_class.stream_for_campaign(campaign.id)) }

  it "com a campanha, assina o monitor dela" do
    stub_connection current_account: owner

    subscribe(campaignId: campaign.id.to_s)

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from(campaign_stream)
    expect(subscription).not_to have_stream_from(list_stream)
  end

  it "sem parâmetro, assina a lista da organização" do
    stub_connection current_account: owner

    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from(list_stream)
  end

  it "recusa a campanha de outra organização" do
    stub_connection current_account: owner

    subscribe(campaignId: create(:outreach_campaign).id.to_s)

    expect(subscription).to be_rejected
  end

  it "recusa uma campanha que não existe" do
    stub_connection current_account: owner

    subscribe(campaignId: "nao-existe")

    expect(subscription).to be_rejected
  end

  it "recusa quem não tem a permissão de campanhas" do
    role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS)
    stub_connection current_account: create(:account, organization: organization, role: "member", access_role: role)

    subscribe

    expect(subscription).to be_rejected
  end

  it "aceita quem tem a permissão" do
    role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS.merge("campaigns" => "all"))
    stub_connection current_account: create(:account, organization: organization, role: "member", access_role: role)

    subscribe(campaignId: campaign.id.to_s)

    expect(subscription).to be_confirmed
  end

  it "para de ouvir ao sair" do
    stub_connection current_account: owner
    subscribe

    unsubscribe

    expect(subscription).not_to have_streams
  end

  describe "os eventos" do
    let(:recipient) { create(:outreach_recipient, campaign: campaign, name: "Ana", phone: "5531971810932") }

    it "`progress` vai para o monitor e para a lista, com os números" do
      Outreach::Campaign.where(_id: campaign.id).inc(sent_count: 2)

      expect { Outreach::MonitorEvents.progress(campaign) }.to have_broadcasted_to(campaign_stream).with(
        hash_including(event: "progress", campaignId: campaign.id.to_s, status: "draft", stats: hash_including(sent: 2))
      )
      expect { Outreach::MonitorEvents.progress(campaign) }.to have_broadcasted_to(list_stream).with(hash_including(event: "progress"))
    end

    it "`status` vai para o monitor e para a lista, com a campanha" do
      expect { Outreach::MonitorEvents.status(campaign) }.to have_broadcasted_to(list_stream).with(
        hash_including(event: "status", campaign: hash_including(id: campaign.id.to_s, status: "draft"))
      )
    end

    it "`recipient` vai só para o monitor" do
      expect { Outreach::MonitorEvents.recipient(campaign, recipient) }.to have_broadcasted_to(campaign_stream).with(
        hash_including(event: "recipient", recipient: hash_including(contactName: "Ana", phoneNumber: "5531971810932", status: "pending"))
      )
      expect { Outreach::MonitorEvents.recipient(campaign, recipient) }.not_to have_broadcasted_to(list_stream)
    end

    it "`activity` vai só para o monitor" do
      expect { campaign.log_activity!("paused") }.to have_broadcasted_to(campaign_stream).with(
        hash_including(event: "activity", activity: hash_including(action: "paused"))
      )
    end

    it "`progress` lê os números do banco: o objeto em memória pode estar velho" do
      stale = Outreach::Campaign.find(campaign.id)
      Outreach::Campaign.where(_id: campaign.id).inc(sent_count: 5)

      expect { Outreach::MonitorEvents.progress(stale) }.to have_broadcasted_to(campaign_stream).with(hash_including(stats: hash_including(sent: 5)))
    end

    it "um soluço no Redis não vira erro de envio" do
      allow(ActionCable.server).to receive(:broadcast).and_raise(Redis::CannotConnectError)

      expect { Outreach::MonitorEvents.progress(campaign) }.not_to raise_error
    end
  end
end
