/**
 * Um único `AudioContext` para o app inteiro. O Safari limita os contextos vivos (por volta de 4)
 * e lança ao estourar: numa conversa com várias notas de voz, um por mensagem quebraria sozinho.
 * Além disso, um contexto desbloqueado dentro de um gesto continua utilizável até a página fechar.
 */

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext
  webkitOfflineAudioContext?: typeof OfflineAudioContext
}

/** `navigator.audioSession` ainda não está nos tipos do TypeScript. */
type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } }

let sharedContext: AudioContext | null = null
let unlocked = false

function createOrReuse(): AudioContext {
  if (!sharedContext || sharedContext.state === "closed") {
    const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext
    if (!Ctor) throw new Error("Web Audio indisponível neste navegador")
    sharedContext = new Ctor()
    unlocked = false
  }
  return sharedContext
}

/**
 * O destravamento do iOS. `resume()` sozinho não basta: o Safari só aceita `start()` vindo de
 * código assíncrono depois que algo tocou de dentro do gesto, e entre o toque no play e o `start()`
 * de verdade há um download e um decode de WASM. Sem este buffer mudo de um sample, o primeiro
 * toque não fazia som, e só o segundo funcionava.
 */
function unlockOnGesture(context: AudioContext) {
  if (unlocked) return
  try {
    const source = context.createBufferSource()
    source.buffer = context.createBuffer(1, 1, 22050)
    source.connect(context.destination)
    source.start(0)
    unlocked = true
  } catch {
    // Se falhar, o `resume()` ainda dá conta nos navegadores menos rígidos.
  }
}

/**
 * Por padrão o iOS trata a Web Audio como som de interface, que obedece à chave de silencioso do
 * aparelho; o `<audio>` entra como mídia. Pedir "playback" põe os dois na mesma categoria: sem
 * isto, só o motor Opus emudecia no modo silencioso. Existe a partir do Safari 17.
 */
function claimPlaybackSession() {
  try {
    const session = (navigator as NavigatorWithAudioSession).audioSession
    if (session && session.type !== "playback") session.type = "playback"
  } catch {
    // Navegador sem suporte, ou que recusa a troca.
  }
}

/**
 * Precisa ser chamada de forma SÍNCRONA dentro do toque no play. No iOS o contexto nasce suspenso e
 * só um `resume()` na mesma tarefa do gesto o coloca para rodar. Qualquer `await` antes disto
 * queima o gesto, e o pior é que nada falha: a tela mostra "tocando", e ninguém ouve nada.
 */
export function acquireAudioContext(): AudioContext {
  claimPlaybackSession()
  const context = createOrReuse()
  if (context.state === "suspended") void context.resume()
  unlockOnGesture(context)
  return context
}

/**
 * Para desenhar a onda, fora de qualquer gesto. `OfflineAudioContext` decodifica igual, não toca no
 * hardware e evita criar o contexto real antes da primeira interação, situação em que o iOS costuma
 * se recusar a destravá-lo depois.
 */
export function createDecodingContext(): BaseAudioContext {
  const Ctor = window.OfflineAudioContext || (window as WebkitWindow).webkitOfflineAudioContext
  if (!Ctor) throw new Error("Web Audio indisponível neste navegador")
  return new Ctor(1, 1, 44100)
}
