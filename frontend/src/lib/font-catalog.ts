// Catálogo aberto de fontes (Google Fonts) para quem não tem arquivo próprio.
// Lista curada e curta de propósito: a pessoa escolhe entre poucas fontes
// boas, não entre mil. Os pesos são os que cada família publica — pedir um
// peso inexistente faria a folha inteira falhar.
//
// A vitrine não é o limite: quem já tem uma fonte aberta no manual (Libre
// Caslon Text, Inter Tight…) usa a dela. O índice inteiro do Google Fonts
// (`google-fonts.json`, espelho de `backend/config/google_fonts.json`, gerado
// por `bin/rails fonts:directory`) carrega sob demanda, fora do bundle.

export type FontCategory = "sans" | "serif" | "display" | "mono"

export type CatalogFont = {
  family: string
  category: FontCategory
  weights: number[]
}

const range = (from: number, to: number) => {
  const list: number[] = []
  for (let w = from; w <= to; w += 100) list.push(w)
  return list
}

export const FONT_CATALOG: readonly CatalogFont[] = [
  { family: "Inter", category: "sans", weights: range(100, 900) },
  { family: "Geist", category: "sans", weights: range(100, 900) },
  { family: "DM Sans", category: "sans", weights: range(100, 900) },
  { family: "Manrope", category: "sans", weights: range(200, 800) },
  { family: "Plus Jakarta Sans", category: "sans", weights: range(200, 800) },
  { family: "Work Sans", category: "sans", weights: range(100, 900) },
  { family: "Nunito", category: "sans", weights: range(200, 900) },
  { family: "Poppins", category: "sans", weights: range(100, 900) },
  { family: "Montserrat", category: "sans", weights: range(100, 900) },
  { family: "Raleway", category: "sans", weights: range(100, 900) },
  { family: "Outfit", category: "sans", weights: range(100, 900) },
  { family: "Figtree", category: "sans", weights: range(300, 900) },
  { family: "Sora", category: "sans", weights: range(100, 800) },
  { family: "Space Grotesk", category: "sans", weights: range(300, 700) },
  { family: "Bricolage Grotesque", category: "sans", weights: range(200, 800) },
  { family: "Archivo", category: "sans", weights: range(100, 900) },
  { family: "Lexend", category: "sans", weights: range(100, 900) },
  { family: "Rubik", category: "sans", weights: range(300, 900) },
  { family: "Fraunces", category: "serif", weights: range(100, 900) },
  { family: "Playfair Display", category: "serif", weights: range(400, 900) },
  { family: "DM Serif Display", category: "serif", weights: [400] },
  { family: "Lora", category: "serif", weights: range(400, 700) },
  { family: "Merriweather", category: "serif", weights: range(300, 900) },
  { family: "Libre Baskerville", category: "serif", weights: [400, 700] },
  { family: "Cormorant Garamond", category: "serif", weights: range(300, 700) },
  { family: "EB Garamond", category: "serif", weights: range(400, 800) },
  { family: "Instrument Serif", category: "serif", weights: [400] },
  { family: "Newsreader", category: "serif", weights: range(200, 800) },
  { family: "Bebas Neue", category: "display", weights: [400] },
  { family: "Anton", category: "display", weights: [400] },
  { family: "Unbounded", category: "display", weights: range(200, 900) },
  { family: "Syne", category: "display", weights: range(400, 800) },
  { family: "Abril Fatface", category: "display", weights: [400] },
  { family: "JetBrains Mono", category: "mono", weights: range(100, 800) },
  { family: "IBM Plex Mono", category: "mono", weights: range(100, 700) },
  { family: "Space Mono", category: "mono", weights: [400, 700] },
]

export function findCatalogFont(family: string): CatalogFont | undefined {
  return FONT_CATALOG.find((font) => font.family === family)
}

let directory: ReadonlyMap<string, CatalogFont> | undefined
let directoryLoad: Promise<readonly CatalogFont[]> | undefined

/** O índice inteiro do Google Fonts, baixado uma vez (~20 KB comprimido). */
export function loadFontDirectory(): Promise<readonly CatalogFont[]> {
  directoryLoad ??= import("./google-fonts.json")
    .then(({ default: rows }) => {
      const fonts = rows as CatalogFont[]
      directory = new Map(fonts.map((font) => [font.family, font]))
      return fonts
    })
    .catch((error: unknown) => {
      directoryLoad = undefined
      throw error
    })
  return directoryLoad
}

/** Vitrine primeiro; depois o índice inteiro, se já carregou. */
export function findOpenFont(family: string): CatalogFont | undefined {
  return findCatalogFont(family) ?? directory?.get(family)
}

const loaded = new Set<string>()

/**
 * Carrega a folha de uma fonte aberta uma vez por família. Só para o
 * preview: o carrossel exportado embute a fonte por conta própria. Fora da
 * vitrine e sem pesos na mão, espera o índice dizer quais pesos existem.
 */
export function ensureCatalogFont(family: string, weights?: readonly number[]): void {
  if (!family) return
  const known = findOpenFont(family)?.weights ?? (weights?.length ? weights : undefined)
  if (!known) {
    void loadFontDirectory()
      .then(() => findOpenFont(family) && ensureCatalogFont(family))
      .catch(() => undefined)
    return
  }
  const key = `${family}:${known.join(";")}`
  if (loaded.has(key)) return
  loaded.add(key)

  const name = encodeURIComponent(family).replace(/%20/g, "+")
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?family=${name}:wght@${known.join(";")}&display=swap`
  document.head.appendChild(link)
}

/** Fonte enviada por arquivo: registra um `@font-face` apontando para a URL. */
export function ensureFileFont(family: string, url: string): void {
  const key = `file:${family}:${url}`
  if (!family || loaded.has(key) || typeof FontFace === "undefined") return
  loaded.add(key)

  const face = new FontFace(family, `url(${url})`)
  face
    .load()
    .then((loadedFace) => document.fonts.add(loadedFace))
    .catch(() => loaded.delete(key))
}

/** Nome de família seguro para `font-family` (com fallback genérico). */
export function fontStack(family: string, category?: FontCategory): string {
  const generic = category === "serif" ? "serif" : category === "mono" ? "monospace" : "sans-serif"
  return family ? `"${family}", ${generic}` : `var(--font-sans)`
}
