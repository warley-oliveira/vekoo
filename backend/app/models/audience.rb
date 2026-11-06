# A pessoa por trás de várias conversas com o mesmo número na organização: conversas
# de conectores diferentes com o mesmo `external_id` apontam para a mesma audiência.
class Audience
  include Mongoid::Document
  include Mongoid::Timestamps

  field :user_name, type: String

  has_many :chats, class_name: "Chat", inverse_of: :audience
end
