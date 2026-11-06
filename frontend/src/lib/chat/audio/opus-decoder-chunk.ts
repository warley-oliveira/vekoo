/**
 * Ponto de entrada de um chunk próprio, só para o decoder ter nome estável. `globIgnores`, na config
 * do PWA em `vite.config.ts`, tira do precache todo arquivo `opus-decoder-chunk-*`: é o que faz os
 * ~117 KB do WASM descerem só para quem precisa deles, e não na instalação, para todo mundo.
 *
 * Único arquivo do projeto que menciona o pacote. Importe-o sempre por `import()`.
 */
export { OggOpusDecoderWebWorker } from "ogg-opus-decoder"
