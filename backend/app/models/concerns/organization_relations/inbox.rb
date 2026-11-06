# Associações da organização com o domínio "inbox". Ficam aqui, e não em Organization, para
# cada domínio evoluir sem disputar o mesmo arquivo.
#
# Campos personalizados vivem no Mongo, por isso são consulta e não `has_many`.
module OrganizationRelations
  module Inbox
    extend ActiveSupport::Concern

    included do
      has_many :quick_replies, dependent: :delete_all
      has_many :chat_views, dependent: :delete_all
      # `destroy`: cada anexo leva o arquivo junto.
      has_many :attachments, dependent: :destroy
      has_many :contact_imports, dependent: :destroy
    end

    def custom_fields
      CustomField.where(organization_id: id.to_s)
    end
  end
end
