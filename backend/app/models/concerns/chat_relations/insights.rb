# O que `Chat` tem do domínio "insights": a posição da conversa nos funis. Fica aqui, e não em Chat,
# para cada domínio evoluir sem disputar o mesmo arquivo. O campo `funnel_stages` já nasceu em Chat:
# `{ "<funnel_id>" => "<stage_id>" }`.
#
# A escrita é atômica na chave de um funil, sem passar por `set` nem por `save`: os dois regravam o
# mapa inteiro a partir do que está em memória, e aí mover a conversa em um funil desfaria um
# movimento simultâneo em outro.
module ChatRelations
  module Insights
    extend ActiveSupport::Concern

    # A etapa em que a conversa está neste funil, ou nil.
    def funnel_stage_id(funnel_id)
      funnel_stages.to_h[funnel_id.to_s]
    end

    def place_in_funnel!(funnel_id, stage_id)
      write_funnel_stages("$set" => { "funnel_stages.#{funnel_id}" => stage_id.to_s, "updated_at" => Time.current })
    end

    def remove_from_funnel!(funnel_id)
      write_funnel_stages("$unset" => { "funnel_stages.#{funnel_id}" => "" }, "$set" => { "updated_at" => Time.current })
    end

    private

    def write_funnel_stages(update)
      fresh = self.class.collection.find_one_and_update(
        { _id: id, organization_id: organization_id },
        update,
        return_document: :after,
        projection: { funnel_stages: 1, updated_at: 1 }
      )
      raise Mongoid::Errors::DocumentNotFound.new(self.class, id) unless fresh

      # O banco já está certo: isto só alinha a instância, sem deixar nada para um `save` regravar.
      attributes["funnel_stages"] = fresh["funnel_stages"] || {}
      attributes["updated_at"] = fresh["updated_at"]
      changed_attributes.except!("funnel_stages", "updated_at")
      self
    end
  end
end
