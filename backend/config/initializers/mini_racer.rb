# Sem JIT, por dois motivos conferidos rodando scripts de verdade:
#
# 1. Limite. Em laço otimizado pelo TurboFan, nem `timeout` nem `max_memory` conseguem
#    parar o script: `while (true) a.push(new Array(1000))` passava de 64 MB, chegava ao
#    limite do heap em menos de 1 s e o V8 abortava o PROCESSO (Sidekiq ou Puma inteiro).
#    Desligar só o OSR não fecha o buraco: uma função aquecida antes chega otimizada ao laço.
# 2. Superfície. Este V8 roda código de cliente dentro do servidor, e o JIT é onde mora a
#    maior parte dos bugs explorados. Sem ele também não há WebAssembly.
#
# O custo é pequeno para script de automação: 5 milhões de iterações levam 36 ms em vez de
# 3 ms, e um script típico não muda. `MiniRacerEngine::Worker` confere o flag a cada
# execução e recusa rodar sem ele. Tem de vir antes do primeiro `MiniRacer::Context` do
# processo.
MiniRacer::Platform.set_flags!(:jitless)
