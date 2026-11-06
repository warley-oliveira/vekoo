module MiniRacerEngine
  # Os limites de uma execução. Na origem eram opcionais (sem `timeout_ms` o V8 rodava sem
  # teto, e memória não tinha limite nenhum): aqui valem sempre, e quem chama só escolhe
  # dentro da faixa.
  module Limits
    # Tempo total da execução, em relógio de parede.
    DEFAULT_TIMEOUT_MS = 15_000
    MAX_TIMEOUT_MS = 60_000

    # Heap do V8.
    DEFAULT_MAX_MEMORY = 64.megabytes
    MAX_MEMORY = 256.megabytes
    # O mínimo que o V8 precisa para subir e rodar o que o motor carrega antes do script.
    MIN_MEMORY = 8.megabytes

    # Soma do que o script aloca em ArrayBuffer e typed arrays, que moram fora do heap e o
    # `max_memory` não enxerga. É acumulado, não o pico: o GC não devolve cota.
    MAX_BINARY_BYTES = 128.megabytes
    # O que um builtin aceita varrer de uma vez, sem voltar ao JS. Ver `Sandbox`. Nada maior
    # que isto cabe no heap padrão: 2^22 itens são 32 MB só de ponteiros, e com 2^24 o
    # `Object.entries` abortava o processo.
    MAX_COLLECTION_ITEMS = 2**22
    # Texto tem teto próprio, acima do tamanho de uma resposta de `fetch`, para o
    # `JSON.parse(await res.text())` funcionar.
    MAX_TEXT_CHARS = 2**24
    # Objetos `Intl` por execução: também ficam fora do heap, até uns 27 KB cada.
    MAX_INTL_OBJECTS = 5_000

    # O resultado do script, já em JSON.
    MAX_RESULT_BYTES = 5.megabytes
    MAX_RESULT_DEPTH = 100

    # Chamadas a extensões por execução. `console.*` fica de fora: tem teto próprio.
    MAX_CALLS = 5_000
    # Chamadas de rede por execução: `fetch`, `request`, `downloadFile` e `maps.*`.
    MAX_FETCHES = 50
    MAX_RESPONSE_BYTES = 5.megabytes
    MAX_TOTAL_RESPONSE_BYTES = 20.megabytes
    MAX_DOWNLOAD_BYTES = 25.megabytes
    FETCH_TIMEOUT_SECONDS = 45
    DOWNLOAD_TIMEOUT_SECONDS = 120
    MAX_REDIRECTS = 5
    # Portas web. Fora delas, nada: é o que impede o script de falar SMTP, Redis ou Postgres
    # num endereço público. Liberar outra é uma linha aqui.
    FETCH_PORTS = [ 80, 443, 8080, 8443 ].freeze

    # Gravação em `collection.*` e em `contactStorage`/`contactAttribute`, por execução.
    MAX_STORED_BYTES = 50.megabytes

    # O que `console.*` manda para o log: além disto, some em silêncio.
    MAX_CONSOLE_LINES = 500
    MAX_CONSOLE_CHARS = 2_000

    MAX_SLEEP_SECONDS = 30.0

    module_function

    def timeout_ms(value)
      ms = value.to_i
      ms.positive? ? ms.clamp(1, MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS
    end

    def max_memory(value)
      bytes = value.to_i
      bytes.positive? ? bytes.clamp(MIN_MEMORY, MAX_MEMORY) : DEFAULT_MAX_MEMORY
    end
  end
end
