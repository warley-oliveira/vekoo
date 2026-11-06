module Funnels
  # Grava o funil e a lista inteira de etapas, na ordem em que vieram. A tela edita a lista de uma vez,
  # como um formulário só: etapa com `id` é renomeada ou movida, sem `id` é nova, e a que não veio sai.
  #
  # A conversa que estava numa etapa apagada cai em "Sem etapa" (o quadro entende), e um job limpa o
  # que ficou gravado nela.
  class Save
    class Refused < StandardError
      attr_reader :code

      def initialize(code)
        @code = code
        super(code)
      end
    end

    # @param stages [Array<Hash>, nil] { id:, name: }. nil deixa as etapas como estão.
    def initialize(funnel, attributes, stages: nil)
      @funnel = funnel
      @attributes = attributes
      @stages = stages
    end

    # @return [Funnel]
    # @raise [Refused] lista de etapas que não pode ser gravada
    # @raise [ActiveRecord::RecordInvalid]
    def call
      entries = stages&.map { |entry| entry.to_h.symbolize_keys.slice(:id, :name) }
      check_stage_list!(entries) if entries || funnel.new_record?

      removed_ids = []
      Funnel.transaction do
        funnel.assign_attributes(attributes)
        funnel.save!
        removed_ids = replace_stages(entries) if entries
      end

      funnel.stages.reset
      Funnels::CleanupChatsJob.perform_later(funnel.organization_id, funnel.id, removed_ids) if removed_ids.any?
      funnel
    end

    private

    attr_reader :funnel, :attributes, :stages

    def check_stage_list!(entries)
      list = Array(entries)
      raise Refused, "stagesRequired" if list.empty?
      raise Refused, "tooManyStages" if list.size > Funnel::MAX_STAGES

      names = list.map { |entry| entry[:name].to_s.squish.downcase }.compact_blank
      raise Refused, "duplicateStageName" if names.uniq.size != names.size
    end

    def replace_stages(entries)
      current = funnel.stages.reload.index_by(&:id)
      kept_ids = entries.filter_map { |entry| entry[:id].presence }
      raise Refused, "invalidStage" if (kept_ids - current.keys).any? || kept_ids.uniq.size != kept_ids.size

      removed = current.keys - kept_ids
      funnel.stages.where(id: removed).delete_all if removed.any?

      entries.each_with_index do |entry, position|
        stage = current[entry[:id].presence] || funnel.stages.new
        stage.update!(name: entry[:name], position: position)
      end

      removed
    end
  end
end
