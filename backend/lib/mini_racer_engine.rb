# Motor de scripts: executa, em V8 isolado, o JavaScript escrito por quem usa a
# plataforma, nos gatilhos de pipeline, nas ações de webhook e nas ferramentas de fluxo.
#
# Contrato completo (como rodar, como acrescentar extensão, limites, erros e a API JS):
# docs/migration/api/script-engine.md
module MiniRacerEngine
  # Erro cuja mensagem chega ao script. Só ASCII: o `mini_racer` entrega a mensagem de
  # exceção Ruby ao JS como Latin-1, e "não" viraria "nÃ£o". Texto com acento vai pelo valor
  # de retorno (`{ ok: false, error: "..." }`), que atravessa em UTF-8.
  class Error < StandardError; end

  # O script passou de um limite por execução (ver `Limits`). O JS pode capturar, mas não
  # ganha mais cota: toda chamada seguinte levanta de novo.
  class LimitExceeded < Error; end
end
