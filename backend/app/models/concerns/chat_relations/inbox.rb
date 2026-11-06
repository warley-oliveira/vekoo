# O que `Chat` tem do domínio "inbox": quem enxerga cada conversa e a normalização dos campos
# personalizados na escrita. Fica aqui, e não em Chat, para cada domínio evoluir sem disputar
# o mesmo arquivo.
module ChatRelations
  module Inbox
    extend ActiveSupport::Concern

    included do
      # Só roda quando o hash mudou (guarda barata em memória); a busca de regras no Mongo
      # acontece apenas se alguma chave mudou de valor de verdade.
      before_save :normalize_custom_attributes, if: :custom_attributes_changed?
    end

    class_methods do
      # As conversas que a pessoa pode ver, pela permissão `chat_list_to`:
      #
      #   all       tudo da organização
      #   team      as dos departamentos dela e as sem departamento
      #   assigned  as dela e as sem dono nem departamento
      #
      # É a mesma regra do `request_recent` de ChatListChannel. Vale para lista, leitura,
      # escrita, exportação e copiloto: conversa fora daqui responde 404. O seletor pronto
      # também serve de `$match` nas agregações, que passam pelo driver bruto.
      def visible_to(account)
        scope = where(organization_id: account.organization_id.to_s)

        case account.permission_level(:chat_list_to)
        when "all"
          scope
        when "team"
          scope.where(:team_id.in => account.team_ids.map(&:to_s) + [ nil ])
        when "assigned"
          scope.any_of(
            { assigned_account_id: account.id.to_s },
            { assigned_account_id: nil, team_id: nil }
          )
        else
          # Sem `none`: o critério precisa continuar tendo seletor, para virar `$match`.
          scope.where(:_id.in => [])
        end
      end
    end

    private

    # Para as chaves cujo valor mudou neste save e cujo campo tem `auto_normalize`, converte o
    # valor em texto numérico canônico. Sem mudança real, nenhuma consulta é feita: o Mongoid
    # pode marcar o hash como alterado só pela leitura.
    def normalize_custom_attributes
      mutated_keys = mutated_custom_attribute_keys
      return if mutated_keys.empty?

      rules = CustomField
              .where(organization_id: organization_id.to_s, :key.in => mutated_keys, auto_normalize: true)
              .pluck(:key, :normalization_strategy, :normalization_target_key)

      rules.each do |key, strategy, target_key|
        raw = custom_attributes[key]
        next unless raw.is_a?(String)

        normalized = CustomAttributes::ValueNormalizer.normalize(raw, strategy: strategy || "min")
        next unless normalized

        # Com target_key a escrita vai para outro campo e o original é preservado.
        custom_attributes[target_key.presence || key] = normalized
      end
    end

    def mutated_custom_attribute_keys
      previous = custom_attributes_was || {}
      current = custom_attributes || {}
      current.keys.reject { |key| current[key] == previous[key] }
    end
  end
end
