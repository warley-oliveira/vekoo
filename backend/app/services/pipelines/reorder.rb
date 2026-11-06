module Pipelines
  # Reordena uma lista inteira de uma vez: um `UPDATE` só, sobre a trava da lista, sem callback.
  #
  # A origem fazia um `insert_at` por item: N saves, cada um deslocando os vizinhos e disparando
  # transmissão e gatilho de "card atualizado", para uma ordem que nenhum dado de negócio mudou.
  class Reorder
    MAX_IDS = 2_000

    class TooManyIds < StandardError; end

    # Os ids pedidos vão para o começo, nessa ordem, e o resto da lista vem depois, na ordem em que
    # estava. Um id que não é da lista levanta RecordNotFound: 404, sem mexer em nada.
    #
    # @param scope [ActiveRecord::Relation] a lista inteira, de um pai só
    # @param lock_key [String] o id do pai
    def self.call(scope:, ordered_ids:, lock_key:)
      ids = normalize(ordered_ids)

      scope.klass.transaction do
        ListLock.acquire(lock_key)

        current = scope.unscope(:order).order(:position, :created_at).pluck(:id)
        raise ActiveRecord::RecordNotFound if (ids - current).any?

        write(scope.klass, (ids + (current - ids)).each_with_index.map { |id, index| [ id, index + 1 ] })
      end
    end

    # Permuta só as posições que estes itens já ocupam, sem deslocar o resto da lista: é o que deixa
    # quem só enxerga os próprios cards reordená-los sem encostar nos que não vê.
    def self.among(scope:, ordered_ids:, lock_key:)
      ids = normalize(ordered_ids)

      scope.klass.transaction do
        ListLock.acquire(lock_key)

        rows = scope.unscope(:order).where(id: ids).pluck(:id, :position)
        raise ActiveRecord::RecordNotFound if rows.size != ids.size

        write(scope.klass, ids.zip(rows.map(&:last).sort))
      end
    end

    def self.normalize(ordered_ids)
      ids = Array(ordered_ids).map(&:to_s).uniq
      raise TooManyIds if ids.size > MAX_IDS

      ids
    end
    private_class_method :normalize

    def self.write(model, pairs)
      return if pairs.empty?

      placeholders = Array.new(pairs.size, "(?::uuid, ?::integer)").join(", ")
      model.lease_connection.exec_update(model.sanitize_sql_array([ <<~SQL.squish, *pairs.flatten ]))
        UPDATE #{model.quoted_table_name} AS list SET position = wanted.position
        FROM (VALUES #{placeholders}) AS wanted(id, position)
        WHERE list.id = wanted.id AND list.position IS DISTINCT FROM wanted.position
      SQL
    end
    private_class_method :write
  end
end
