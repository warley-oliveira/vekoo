##
# app/services/insights/efficiency.rb
#
# Os números de eficiência, a partir do volume de mensagens que já foi contado. Origem:
# `Metrics::EfficiencyDashboard`, que varria as mensagens de novo e só olhava as conversas CRIADAS no
# período: uma conversa de três meses que trocou 40 mensagens hoje valia zero, como a própria origem
# anota em `MessageVolumeDaily`. Aqui vale o que saiu no dia, sem uma agregação a mais.
#
module Insights
  module Efficiency
    # Tempo que uma pessoa levaria para responder cada mensagem, como na origem.
    MINUTES_PER_MESSAGE = 2.1

    module_function

    def hours_saved(automation_messages)
      ((automation_messages.to_i * MINUTES_PER_MESSAGE) / 60.0).round(2)
    end

    # O que a equipe não precisou enviar. Sem o piso, um dia em que a equipe respondeu mais do que a
    # automação tiraria do total: o card diria que a automação "desfez" mensagens.
    def messages_avoided(automation_messages, human_messages)
      [ automation_messages.to_i - human_messages.to_i, 0 ].max
    end

    # Agendamento criado sem pessoa: fluxo ou script. O que vem do Google tem `connector_id`, e o que
    # uma pessoa marca grava o nome dela no histórico.
    def automation_bookings(organization_id)
      ::Agenda::Booking.where(organization_id: organization_id.to_s, connector_id: nil, "event_history.0.by_user" => false)
    end
  end
end
