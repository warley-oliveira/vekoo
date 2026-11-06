module Agenda
  # Horário que vem de fora. O servidor roda em UTC, então nada aqui pode depender do fuso da
  # máquina: texto sem deslocamento é hora de parede no fuso do calendário.
  module TimeInput
    class Invalid < ArgumentError; end

    OFFSET = /\s*(?:Z|[+-]\d{2}(?::?\d{2})?)\z/i
    # A API devolve datas em milissegundos, e a tela devolve o mesmo valor.
    EPOCH_MS = /\A\d{10,}\z/

    module_function

    # Entrada da API. Aceita milissegundos, ISO-8601 com deslocamento (vale o instante) e texto
    # sem deslocamento (vale a hora de parede no fuso dado).
    #
    # @return [ActiveSupport::TimeWithZone, nil] nil só para vazio
    # @raise [Invalid] se não der para entender
    def parse(value, zone)
      case value
      when nil, "" then nil
      when Numeric then from_epoch(value, zone)
      when Time, DateTime, ActiveSupport::TimeWithZone then value.in_time_zone(zone)
      when Date then zone.local(value.year, value.month, value.day)
      else parse_text(value.to_s.strip, zone)
      end
    end

    # Texto escrito à mão ou por um modelo: o deslocamento que vier é ignorado, e vale a hora de
    # parede. É o contrato que a origem já tinha ("10:00" é sempre 10:00 no fuso do negócio).
    #
    # @return [ActiveSupport::TimeWithZone, nil] nil se não der para entender
    def local(value, zone)
      case value
      when nil, "" then nil
      when Time, DateTime, ActiveSupport::TimeWithZone then value.in_time_zone(zone)
      when Date then zone.local(value.year, value.month, value.day)
      else zone.parse(value.to_s.strip.sub(OFFSET, ""))
      end
    rescue ArgumentError
      nil
    end

    def from_epoch(value, zone)
      Time.at(value.to_f / 1000).in_time_zone(zone)
    end

    def parse_text(text, zone)
      return from_epoch(text.to_i, zone) if text.match?(EPOCH_MS)

      zone.parse(text) || raise(Invalid, text)
    rescue ArgumentError
      raise Invalid, text
    end
  end
end
