module FlowRuntime
  module Nodes
    # Grava num campo do contato. Passa pelo `save`, porque é nele que mora a normalização dos campos (ChatRelations::Inbox).
    class SetCustomAttribute < Base
      def call
        return skip("no_chat") unless chat

        # Sem ponto nem `$`, que no Mongo seriam caminho e operador.
        key = data["key"].to_s.parameterize.underscore
        return skip("no_key") if key.blank?

        value = interpolate(data["value"].to_s)
        chat.update(custom_attributes: chat.custom_attributes.to_h.merge(key => value))

        continue(default_next_node_id, log: { input: data, output: { key: key, value: value } })
      end
    end
  end
end
