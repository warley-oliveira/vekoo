# O que `kanban.*` devolve ao script. Os nomes são contrato de quem escreve script e não mudam com o
# resto do domínio: aqui ainda é `kanban_column_id`, `conversation_id`, `columns`, `scope: "column"`.
#
# Também é o `params.card` dos scripts de gatilho (`Pipelines::CodeRunnerJob`).
module MiniRacerEngine::Workers::Kanban::Payloads
  module_function

  def board_summary(board)
    {
      id: board.id,
      name: board.name,
      board_type: board.board_type,
      archived: board.archived,
      columns: board.stages.map { |stage| { id: stage.id, name: stage.name, position: stage.position } }
    }
  end

  def board_detail(board)
    board_summary(board).merge(
      description: board.description,
      color: board.color,
      icon: board.icon,
      require_fields_on_deal_won: board.require_fields_on_deal_won,
      require_fields_on_deal_lost: board.require_fields_on_deal_lost,
      custom_field_definitions: board.custom_fields.map { |field| custom_field_definition(field) }
    )
  end

  def custom_field_definition(field)
    {
      id: field.id,
      key: field.key,
      name: field.name,
      field_type: field.field_type,
      position: field.position,
      required: field.required,
      options: field.options,
      default_value: field.default_value,
      scope: field.board_scope? ? "board" : "column",
      kanban_column_id: field.stage_id,
      required_to_leave_column: field.required_to_leave_stage
    }
  end

  def column(stage)
    {
      id: stage.id,
      name: stage.name,
      position: stage.position,
      color: stage.color,
      wip_limit: stage.wip_limit,
      sla_hours: stage.sla_hours
    }
  end

  def label(label)
    { id: label.id, name: label.name, color: label.color }
  end

  def card(card)
    {
      id: card.id,
      title: card.title,
      description: card.description,
      status: card.status,
      priority: card.priority,
      due_date: card.due_date&.iso8601,
      position: card.position,
      kanban_column_id: card.stage_id,
      assigned_to_id: card.assigned_to_id,
      conversation_id: card.chat_id,
      tags: Array(card.tags),
      color_label: card.color_label,
      custom_field_values: card.custom_field_values || {},
      archived: card.archived,
      completed_at: card.completed_at&.iso8601,
      deal_value: card.deal_value&.to_f,
      deal_probability: card.deal_probability,
      company_name: card.company_name,
      contact_email: card.contact_email,
      contact_phone: card.contact_phone,
      won_at: card.won_at&.iso8601,
      lost_at: card.lost_at&.iso8601,
      lost_reason: card.lost_reason,
      labels: card.labels.map { |item| label(item) }
    }
  end

  def checklist(checklist)
    {
      id: checklist.id,
      name: checklist.name,
      position: checklist.position,
      items: checklist.items.map { |item| checklist_item(item) }
    }
  end

  def checklist_item(item)
    { id: item.id, title: item.title, completed: item.completed, position: item.position }
  end

  def comment(comment)
    {
      id: comment.id,
      body: comment.body,
      author: ::Pipelines::CommentSerializer.author_payload(comment),
      pinned: comment.pinned,
      created_at: comment.created_at&.iso8601,
      edited_at: comment.edited_at&.iso8601
    }
  end
end
