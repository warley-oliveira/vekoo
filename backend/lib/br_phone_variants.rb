# frozen_string_literal: true

# Gera as formas equivalentes de um número brasileiro, para reconciliar
# identificadores que chegam de canais diferentes.
#
# Dois desencontros motivam isto:
#
#   1. 9º dígito — a Meta devolve `wa_id`/`recipient_id` de celulares brasileiros
#      frequentemente sem o 9 (`553171810932`), enquanto a base guarda o número
#      completo (`5531971810932`). As comparações no código são igualdade exata de
#      String, então sem as duas formas o lookup falha silenciosamente.
#   2. sufixo `@s.whatsapp.net` — conversas originadas em Z-API/Evolution guardam o
#      JID completo em `Chat#external_id`, enquanto as de campanha guardam
#      só os dígitos.
#
# Não é um validador nem um formatador de exibição (para isso existe
# `ContactFormatHelper#format_whatsapp_number`, que só *remove* o 9): entradas fora
# do padrão BR voltam apenas normalizadas, nunca vazias.
module BrPhoneVariants
  JID_SUFFIX = "@s.whatsapp.net"

  # `55` + DDD (2 dígitos) + número nacional (8 ou 9 dígitos)
  BR_MSISDN = /\A55(\d{2})(\d{8,9})\z/

  # Celulares brasileiros começam com 9; faixas antigas ainda usam 6-8.
  MOBILE_PREFIX = /\A[6-9]/

  module_function

  # @param msisdn [String, Integer, nil] número em qualquer formato (com máscara, com JID)
  # @return [Array<String>] formas equivalentes, a original primeiro, sem duplicatas
  def call(msisdn)
    digits = digits_of(msisdn)
    return [] if digits.empty?

    with_jid_suffix([ digits, *ninth_digit_variants(digits) ].uniq)
  end

  # Descarta o sufixo de JID antes de limpar, para não concatenar os dígitos do domínio.
  def digits_of(msisdn)
    msisdn.to_s.split("@").first.to_s.gsub(/\D/, "")
  end

  def ninth_digit_variants(digits)
    match = BR_MSISDN.match(digits)
    return [] unless match

    ddd, national = match.captures

    if national.length == 9 && national.start_with?("9")
      [ "55#{ddd}#{national[1..]}" ]
    elsif national.length == 8 && MOBILE_PREFIX.match?(national)
      [ "55#{ddd}9#{national}" ]
    else
      []
    end
  end

  def with_jid_suffix(forms)
    forms.flat_map { |form| [ form, "#{form}#{JID_SUFFIX}" ] }
  end
end
