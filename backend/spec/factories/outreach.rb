FactoryBot.define do
  # Por padrão a janela é de 24 horas, todos os dias, e o intervalo é de um segundo: assim cada spec
  # testa o que quer sem depender do relógio de quem roda.
  factory :outreach_campaign, class: "Outreach::Campaign" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    sequence(:name) { |n| "Campanha #{n}" }
    message_type_cd { "text" }
    campaign_mode_cd { "text" }
    messages { [ "Olá {{nome}}" ] }
    send_start_hour { 0 }
    send_end_hour { 0 }
    send_days { [ 0, 1, 2, 3, 4, 5, 6 ] }
    buffer_min_seconds { 1 }
    buffer_max_seconds { 1 }
    daily_limit_per_connector { 300 }
    timezone { "America/Sao_Paulo" }

    trait :running do
      status_cd { "running" }
      run_token { "token-vigente" }
      started_at { 1.hour.ago }
      planned_at { 1.hour.ago }
    end

    trait :paused do
      status_cd { "paused" }
      run_token { "token-vigente" }
      started_at { 1.hour.ago }
      planned_at { 1.hour.ago }
    end

    trait :scheduled do
      status_cd { "scheduled" }
      run_token { "token-vigente" }
      scheduled_at { 1.day.from_now }
    end

    trait :media do
      message_type_cd { "media" }
      attachment_id { "anexo-1" }
      media_url { "https://cdn.exemplo.com.br/promo.png" }
      media_content_type { "image/png" }
      media_file_name { "promo.png" }
      messages { [ "Olha a promoção, {{nome}}" ] }
    end
  end

  factory :outreach_recipient, class: "Outreach::Recipient" do
    association :campaign, factory: :outreach_campaign
    sequence(:phone) { |n| "553197#{format('%07d', n)}" }
    name { "Maria Souza" }

    # A importação de verdade soma em bloco; aqui é um a um.
    after(:create) { |recipient| Outreach::Campaign.where(_id: recipient.campaign_id).inc(recipients_count: 1) }
  end

  factory :outreach_batch, class: "Outreach::Batch" do
    association :campaign, factory: :outreach_campaign
    connector_id { BSON::ObjectId.new.to_s }
    channel_key { "#{connector_id}:" }
    sequence(:sequence) { |n| n }
    status_cd { "scheduled" }
  end

  factory :outreach_activity_log, class: "Outreach::ActivityLog" do
    association :campaign, factory: :outreach_campaign
    action { "created" }
  end

  factory :outreach_place_extraction, class: "Outreach::PlaceExtraction" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    search_query { "padaria" }
    location { "Curitiba, PR" }
    status { "pending" }

    trait :completed do
      status { "completed" }
      started_at { 2.minutes.ago }
      completed_at { 1.minute.ago }
      results_count { 1 }
      results do
        [ {
          "title" => "Padaria Pão Quente",
          "phone" => "(41) 3333-0000",
          "phone_unformatted" => "554133330000",
          "address" => "Rua XV de Novembro, 100",
          "city" => "Curitiba",
          "category_name" => "Padaria",
          "place_id" => "lugar-1"
        } ]
      end
    end
  end
end
