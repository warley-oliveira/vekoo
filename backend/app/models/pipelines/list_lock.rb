module Pipelines
  # Serializa quem escreve posição numa lista (os cards de uma etapa, as etapas de um quadro).
  #
  # Trava consultiva, e não `SELECT FOR UPDATE` na linha da etapa: a linha da etapa é pai de todos os
  # cards dela, e uma trava ali esperaria por qualquer `INSERT` com chave estrangeira apontando para
  # ela. Liberada sozinha no fim da transação. Por isso só vale dentro de uma.
  module ListLock
    module_function

    # Em ordem: duas transações travando as mesmas duas listas nunca se esperam em ciclo.
    #
    # `exec_query`, e não `select_value`: esse passa pelo cache de consultas da requisição, e a
    # segunda transação da mesma requisição ficaria sem a trava, achando que já a pegou.
    def acquire(*keys)
      connection = ApplicationRecord.lease_connection

      keys.flatten.compact.map(&:to_s).uniq.sort.each do |key|
        connection.exec_query(
          ApplicationRecord.sanitize_sql_array([ "SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(?, 0))", "pipelines:#{key}" ])
        )
      end
    end
  end
end
