module Agenda
  # Interpolação literal dos dados de um agendamento numa mensagem. Aqui o texto configurado é a
  # mensagem final: precisa chegar igual, na hora, sem custo e sem risco de um modelo inventar um
  # horário.
  #
  # As variáveis ficam em português porque quem as escreve é quem configura a mensagem.
  # `colaborador` e `user_name` são os nomes que a origem usava, e continuam valendo.
  #
  # Data e hora sempre no fuso do calendário: o servidor roda em UTC.
  module BookingPlaceholders
    KEYS = %w[nome user_name telefone servico profissional colaborador titulo data hora link_reuniao].freeze

    PATTERN = /\{\{(#{Regexp.union(KEYS)})\}\}/

    module_function

    def render(template, booking)
      values = variables(booking)
      template.to_s.gsub(PATTERN) { values[Regexp.last_match(1)] }
    end

    def variables(booking)
      chat = booking.chat
      start_at = booking.local_start
      professional = booking.professional&.name.to_s

      {
        "nome" => chat&.user_name.to_s,
        "user_name" => chat&.user_name.to_s,
        "telefone" => chat&.phone_number.to_s,
        "servico" => booking.service&.name.to_s,
        "profissional" => professional,
        "colaborador" => professional,
        "titulo" => booking.title.to_s,
        "data" => start_at ? I18n.l(start_at.to_date, format: :long, locale: :"pt-BR") : "",
        "hora" => start_at ? start_at.strftime("%H:%M") : "",
        "link_reuniao" => booking.google_meet_url.to_s
      }
    end
  end
end
