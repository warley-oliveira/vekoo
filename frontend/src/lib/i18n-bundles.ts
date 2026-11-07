// Como os arquivos de tradução viram um bundle só. Fora de `i18n.ts` porque o inglês desce em um
// chunk próprio (`i18n-en.ts`) e usa a mesma conta.

export type Bundle = Record<string, unknown>

function isBundle(value: unknown): value is Bundle {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Funde por chave: dois arquivos podem contribuir para a mesma raiz. */
function mergeBundles(base: Bundle, extra: Bundle): Bundle {
  const merged: Bundle = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    const current = merged[key]
    merged[key] =
      isBundle(current) && isBundle(value) ? mergeBundles(current, value) : value
  }
  return merged
}

/** `locales/<lang>.json` e depois os arquivos por domínio, em ordem de nome. */
export function buildBundle(base: Bundle, domainFiles: Record<string, Bundle>): Bundle {
  return Object.keys(domainFiles)
    .sort()
    .reduce((bundle, path) => mergeBundles(bundle, domainFiles[path]), base)
}
