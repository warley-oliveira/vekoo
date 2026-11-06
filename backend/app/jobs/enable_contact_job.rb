# Religa a automação depois da pausa por intervenção humana.
#
# Cancelamento por token, sem desagendar nada: pausar de novo grava outro token em
# `Chat#active_job_id`, e o agendamento antigo chega aqui e não faz nada.
class EnableContactJob < ApplicationJob
  queue_as :default

  def perform(chat_id, organization_id, token = nil)
    chat = Chat.scoped(organization_id, chat_id)
    return unless chat
    return if token && chat.active_job_id != token

    chat.update(
      automation_enabled: true,
      active_job_id: nil,
      automation_resume_at: nil
    )
  end
end
