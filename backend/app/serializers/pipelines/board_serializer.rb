module Pipelines
  class BoardSerializer < ApplicationSerializer
    # @param viewer [Account] `viewerCanViewAllCards` é a resposta para esta pessoa
    def self.one(board, viewer:, cards_count: nil, stages_count: nil, stages: nil)
      visibility = CardVisibility.new(board, viewer)

      json = base(board).merge(
        viewerCanViewAllCards: visibility.unrestricted?,
        cardsCount: cards_count || visibility.scope(board.cards).active.count,
        stagesCount: stages_count || board.stages.count
      )
      stages ? json.merge(stages: stages) : json
    end

    # O quadro aberto: as etapas com os cards que a pessoa enxerga, e o resto do que a tela precisa.
    def self.detail(board, viewer:, stages:, cards_by_stage:, batch:, applied_filter: nil)
      base(board).merge(
        viewerCanViewAllCards: CardVisibility.new(board, viewer).unrestricted?,
        stages: stages.map do |stage|
          StageSerializer.one(stage).merge(
            cards: Array(cards_by_stage[stage.id]).map { |card| CardSerializer.one(card, batch: batch, chat_summary: true) }
          )
        end,
        customFields: CustomFieldSerializer.many(board.custom_fields),
        triggers: TriggerSerializer.many(board.triggers.ordered),
        appliedFilter: applied_filter
      )
    end

    def self.base(board)
      {
        id: board.id,
        name: board.name,
        description: board.description,
        color: board.color,
        icon: board.icon,
        templateKey: board.template_key,
        boardType: board.board_type,
        archived: board.archived,
        autoArchiveDays: board.auto_archive_days,
        dealCloseBehavior: board.deal_close_behavior,
        dealCloseArchiveDays: board.deal_close_archive_days,
        dealRottingDays: board.deal_rotting_days,
        requireFieldsOnDealWon: board.require_fields_on_deal_won,
        requireFieldsOnDealLost: board.require_fields_on_deal_lost,
        leadScoreFieldKey: board.lead_score_field_key,
        leadScoreLow: board.lead_score_low,
        leadScoreHigh: board.lead_score_high,
        cardVisibility: board.card_visibility,
        cardVisibilityBypassRoleIds: board.live_bypass_role_ids,
        createdAt: epoch_ms(board.created_at),
        updatedAt: epoch_ms(board.updated_at)
      }
    end
    private_class_method :base
  end
end
