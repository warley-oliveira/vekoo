FactoryBot.define do
  factory :quick_reply do
    organization
    sequence(:name) { |n| "Saudação #{n}" }
    sequence(:trigger) { |n| "saudacao-#{n}" }
    content { "Oi! Como posso ajudar?" }
  end

  factory :chat_view do
    transient { organization_owner { nil } }

    account { organization_owner || association(:account) }
    organization { account.organization }
    sequence(:name) { |n| "Visão #{n}" }
    payload { [ { "attributeKey" => "status", "filterOperator" => "equal_to", "values" => [ "open" ] } ] }
    personal { false }
  end

  factory :attachment do
    organization
    sequence(:name) { |n| "Tabela #{n}" }
    private { false }

    after(:build) do |attachment|
      next if attachment.file.attached?

      attachment.file.attach(
        io: StringIO.new("%PDF-1.4 tabela de preços"),
        filename: "tabela.pdf",
        content_type: "application/pdf"
      )
    end
  end

  factory :custom_field, class: "CustomField" do
    organization_id { association(:organization).id }
    sequence(:name) { |n| "Campo #{n}" }
    value_type { "text" }
  end

  factory :custom_field_value, class: "CustomFieldValue" do
    custom_field
    value { "valor" }
  end

  factory :contact_import do
    organization
    connector_id { BSON::ObjectId.new.to_s }
    total_contacts { 1 }
  end

  factory :contact_import_row do
    contact_import
    name { "Fernanda Lima" }
    phone { "5531971810932" }
  end
end
