# Autorização por recurso. No controlador:
#
#   require_permission :chat
#   require_permission :core_settings, only: %i[create update destroy]
module Permissioned
  extend ActiveSupport::Concern

  class_methods do
    def require_permission(key, **options)
      before_action(**options) do
        render_forbidden unless current_account.can?(key)
      end
    end
  end
end
