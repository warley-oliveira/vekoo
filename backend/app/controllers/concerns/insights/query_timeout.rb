module Insights
  # A agregação que passa do tempo é recusa, com o que fazer a seguir, e não um 500: o `maxTimeMS` existe
  # justamente para o servidor largar a consulta antes de ela pesar para todo mundo.
  module QueryTimeout
    extend ActiveSupport::Concern

    # O código do Mongo para `maxTimeMS` estourado.
    MAX_TIME_EXPIRED = 50

    included do
      rescue_from Mongo::Error::OperationFailure do |error|
        raise error unless error.code == MAX_TIME_EXPIRED

        render_error(status: :service_unavailable, code: "queryTimeout", message: t("insights.errors.query_timeout"))
      end
    end
  end
end
