# Valor de um campo personalizado em uma conversa (origem: InstanceVariable::Value). A fonte
# de verdade da tela é `Chat#custom_attributes`; este registro é para quem precisa do valor
# como documento próprio.
class CustomFieldValue
  include Mongoid::Document
  include Mongoid::Timestamps

  field :value, type: String

  belongs_to :custom_field, class_name: "CustomField", inverse_of: :values
  belongs_to :chat, class_name: "Chat", optional: true
  belongs_to :audience, class_name: "Audience", optional: true

  index({ custom_field_id: 1 })
  index({ chat_id: 1 })
end
