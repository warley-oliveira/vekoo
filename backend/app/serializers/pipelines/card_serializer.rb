module Pipelines
  class CardSerializer < ApplicationSerializer
    # O que `includes` precisa trazer para `one` não fazer consulta por card.
    PRELOADS = [
      { assigned_to: PersonPayload.preload },
      { created_by: PersonPayload.preload },
      :labels,
      { stage: :board }
    ].freeze

    # @param batch [CardBatch, nil] contagens já calculadas, para quem serializa uma lista
    # @param chat_summary [Boolean] traz o resumo da conversa do `batch`. Só com um `viewer` nele: o
    #   que é transmitido para o quadro inteiro não leva dado da conversa
    # @param description_json [Boolean] a descrição rica pode ter centenas de KB: fica fora do quadro
    def self.one(card, batch: nil, chat_summary: false, description_json: false)
      batch ||= CardBatch.new([ card ])

      json = {
        id: card.id,
        title: card.title,
        description: card.description,
        priority: card.priority,
        status: card.status,
        dueDate: epoch_ms(card.due_date),
        position: card.position,
        audienceId: card.audience_id,
        assignedToId: card.assigned_to_id,
        createdById: card.created_by_id,
        chatId: card.chat_id,
        stageId: card.stage_id,
        tags: card.tags,
        colorLabel: card.color_label,
        customFieldValues: card.custom_field_values,
        archived: card.archived,
        completedAt: epoch_ms(card.completed_at),
        createdAt: epoch_ms(card.created_at),
        updatedAt: epoch_ms(card.updated_at),
        dealValue: card.deal_value&.to_f,
        dealProbability: card.deal_probability,
        companyName: card.company_name,
        contactEmail: card.contact_email,
        contactPhone: card.contact_phone,
        wonAt: epoch_ms(card.won_at),
        lostAt: epoch_ms(card.lost_at),
        lostReason: card.lost_reason,
        stageEnteredAt: epoch_ms(card.stage_entered_at),
        expectedCloseDate: card.expected_close_date&.iso8601,
        assignedTo: PersonPayload.json(card.assigned_to),
        createdBy: PersonPayload.json(card.created_by),
        labels: card.labels.map { |label| LabelSerializer.brief(label) },
        commentsCount: batch.comments_count(card),
        watchersCount: batch.watchers_count(card),
        hasChat: card.chat_id.present?,
        checklistProgress: batch.checklist_progress(card),
        stageChecksProgress: batch.stage_checks_progress(card),
        isRotting: card.rotting?
      }
      json[:chatSummary] = batch.chat_summary(card) if chat_summary
      json[:descriptionJson] = card.description_json if description_json
      json
    end

    def self.many(cards, viewer: nil, chat_summary: false, description_json: false)
      list = cards.to_a
      batch = CardBatch.new(list, viewer: viewer)

      list.map { |card| one(card, batch: batch, chat_summary: chat_summary, description_json: description_json) }
    end

    # O card aberto.
    def self.detail(card, viewer:)
      one(card, batch: CardBatch.new([ card ], viewer: viewer), description_json: true).merge(
        watchers: card.watcher_accounts.with_attached_avatar.map { |account| PersonPayload.json(account) },
        attachments: AttachmentSerializer.many(card.attachments.includes(uploaded_by: PersonPayload.preload).with_attached_file),
        chatSummary: ChatSummary.for_account(viewer, [ card.chat_id ], detailed: true)[card.chat_id],
        activities: ActivitySerializer.many(card.activities.recent(10).includes(user: PersonPayload.preload)),
        checklists: ChecklistSerializer.many(card.checklists.includes(:items))
      )
    end

    # O card no arquivo: sem as contagens, mais o nome e a cor da etapa, porque a lista não tem colunas.
    def self.archived(card)
      {
        id: card.id,
        title: card.title,
        description: card.description,
        priority: card.priority,
        status: card.status,
        dueDate: epoch_ms(card.due_date),
        assignedToId: card.assigned_to_id,
        createdById: card.created_by_id,
        chatId: card.chat_id,
        stageId: card.stage_id,
        tags: card.tags,
        colorLabel: card.color_label,
        archived: card.archived,
        completedAt: epoch_ms(card.completed_at),
        createdAt: epoch_ms(card.created_at),
        updatedAt: epoch_ms(card.updated_at),
        dealValue: card.deal_value&.to_f,
        dealProbability: card.deal_probability,
        companyName: card.company_name,
        contactEmail: card.contact_email,
        contactPhone: card.contact_phone,
        wonAt: epoch_ms(card.won_at),
        lostAt: epoch_ms(card.lost_at),
        lostReason: card.lost_reason,
        assignedTo: PersonPayload.json(card.assigned_to),
        createdBy: PersonPayload.json(card.created_by),
        labels: card.labels.map { |label| LabelSerializer.brief(label) },
        stageName: card.stage&.name,
        stageColor: card.stage&.color
      }
    end
  end
end
