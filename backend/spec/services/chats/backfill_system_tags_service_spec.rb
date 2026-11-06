require "rails_helper"

RSpec.describe Chats::BackfillSystemTagsService do
  let(:organization) { create(:organization) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board) }
  let(:chat) { create(:chat, organization: organization) }

  def tag_names(target = chat)
    ChatTag.where(:_id.in => target.reload.chat_tag_ids).pluck(:name)
  end

  # Grava sem passar pelo callback: é o negócio fechado antes de a etiqueta existir.
  def closed_card(target = chat, stage_override: stage, **attributes)
    card = create(:pipeline_card, stage: stage_override, chat_id: target.id.to_s)
    card.update_columns(attributes)
    card
  end

  def run_service(**options)
    described_class.new(organization, **options).call
  end

  describe "negócios dos pipelines" do
    it "etiqueta a conversa do negócio ganho e do perdido" do
      lost_chat = create(:chat, organization: organization)
      closed_card(won_at: 1.day.ago)
      closed_card(lost_chat, lost_at: 1.day.ago)

      stats = run_service

      expect(tag_names).to eq([ "ganho" ])
      expect(tag_names(lost_chat)).to eq([ "perdido" ])
      expect(stats).to include(deal_events: 2, deal_tagged: 2)
    end

    it "vale o desfecho mais recente da conversa" do
      closed_card(won_at: 10.days.ago)
      closed_card(lost_at: 2.days.ago)

      run_service

      expect(tag_names).to eq([ "perdido" ])
    end

    it "conta os arquivados, e os quadros que não são de negócio" do
      closed_card(won_at: 1.day.ago, archived: true)

      run_service

      expect(tag_names).to eq([ "ganho" ])
    end

    it "fica dentro da janela de meses" do
      closed_card(won_at: 2.years.ago)

      stats = run_service(months: 8)

      expect(tag_names).to be_empty
      expect(stats[:deal_events]).to eq(0)
    end

    it "não mexe em negócio aberto, nem em card sem conversa" do
      create(:pipeline_card, stage: stage, chat_id: chat.id.to_s)
      create(:pipeline_card, stage: stage, won_at: 1.day.ago)

      stats = run_service

      expect(tag_names).to be_empty
      expect(stats[:deal_events]).to eq(0)
    end

    it "não atravessa organizações" do
      other_board = create(:pipeline_board)
      closed_card(stage_override: create(:pipeline_stage, board: other_board), won_at: 1.day.ago)

      run_service

      expect(tag_names).to be_empty
    end

    it "conta como órfão o id que não acha conversa da organização" do
      foreign = create(:chat)
      closed_card(foreign, won_at: 1.day.ago)

      stats = run_service

      expect(tag_names(foreign)).to be_empty
      expect(stats[:deal_orphans]).to eq(1)
    end

    it "em `dry_run`, só conta" do
      closed_card(won_at: 1.day.ago)

      stats = run_service(dry_run: true)

      expect(tag_names).to be_empty
      expect(stats[:deal_tagged]).to eq(1)
    end
  end
end
