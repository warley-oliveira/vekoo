require "rails_helper"

RSpec.describe "Pipelines: jobs recorrentes" do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board, name: "Proposta", sla_hours: 24) }

  it "os três estão agendados, na fila baixa" do
    schedule = YAML.load_file(Rails.root.join("config/schedule/pipelines.yml"))

    expect(schedule.values.map { |job| job["class"] }).to contain_exactly(
      "Pipelines::SlaCheckerJob", "Pipelines::DueDateCheckerJob", "Pipelines::AutoArchiveJob", "Pipelines::PurgeTriggerExecutionsJob"
    )
    expect(schedule.values.map { |job| job["queue"] }).to all(eq("low"))
    schedule.each_value { |job| expect(Fugit.parse_cron(job["cron"])).to be_present, "cron inválido: #{job['cron']}" }
    schedule.each_value { |job| expect(job["class"].constantize).to be < ApplicationJob }
  end

  describe Pipelines::SlaCheckerJob do
    def old_card(**attributes)
      create(:pipeline_card, stage: stage, assigned_to: owner, stage_entered_at: 25.hours.ago, **attributes)
    end

    it "avisa o responsável e quem segue, com o caminho do card" do
      card = old_card(title: "Atacado")
      watcher = pipelines_member
      card.watchers.create!(account: watcher)

      described_class.perform_now

      notices = AccountNotice.where(organization_id: organization.id).to_a
      expect(notices.map(&:account_id)).to contain_exactly(owner.id, watcher.id)
      expect(notices.first).to have_attributes(
        title: "Tempo da etapa esgotado",
        description: "O card \"Atacado\" passou de 24h na etapa \"Proposta\".",
        url: "/pipelines/#{board.id}/board?card=#{card.id}"
      )
    end

    it "conta o tempo na etapa, e não a última edição" do
      card = old_card
      card.update!(title: "Editado agora")

      described_class.perform_now

      expect(AccountNotice.count).to eq(1)
    end

    it "avisa uma vez só por passagem na etapa" do
      old_card

      3.times { described_class.perform_now }

      expect(AccountNotice.count).to eq(1)
    end

    it "avisa de novo se o card sair e voltar, e estourar outra vez" do
      card = old_card
      described_class.perform_now

      other = create(:pipeline_stage, board: board)
      Pipelines::MoveCard.call(card: card, stage: other, enforce_gates: false)
      Pipelines::MoveCard.call(card: card, stage: stage, enforce_gates: false)
      described_class.perform_now
      expect(AccountNotice.count).to eq(1)

      card.update_columns(sla_notified_at: 30.hours.ago, stage_entered_at: 26.hours.ago)
      described_class.perform_now
      expect(AccountNotice.count).to eq(2)
    end

    it "não avisa do que ainda está no prazo, arquivado, nem negócio fechado" do
      create(:pipeline_card, stage: stage, assigned_to: owner, stage_entered_at: 1.hour.ago)
      old_card(archived: true)
      old_card(won_at: Time.current)
      old_card(lost_at: Time.current)

      described_class.perform_now

      expect(AccountNotice.count).to eq(0)
    end

    it "não olha quadro arquivado, nem etapa sem SLA" do
      old_card
      board.update!(archived: true)
      described_class.perform_now
      expect(AccountNotice.count).to eq(0)

      board.update!(archived: false)
      stage.update!(sla_hours: nil)
      described_class.perform_now
      expect(AccountNotice.count).to eq(0)
    end

    it "não avisa quem perdeu o acesso" do
      person = pipelines_member
      old_card.update!(assigned_to: person)
      person.revoke!

      described_class.perform_now

      expect(AccountNotice.count).to eq(0)
    end

    it "fala a língua da pessoa" do
      english = create(:account, organization: organization, role: "member", locale: "en")
      old_card.update!(assigned_to: english)

      described_class.perform_now

      expect(AccountNotice.where(account_id: english.id).take.title).to eq("Stage time is up")
    end

    it "dispara o gatilho, respeitando a etapa e as condições" do
      card = old_card
      board_level = create(:pipeline_trigger, board: board, event_type: "sla_breached")
      here = create(:pipeline_trigger, board: board, stage: stage, event_type: "sla_breached")
      elsewhere = create(:pipeline_trigger, board: board, stage: create(:pipeline_stage, board: board), event_type: "sla_breached")
      not_matching = create(:pipeline_trigger, board: board, event_type: "sla_breached", conditions: { "sla_hours" => 99 })

      expect { described_class.perform_now }
        .to have_enqueued_job(Pipelines::TriggerJob).with(board_level.id, card.id, anything)
        .and have_enqueued_job(Pipelines::TriggerJob).with(here.id, card.id, anything)

      enqueued = ActiveJob::Base.queue_adapter.enqueued_jobs.select { |job| job["job_class"] == "Pipelines::TriggerJob" }
      trigger_ids = enqueued.map { |job| job["arguments"].first }
      expect(trigger_ids).not_to include(elsewhere.id, not_matching.id)
    end

    it "um card com problema não para os outros" do
      broken = old_card
      fine = old_card
      allow(AccountNotice).to receive(:create!).and_wrap_original do |original, **attributes|
        raise StandardError, "Mongo fora" if attributes[:description].include?(broken.title)

        original.call(**attributes)
      end

      expect { described_class.perform_now }.not_to raise_error
      expect(AccountNotice.where(description: /#{fine.title}/).count).to eq(1)
    end
  end

  describe Pipelines::DueDateCheckerJob do
    let!(:trigger) { create(:pipeline_trigger, board: board, event_type: "due_date_passed", created_at: 30.days.ago) }

    def jobs_for(trigger)
      ActiveJob::Base.queue_adapter.enqueued_jobs.select { |job| job["job_class"] == "Pipelines::TriggerJob" && job["arguments"].first == trigger.id }
    end

    it "dispara para o prazo vencido" do
      card = create(:pipeline_card, stage: stage, due_date: 1.hour.ago)

      expect { described_class.perform_now }.to have_enqueued_job(Pipelines::TriggerJob).with(trigger.id, card.id, anything)
    end

    it "dispara uma vez só por prazo, a cada execução da varredura" do
      create(:pipeline_card, stage: stage, due_date: 1.hour.ago)

      3.times { described_class.perform_now }

      expect(jobs_for(trigger).size).to eq(1)
    end

    it "mudar o prazo libera um novo disparo" do
      card = create(:pipeline_card, stage: stage, due_date: 1.hour.ago)
      described_class.perform_now

      # Avisado há dois dias; o prazo foi para ontem, e venceu de novo.
      card.update_columns(due_notified_at: 2.days.ago, due_date: 1.day.ago)
      described_class.perform_now

      expect(jobs_for(trigger).size).to eq(2)
    end

    it "não dispara para o que ainda não venceu, arquivado ou concluído" do
      create(:pipeline_card, stage: stage, due_date: 1.hour.from_now)
      create(:pipeline_card, stage: stage, due_date: 1.hour.ago, archived: true)
      create(:pipeline_card, stage: stage, due_date: 1.hour.ago, completed_at: Time.current)

      described_class.perform_now

      expect(jobs_for(trigger)).to be_empty
    end

    it "um gatilho novo não dispara para os 300 cards que já estavam atrasados" do
      create(:pipeline_card, stage: stage, due_date: 2.days.ago)
      fresh = create(:pipeline_trigger, board: board, event_type: "due_date_passed", created_at: 1.day.ago)

      described_class.perform_now

      expect(jobs_for(fresh)).to be_empty
      expect(jobs_for(trigger).size).to eq(1)
    end

    it "gatilho de etapa só vale para o card naquela etapa" do
      elsewhere = create(:pipeline_trigger, board: board, stage: create(:pipeline_stage, board: board), event_type: "due_date_passed", created_at: 30.days.ago)
      create(:pipeline_card, stage: stage, due_date: 1.hour.ago)

      described_class.perform_now

      expect(jobs_for(elsewhere)).to be_empty
    end

    it "não varre quadro sem o gatilho, nem quadro arquivado" do
      quiet = create(:pipeline_board, organization: organization)
      card = create(:pipeline_card, stage: create(:pipeline_stage, board: quiet), due_date: 1.hour.ago)

      described_class.perform_now

      expect(card.reload.due_notified_at).to be_nil

      board.update!(archived: true)
      late = create(:pipeline_card, stage: stage, due_date: 1.hour.ago)
      described_class.perform_now
      expect(late.reload.due_notified_at).to be_nil
    end
  end

  describe Pipelines::AutoArchiveJob do
    it "arquiva o card parado no quadro que pediu, com o motivo na atividade" do
      board.update!(auto_archive_days: 30)
      old = create(:pipeline_card, stage: stage)
      old.update_columns(updated_at: 31.days.ago)
      recent = create(:pipeline_card, stage: stage)
      closed = create(:pipeline_card, stage: stage, won_at: Time.current)
      closed.update_columns(updated_at: 31.days.ago)

      described_class.perform_now

      expect(old.reload.archived).to be(true)
      expect(recent.reload.archived).to be(false)
      expect(closed.reload.archived).to be(false)

      activity = old.activities.find_by(action: "auto_archived")
      expect(activity.details).to eq("reason" => "stale", "days_inactive" => 30)
      expect(old.activities.where(action: "archived")).to be_empty
    end

    it "o reposicionamento dos vizinhos não renova o tempo parado" do
      board.update!(auto_archive_days: 30)
      old = create(:pipeline_card, stage: stage)
      old.update_columns(updated_at: 31.days.ago)
      other = create(:pipeline_card, stage: stage)

      Pipelines::MoveCard.call(card: other, stage: stage, position: 1)
      described_class.perform_now

      expect(old.reload.archived).to be(true)
    end

    it "arquiva o negócio fechado depois de X dias, no quadro que pediu" do
      board.update!(deal_close_behavior: "auto_archive_days", deal_close_archive_days: 7)
      old_deal = create(:pipeline_card, stage: stage, won_at: 8.days.ago)
      recent_deal = create(:pipeline_card, stage: stage, lost_at: 1.day.ago)

      described_class.perform_now

      expect(old_deal.reload.archived).to be(true)
      expect(old_deal.activities.find_by(action: "auto_archived").details).to include("reason" => "deal_closed")
      expect(recent_deal.reload.archived).to be(false)
    end

    it "não mexe em quadro sem a regra, nem em quadro arquivado" do
      old = create(:pipeline_card, stage: stage)
      old.update_columns(updated_at: 400.days.ago)
      described_class.perform_now
      expect(old.reload.archived).to be(false)

      board.update!(auto_archive_days: 30, archived: true)
      described_class.perform_now
      expect(old.reload.archived).to be(false)
    end

    it "um card com problema não para os outros" do
      board.update!(auto_archive_days: 30)
      broken = create(:pipeline_card, stage: stage)
      fine = create(:pipeline_card, stage: stage)
      [ broken, fine ].each { |card| card.update_columns(updated_at: 31.days.ago) }
      broken.update_columns(title: "x" * 600)

      expect { described_class.perform_now }.not_to raise_error

      expect(fine.reload.archived).to be(true)
      expect(broken.reload.archived).to be(false)
    end
  end

  describe Pipelines::PurgeTriggerExecutionsJob do
    it "tira do histórico só o que passou da retenção" do
      trigger = create(:pipeline_trigger, board: board)
      card = create(:pipeline_card, stage: stage)
      old = Pipelines::TriggerExecution.create!(trigger: trigger, card: card, executed_at: 91.days.ago)
      recent = Pipelines::TriggerExecution.create!(trigger: trigger, card: card, executed_at: 89.days.ago)

      described_class.perform_now

      expect(Pipelines::TriggerExecution.exists?(old.id)).to be(false)
      expect(Pipelines::TriggerExecution.exists?(recent.id)).to be(true)
    end
  end
end
