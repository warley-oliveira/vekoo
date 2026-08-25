# Serialização explícita: cada recurso diz, em um lugar só, exatamente quais
# campos saem — nada de `to_json` do modelo vazando coluna nova sem querer.
#
# Chaves em camelCase e datas em **milissegundos desde a época** porque é essa
# a forma que o front já usa (`editedAt: number`, `Intl` para exibir). Trocar o
# mock pelo servidor não deve mexer nas telas.
class ApplicationSerializer
  def self.one(record)
    raise NotImplementedError
  end

  def self.many(records)
    records.map { |record| one(record) }
  end

  def self.epoch_ms(time)
    return nil if time.nil?

    (time.to_f * 1000).round
  end
end
