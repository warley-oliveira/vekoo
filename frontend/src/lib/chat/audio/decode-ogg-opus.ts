/** O áudio em bytes, com a mesma forma do fetch da onda: sem cabeçalho que dispare preflight. */
export async function fetchAudioBytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`download ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
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
    await decoder.ready
    const { channelData, samplesDecoded, sampleRate } = await decoder.decodeFile(bytes)
    if (!samplesDecoded || channelData.length === 0) throw new Error("Nenhum sample decodificado")

    // Sempre 48 kHz. Se o contexto rodar em outra taxa, o próprio nó reamostra ao tocar.
    const buffer = context.createBuffer(channelData.length, samplesDecoded, sampleRate)
    channelData.forEach((channel, index) => {
      // `channel` pode vir maior que `samplesDecoded`: corta antes de copiar.
      buffer.getChannelData(index).set(channel.subarray(0, samplesDecoded))
    })
    return buffer
  } finally {
    // Devolve o worker e a memória do WASM, mesmo se falhar.
    await decoder.free().catch(() => {})
  }
}
