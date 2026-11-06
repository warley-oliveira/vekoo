FactoryBot.define do
  # Conectores: documentos Mongoid de verdade. Por padrão ativos e sem chamar provedor
  # (nenhum `activate` aqui). Passe `organization:` para escolher a dona.
  factory :connector_whatsapp_cloud, class: "Connector::WhatsappCloud" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    status { :active }
    sequence(:phone_number_id) { |n| 100_000_000 + n }
    sequence(:waba_id) { |n| 200_000_000 + n }
    sequence(:business_id) { |n| 300_000_000 + n }
    access_token { "token-da-meta" }
    verified_name { "Clínica Vida" }
    display_phone_number { "+55 31 3333-0000" }
  end

  factory :connector_whatsapp_web, class: "Connector::WhatsappWeb" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    status { :active }
    provider_api { "evolution_api" }
    base_url { "http://evolution.test" }
    api_key { "chave-evolution" }
    sequence(:instance_name) { |n| "IWA-#{n}" }
    number_id { "5531971810932" }
    profile_name { "Loja da Ana" }

    trait :zapi do
      provider_api { "zapi" }
      base_url { nil }
      api_key { nil }
      zapi_instance_id { "INST123" }
      zapi_token { "TOKABC" }
    end

    trait :aiva do
      provider_api { "aiva_api" }
      base_url { "http://aiva.test" }
    end
  end

  factory :connector_zapi, class: "Connector::Zapi" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    status { :active }
    instance_id { "ZINST" }
    token { "ZTOKEN" }
    profile_name { "Padaria Pão Quente" }
    phone_number { "5531971810932" }
  end

  factory :connector_instagram, class: "Connector::InstagramDirect" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    status { :active }
    auth_provider { "instagram_login" }
    sequence(:instagram_account_id) { |n| "1784#{n}" }
    instagram_username { "lojadaana" }
    instagram_user_access_token { "ig-token" }
  end

  factory :connector_messenger, class: "Connector::FacebookMessenger" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    status { :active }
    sequence(:page_id) { |n| "9900#{n}" }
    page_name { "Loja da Ana" }
    page_access_token { "page-token" }
  end

  factory :connector_lead_chat, class: "Connector::LeadChat" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    status { :active }
    phone_number_id { 5531 }
    access_token { "lead-token" }
  end

  factory :connector_web_widget, class: "Connector::WebWidget" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    status { :active }
    bot_display_name { "Atendimento" }
  end

  factory :oauth_credential do
    organization
    sequence(:key_name) { |n| "erp-#{n}" }
    endpoint { "https://erp.exemplo.com.br/oauth/token" }
    client_id { "cliente-vekoo" }
    client_secret { "segredo-do-cliente" }
  end

  factory :connector_event, class: "ConnectorEvent" do
    organization_id { SecureRandom.uuid }
    name { "Avisar o ERP" }
    event_name { "create_employee" }
    description { "Manda o profissional novo para o ERP" }
    add_attribute(:method) { "post" }
    url { "https://erp.exemplo.com.br/profissionais" }
    parameters_json { '{"id": {employee.id}, "nome": {employee.name}}' }
  end

  factory :daily_chat_stat do
    organization
    sequence(:day) { |n| Date.new(2026, 1, 1) + n.days }
    metrics { { "conversations_total" => 3 } }
  end

  factory :whatsapp_template, class: "WhatsappTemplate" do
    connector factory: :connector_whatsapp_cloud
    sequence(:name) { |n| "lembrete_#{n}" }
    sequence(:template_id) { |n| "tpl-#{n}" }
    language { "pt_BR" }
    category { "UTILITY" }
    # Com status preenchido o modelo não chama a Meta ao ser criado.
    status { :approved }
    components { [ { "type" => "BODY", "text" => "Olá {{1}}" } ] }
  end

  factory :chat, class: "Chat" do
    transient { organization { nil } }

    organization_id { organization&.id || connector&.organization_id || association(:organization).id }
    connector { nil }
    sequence(:external_id) { |n| "553197#{format('%07d', n)}" }
    user_name { "Maria Souza" }
    status { "open" }

    trait :with_connector do
      connector { association(:connector_whatsapp_web, organization: organization) }
    end
  end

  factory :chat_tag, class: "ChatTag" do
    organization_id { association(:organization).id }
    sequence(:name) { |n| "etiqueta-#{n}" }
    color { "#7c3aed" }
  end

  factory :chat_text_message, class: "ChatMessage::Text" do
    chat
    role { "user" }
    content { "Oi, tudo bem?" }
    sequence(:message_id) { |n| "EXT-#{n}" }
  end

  factory :chat_image_message, class: "ChatMessage::Image" do
    chat
    role { "user" }
    image_url { "/rails/active_storage/blobs/proxy/abc/foto.jpg" }
    sequence(:message_id) { |n| "IMG-#{n}" }
  end

  factory :chat_media_message, class: "ChatMessage::Media" do
    chat
    role { "user" }
    media_type { "video" }
    media_url { "/rails/active_storage/blobs/proxy/abc/video.mp4" }
    sequence(:message_id) { |n| "MED-#{n}" }
  end

  factory :chat_audio_message, class: "ChatMessage::Audio" do
    chat
    role { "user" }
    content { "-" }
    audio_url { "/rails/active_storage/blobs/proxy/abc/audio.ogg" }
    sequence(:message_id) { |n| "AUD-#{n}" }
  end
end
