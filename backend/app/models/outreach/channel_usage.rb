# Quanto um canal já enviou no dia, por todas as campanhas.
#
# A origem calculava o limite diário ao lançar, simulando os horários. Isso não sobrevive ao resto
# da vida da campanha: retomar zerava a conta, e duas campanhas no mesmo número somavam o dobro.
# O limite existe para proteger o número, então a conta é do número e é feita na hora do envio.
module Outreach
  class ChannelUsage
    include Mongoid::Document

    # O bastante para a estimativa e a investigação. Quem apaga é o próprio Mongo.
    RETENTION = 7.days
    DUPLICATE_KEY = 11_000

    field :_id, type: String, overwrite: true
    field :used, type: Integer, default: 0
    field :expires_at, type: Time

    index({ expires_at: 1 }, { expire_after_seconds: 0 })

    def self.key(channel_key, day)
      "#{channel_key}:#{day}"
    end

    # Reserva um envio, sem nunca passar do limite: a conta e a conferência são a mesma operação
    # atômica, para dois lotes do mesmo canal não passarem juntos pelo último lugar.
    #
    # Lotado, o filtro não casa, e o upsert tenta inserir uma chave que já existe: é esse erro
    # que diz "acabou por hoje".
    #
    # @return [Boolean]
    def self.reserve(channel_key, day, limit)
      collection.find_one_and_update(
        { _id: key(channel_key, day), used: { "$lt" => limit } },
        { "$inc" => { used: 1 }, "$setOnInsert" => { expires_at: RETENTION.from_now } },
        upsert: true
      )
      true
    rescue Mongo::Error::OperationFailure => e
      raise unless e.code == DUPLICATE_KEY

      false
    end

    # Devolve um envio que não aconteceu.
    def self.release(channel_key, day)
      collection.update_one({ _id: key(channel_key, day), used: { "$gt" => 0 } }, { "$inc" => { used: -1 } })
    end

    def self.used_on(channel_key, day)
      where(_id: key(channel_key, day)).pick(:used).to_i
    end
  end
end
