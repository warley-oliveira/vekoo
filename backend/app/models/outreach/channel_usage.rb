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
    # Quem perde a corrida do primeiro envio do dia precisa só de uma nova tentativa.
    ATTEMPTS = 3
    # Um fuso só para todas as campanhas: é o número que está sendo protegido, e com o fuso de cada
    # campanha o mesmo canal teria duas contas perto da virada do dia.
    DAY_ZONE = "America/Sao_Paulo".freeze

    field :_id, type: String, overwrite: true
    field :used, type: Integer, default: 0
    field :expires_at, type: Time

    index({ expires_at: 1 }, { expire_after_seconds: 0 })

    def self.day_of(time)
      time.in_time_zone(DAY_ZONE).to_date.iso8601
    end

    def self.key(channel_key, day)
      "#{channel_key}:#{day}"
    end

    # Reserva um envio, sem nunca passar do limite: a conta e a conferência são a mesma operação
    # atômica, para dois lotes do mesmo canal não passarem juntos pelo último lugar.
    #
    # Lotado, o filtro não casa, e o upsert tenta inserir uma chave que já existe. O mesmo erro também
    # sai quando dois chegam juntos no primeiro envio do dia: por isso a conta é relida, senão quem
    # perdeu essa corrida dormiria até o dia seguinte com o canal livre.
    #
    # @return [Boolean]
    def self.reserve(channel_key, day, limit)
      attempts = 0

      begin
        collection.find_one_and_update(
          { _id: key(channel_key, day), used: { "$lt" => limit } },
          { "$inc" => { used: 1 }, "$setOnInsert" => { expires_at: RETENTION.from_now } },
          upsert: true
        )
        true
      rescue Mongo::Error::OperationFailure => e
        raise unless e.code == DUPLICATE_KEY

        attempts += 1
        retry if attempts < ATTEMPTS && used_on(channel_key, day) < limit

        false
      end
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
