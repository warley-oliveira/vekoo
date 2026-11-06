module FlowRuntime
  module Nodes
    # Leva a conversa para uma etapa de um funil (`Chat#funnel_stages`). Não veio da origem: as colunas do funil eram os
    # passos do assistente, e aqui um bloco substitui isso (decisão 1 do MANIFEST).
    #
    # `$set` só na chave do funil, para não sobrescrever a posição nos outros. O modelo `Funnel` é do domínio insights;
    # quando ele existir, confira aqui que funil e etapa são da organização. Ver as pendências em
    # docs/migration/api/automation.md.
    class SetFunnelStage < Base
      KEY_FORMAT = /\A[\w-]{1,64}\z/

      def call
        return skip("no_chat") unless chat

        funnel_id = data["funnel_id"].to_s
        stage_id = interpolate(data["stage_id"].to_s)
        return skip("no_funnel_stage") unless funnel_id.match?(KEY_FORMAT) && stage_id.match?(KEY_FORMAT)

        Chat.where(organization_id: chat.organization_id, id: chat.id).update_all("$set" => { "funnel_stages.#{funnel_id}" => stage_id })
        chat.dispatch_event!
        continue(default_next_node_id, log: { input: data, output: { funnel_id: funnel_id, stage_id: stage_id } })
      end
    end
  end
end
