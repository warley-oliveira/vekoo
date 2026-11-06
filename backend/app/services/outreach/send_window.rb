module Outreach
  # Quando uma campanha pode enviar: dias da semana, faixa de horas e fuso. Regras da origem
  # (Campaigns::LaunchService), que aqui valem na hora de cada envio e não só ao lançar: um worker
  # que volta às 3h da manhã espera a janela abrir, em vez de disparar o atrasado de madrugada.
  class SendWindow
    DAYS_IN_WEEK = 7
    # Dez anos de campanha. Só para a conta terminar, mesmo com um documento torto.
    MAX_ESTIMATED_DAYS = 3_650

    def initialize(campaign)
      @campaign = campaign
      @zone = campaign.time_zone
    end

    # O primeiro instante em que pode enviar, a partir de `time`. Se a janela está aberta,
    # é o próprio `time`.
    def advance(time)
      local = time.in_time_zone(zone)
      local = next_day_start(local) unless allowed_day?(local)
      return local if all_day?

      local = local.change(hour: campaign.send_start_hour, min: 0, sec: 0) if local.hour < campaign.send_start_hour
      local = next_day_start(local) if local.hour >= campaign.send_end_hour
      local
    end

    # O início do próximo dia permitido. Limitado à semana: um dia permitido sempre existe (é
    # validado), e sem o teto um documento torto prenderia a thread para sempre.
    def next_day_start(time)
      local = time.in_time_zone(zone)

      DAYS_IN_WEEK.times do
        local = (local + 1.day).change(hour: campaign.send_start_hour, min: 0, sec: 0)
        return local if allowed_day?(local)
      end

      raise ArgumentError, "Campanha #{campaign.id} sem dia de envio permitido"
    end

    # Quando termina um envio de `count` destinatários por um canal, no ritmo médio.
    #
    # Dia a dia, não destinatário a destinatário: a origem andava mensagem por mensagem, o que em
    # 50 mil contatos prende a requisição de lançar por vários segundos.
    def estimate_completion(count, from:, used_today: 0)
      return nil if count <= 0

      average = campaign.average_buffer
      limit = campaign.daily_limit_per_connector
      cursor = advance(from)
      used = used_today
      remaining = count

      MAX_ESTIMATED_DAYS.times do
        by_time = (seconds_until_close(cursor) / average).floor + 1
        capacity = [ by_time, limit - used ].min

        return cursor + ((remaining - 1) * average).seconds if capacity.positive? && remaining <= capacity

        remaining -= capacity if capacity.positive?
        cursor = next_day_start(cursor)
        used = 0
      end

      nil
    end

    private

    attr_reader :campaign, :zone

    def allowed_day?(local)
      campaign.send_days.include?(local.wday)
    end

    # Fim menor ou igual ao início: janela de 24 horas, sem restrição de hora.
    def all_day?
      campaign.send_end_hour <= campaign.send_start_hour
    end

    def seconds_until_close(local)
      close = all_day? ? local.end_of_day : window_close(local)
      [ close - local, 0 ].max
    end

    # `send_end_hour` vale até 24, que `change` não aceita.
    def window_close(local)
      local.beginning_of_day + campaign.send_end_hour.hours
    end
  end
end
