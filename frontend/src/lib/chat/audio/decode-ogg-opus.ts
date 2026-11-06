/**
 * O worker que não sobe nunca responde: sem um limite, o player ficaria carregando para sempre, em
 * vez de mostrar o erro. O limite cresce com o arquivo, para não derrubar áudio longo em aparelho
 * lento.
 */
function decodeLimit(byteLength: number): number {
  const megabytes = byteLength / (1024 * 1024)
  return 10_000 + megabytes * 5_000
}

function withLimit<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("O decoder de áudio não respondeu")), milliseconds)
  })
  return Promise.race([work, limit]).finally(() => clearTimeout(timer))
}

/**
 * Decodifica Ogg/Opus em WASM, num worker de blob. É o que exige `'wasm-unsafe-eval'` em
 * `script-src` e `blob:` em `worker-src` no `public/_headers`.
 */
export async function decodeOggOpus(
  bytes: Uint8Array,
  context: BaseAudioContext
): Promise<AudioBuffer> {
  const { OggOpusDecoderWebWorker } = await import("./opus-decoder-chunk")

  // `speechQualityEnhancement` fica no padrão de propósito: as outras opções trocam o decoder por um
  // pacote de ~4 MB.
  const decoder = new OggOpusDecoderWebWorker()

  try {
    // O worker só nasce no primeiro pedaço do arquivo: é aqui, e não em `ready`, que ele pode travar.
    const { channelData, samplesDecoded, sampleRate } = await withLimit(
      decoder.ready.then(() => decoder.decodeFile(bytes)),
      decodeLimit(bytes.byteLength)
    )
    if (!samplesDecoded || channelData.length === 0) throw new Error("Nenhum sample decodificado")

    // Sempre 48 kHz. Se o contexto rodar em outra taxa, o próprio nó reamostra ao tocar.
    const buffer = context.createBuffer(channelData.length, samplesDecoded, sampleRate)
    channelData.forEach((channel, index) => {
      // `channel` pode vir maior que `samplesDecoded`: corta antes de copiar.
      buffer.getChannelData(index).set(channel.subarray(0, samplesDecoded))
    })
    return buffer
  } finally {
    // Devolve o worker e a memória do WASM, mesmo se falhar. Sem esperar: um worker que não subiu
    // também não responde a este pedido.
    void decoder.free().catch(() => {})
  }
}
