/**
 * Um cache mínimo de `AudioBuffer`. PCM a 48 kHz custa ~192 KB por segundo: uma nota de voz de um
 * minuto ocupa ~11,5 MB, e o Safari do iPhone mata a aba muito antes de 20 áudios guardados. Duas
 * entradas cobrem o que acontece de verdade (ouvir de novo, voltar uma mensagem). O resto decodifica
 * outra vez, o que para uma nota de voz custa poucas centenas de milissegundos.
 */

const MAX_ENTRIES = 2
const MAX_BYTES = 40 * 1024 * 1024

const entries = new Map<string, AudioBuffer>()

function totalBytes(): number {
  let total = 0
  entries.forEach((buffer) => {
    total += buffer.length * buffer.numberOfChannels * 4
  })
  return total
}

export function getCachedBuffer(key: string): AudioBuffer | null {
  const buffer = entries.get(key)
  if (!buffer) return null
  // Reinserir joga a chave para o fim da ordem do Map: é assim que ele vira LRU.
  entries.delete(key)
  entries.set(key, buffer)
  return buffer
}

export function setCachedBuffer(key: string, buffer: AudioBuffer): void {
  entries.delete(key)
  entries.set(key, buffer)

  while (entries.size > MAX_ENTRIES || (entries.size > 1 && totalBytes() > MAX_BYTES)) {
    const oldest = entries.keys().next()
    if (oldest.done) break
    entries.delete(oldest.value)
  }
}
