module Pipelines
  # Avisa de card que passou do tempo máximo na etapa ("Tempo máximo que um card pode ficar nesta
  # etapa", o texto da tela) e dispara os gatilhos de `sla_breached`.
  #
  # Uma vez por passagem na etapa: `sla_notified_at` é marcado antes de avisar, em comando atômico.
  # Na origem este job nunca esteve agendado, e como escrito repetiria o aviso a cada execução; ele
  # também contava pelo `updated_at`, que qualquer edição renova, e não pelo tempo na etapa.
  class SlaCheckerJob < ApplicationJob
    queue_as :low
    # A próxima varredura é a nova tentativa.
    sidekiq_options retry: false

    def perform
      Stage.unscoped.where.not(sla_hours: nil).joins(:board).merge(Board.active).includes(board: :organization).find_each do |stage|
        check_stage(stage)
      rescue StandardError => e
        Rails.logger.error("[Pipelines::SlaCheckerJob] etapa #{stage.id}: #{e.class}: #{e.message}")
      end
    end

    private

    def check_stage(stage)
      breached_cards(stage).find_each do |card|
        next unless claim(card)

        notify_sla_breach(card, stage)
        evaluate_sla_triggers(card, stage)
      rescue StandardError => e
        Rails.logger.error("[Pipelines::SlaCheckerJob] card #{card.id}: #{e.class}: #{e.message}")
      end
    end

    # Negócio fechado não está "parado" na etapa.
    def breached_cards(stage)
      Card.unscoped
          .where(stage_id: stage.id, archived: false, won_at: nil, lost_at: nil, completed_at: nil)
          .where("stage_entered_at < ?", stage.sla_hours.hours.ago)
          .where("sla_notified_at IS NULL OR sla_notified_at < stage_entered_at")
    end

    # Duas execuções sobrepostas não avisam duas vezes: só uma muda a linha.
    def claim(card)
      Card.unscoped
          .where(id: card.id)
          .where("sla_notified_at IS NULL OR sla_notified_at < stage_entered_at")
          .update_all(sla_notified_at: Time.current)
          .positive?
    end

    def notify_sla_breach(card, stage)
      account_ids = card.watchers.pluck(:account_id)
      account_ids << card.assigned_to_id if card.assigned_to_id.present?

      stage.board.organization.accounts.active.where(id: account_ids.uniq.compact).find_each do |account|
        I18n.with_locale(account.locale.presence || I18n.default_locale) do
          AccountNotice.create!(
            account_id: account.id,
            organization_id: stage.board.organization_id,
            title: I18n.t("pipelines.notices.sla_title"),
            description: I18n.t("pipelines.notices.sla_body", card: card.title, hours: stage.sla_hours, stage: stage.name).truncate(1000),
            url: CardLink.path(stage.board, card),
            category: "general"
          )
        end
      rescue StandardError => e
        Rails.logger.error("[Pipelines::SlaCheckerJob] aviso para #{account.id}: #{e.class}: #{e.message}")
      end
    end

    def evaluate_sla_triggers(card, stage)
      context = {
        event_type: "sla_breached",
        card_id: card.id,
        board_id: stage.board_id,
        stage_id: stage.id,
        stage_name: stage.name,
        sla_hours: stage.sla_hours
      }

      stage.board.triggers.for_event("sla_breached").each do |trigger|
        next unless trigger.applies_to_stage?(stage.id)
        next unless trigger.conditions_met?(context)

        TriggerJob.perform_later(trigger.id, card.id, context.to_json)
      end
    end
  end
end
