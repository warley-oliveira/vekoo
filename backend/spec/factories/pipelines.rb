FactoryBot.define do
  factory :pipeline_board, class: "Pipelines::Board" do
    organization
    sequence(:name) { |n| "Funil comercial #{n}" }
    board_type { "standard" }

    trait :crm do
      board_type { "crm" }
    end
  end

  factory :pipeline_stage, class: "Pipelines::Stage" do
    association :board, factory: :pipeline_board
    sequence(:name) { |n| "Etapa #{n}" }
  end

  factory :pipeline_card, class: "Pipelines::Card" do
    association :stage, factory: :pipeline_stage
    sequence(:title) { |n| "Negócio #{n}" }

    trait :won do
      won_at { Time.current }
    end
  end

  factory :pipeline_label, class: "Pipelines::Label" do
    organization
    sequence(:name) { |n| "Etiqueta #{n}" }
    color { "#3B82F6" }
  end

  factory :pipeline_checklist, class: "Pipelines::Checklist" do
    association :card, factory: :pipeline_card
    sequence(:name) { |n| "Checklist #{n}" }
  end

  factory :pipeline_checklist_item, class: "Pipelines::ChecklistItem" do
    association :checklist, factory: :pipeline_checklist
    sequence(:title) { |n| "Tarefa #{n}" }
  end

  factory :pipeline_stage_checklist_item, class: "Pipelines::StageChecklistItem" do
    association :stage, factory: :pipeline_stage
    sequence(:title) { |n| "Conferir #{n}" }
    required { true }
  end

  factory :pipeline_comment, class: "Pipelines::Comment" do
    association :card, factory: :pipeline_card
    body { "Cliente pediu retorno na sexta." }
    author { association(:account, organization: card.organization) }
  end

  factory :pipeline_custom_field, class: "Pipelines::CustomField" do
    association :board, factory: :pipeline_board
    sequence(:name) { |n| "Campo #{n}" }
    field_type { "text" }
  end

  factory :pipeline_trigger, class: "Pipelines::Trigger" do
    association :board, factory: :pipeline_board
    sequence(:name) { |n| "Gatilho #{n}" }
    event_type { "card_moved" }
    actions { [ { "type" => "notify", "message" => "Card movido" } ] }
  end

  factory :pipeline_goal, class: "Pipelines::Goal" do
    association :board, factory: :pipeline_board
    scope { "funnel" }
    period_month { Date.current.beginning_of_month }
    target_value { 10_000 }

    trait :user do
      scope { "user" }
      assigned_account { association(:account, organization: board.organization, role: "member") }
    end
  end

  factory :pipeline_saved_filter, class: "Pipelines::SavedFilter" do
    association :board, factory: :pipeline_board
    organization { board.organization }
    owner { association(:account, organization: board.organization) }
    sequence(:name) { |n| "Filtro #{n}" }
    visibility { "private" }
    definition { { "version" => 1, "all" => [ { "field" => "priority", "operator" => "eq", "value" => "high" } ], "any" => [] } }

    trait :shared do
      visibility { "shared" }
    end
  end

  factory :pipeline_saved_filter_favorite, class: "Pipelines::SavedFilterFavorite" do
    association :board, factory: :pipeline_board
    user { association(:account, organization: board.organization) }
    saved_filter { association(:pipeline_saved_filter, board: board) }

    trait :preset do
      saved_filter { nil }
      preset_key { "open_deals" }
    end
  end
end
