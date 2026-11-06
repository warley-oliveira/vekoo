module FlowRuntime
  module Nodes
    # Leva a conversa para uma etapa de um funil, por `Funnels::MoveChat`, que confere funil e etapa. Não veio da origem: as
    # colunas do funil eram os passos do assistente, e aqui um bloco substitui isso (decisão 1 do MANIFEST).
    #
    # O fluxo guarda os ids: renomear não quebra. Funil ou etapa apagados depois de publicar não derrubam o fluxo: fica no log,
    # quem escreveu o fluxo recebe o alerta, e a execução segue.
    class SetFunnelStage < Base
      def call
        return skip("no_chat") unless chat

        funnel_id = data["funnel_id"].to_s
        stage_id = interpolate(data["stage_id"].to_s)
        return skip("no_funnel_stage") if funnel_id.blank? || stage_id.blank?

        funnel = organization.funnels.find_by(id: funnel_id)
        return gone unless funnel

        result = Funnels::MoveChat.call(chat: chat, funnel: funnel, stage_id: stage_id)
        continue(default_next_node_id, log: { input: data, output: { funnel_id: funnel.id, stage_id: result.stage.id, moved: result.moved? } })
      rescue Funnels::MoveChat::InvalidStage
        gone
      end

      private

      def gone
        context.execution.alert!("flow_funnel_stage_missing", I18n.t("automation.flows.errors.funnel_stage_missing_alert", name: context.flow.name))
        skip("funnel_stage_not_found")
      end
    end
  end
end
