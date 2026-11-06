/**
 * Bundle velho: depois de um deploy, os chunks com hash antigo saem do servidor e um
 * `import()` tardio falha. Não adianta tentar de novo no mesmo documento: só
 * recarregar resolve.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const { name, message } = error
  return (
    name === "ChunkLoadError" ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Loading chunk .* failed/i.test(message)
  )
}
