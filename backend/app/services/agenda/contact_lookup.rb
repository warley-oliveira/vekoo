module Agenda
  # As conversas de uma lista de inscrições ou presenças: uma consulta só, sempre escopada pela
  # organização, como toda busca em `Chat`.
  module ContactLookup
    FIELDS = %i[organization_id user_name profile_picture_url external_id].freeze

    module_function

    # @return [Hash] { chat_id => Chat, só com os campos que a tela mostra }
    def for(records)
      ids = records.filter_map(&:chat_id).uniq
      return {} if ids.empty?

      Chat.where(organization_id: records.first.organization_id, :id.in => ids).only(*FIELDS).index_by(&:id)
    end
  end
end
