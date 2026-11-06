# O copiloto do chat: a IA que ajuda quem atende a achar, resumir e operar conversas, sempre dentro
# do que aquela pessoa pode ver (`chat_list_to`). Fala pelo CopilotChannel e roda em CopilotJob.
module Copilot
  # Quanto custa uma mensagem, de quantas rodadas de ferramenta for. O dobro de reescrever um texto,
  # porque usa o modelo maior e pode chamar vários outros.
  MESSAGE_COST = 2
  MAX_MESSAGE_CHARS = 10_000

  # Só os da organização da sessão: a stream é da pessoa, e `session_id` separa abas.
  def self.stream_name(account_id, session_id)
    "copilot:#{account_id}:#{session_id}"
  end
end
