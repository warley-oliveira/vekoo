module Agenda
  # O primeiro horário comercial a partir de um instante, para o passo de sequência não sair de
  # madrugada. As horas são de parede, no fuso do `target` (que precisa vir no fuso do calendário).
  module CommercialTime
    DEFAULT_FROM = 8
    DEFAULT_TO = 17

    module_function

    # @param from [Integer, String, nil] hora em que começa. Vazio vale 8: a origem convertia nil
    #   em 0 e empurrava o passo para a meia-noite do dia seguinte.
    # @param to [Integer, String, nil] hora em que termina. Vazio vale 17.
    def next_after(target, from = nil, to = nil, all_day: false)
      return target if all_day

      from = from.presence&.to_i || DEFAULT_FROM
      to = to.presence&.to_i || DEFAULT_TO

      opening = target.change(hour: from, min: 0, sec: 0)
      closing = to >= 24 ? target.end_of_day : target.change(hour: to, min: 0, sec: 0)

      return target if target.between?(opening, closing)
      return opening if target < opening

      (target + 1.day).change(hour: from, min: 0, sec: 0)
    end
  end
end
