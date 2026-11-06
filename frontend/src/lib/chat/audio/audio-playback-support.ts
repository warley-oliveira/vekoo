/**
 * Este navegador consegue tocar este arquivo?
 *
 * O back-end converte quase todo áudio para Ogg/Opus, e o Safari (iOS e macOS) não decodifica Opus
 * em container nenhum: daí o áudio tocar no Chrome e não tocar no iPhone. Mas nem todo arquivo é
 * Opus: canal na API oficial recebe MP3, que o iOS toca. Por isso a decisão é por arquivo, nunca
 * por navegador.
 */

export type AudioContainer = "ogg" | "playable" | "unknown"

let cachedOggSupport: boolean | null = null

/** Chrome, Firefox e Android respondem "probably"; o Safari responde "". */
export function canPlayOggOpus(): boolean {
  if (cachedOggSupport === null) {
    const probe = document.createElement("audio")
    cachedOggSupport = probe.canPlayType('audio/ogg; codecs="opus"') !== ""
  }
  return cachedOggSupport
}

/**
 * Pelos primeiros bytes: é a autoridade. Não dá para confiar na extensão, porque o job que baixa
 * áudio do WhatsApp salva bytes Ogg com nome `.mp3`, e a chave no CDN nem extensão tem.
 */
export function sniffContainer(bytes: Uint8Array): AudioContainer {
  if (bytes.length < 12) return "unknown"

  // 'OggS'
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return "ogg"
  // 'ID3' (MP3 com tag)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "playable"
  // Sincronismo de quadro do MP3
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "playable"
  // 'ftyp' no offset 4: MP4, M4A, AAC
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "playable"
  // 'RIFF': WAV
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "playable"

  return "unknown"
}

/** Um palpite grátis pela URL, para quando os bytes ainda não chegaram. */
export function guessContainerFromUrl(url: string): AudioContainer {
  let path = url.toLowerCase()
  try {
    path = new URL(url, window.location.href).pathname.toLowerCase()
  } catch {
    // Relativa ou malformada: o toLowerCase acima já serve.
  }

  if (/\.(ogg|oga|opus)$/.test(path)) return "ogg"
  if (/\.(mp3|m4a|aac|mp4|wav|caf)$/.test(path)) return "playable"
  return "unknown"
}

/** O decoder em WASM só entra para Opus em navegador que não o decodifica. */
export function needsOpusFallback(container: AudioContainer | undefined): boolean {
  return container === "ogg" && !canPlayOggOpus()
}
