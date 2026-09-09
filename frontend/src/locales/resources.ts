// Os bundles de tradução, montados dos arquivos por módulo.
//
// `import.meta.glob` com `eager` resolve em tempo de build: criar
// `src/locales/<idioma>/<módulo>.json` já entra no bundle — esta costura não
// muda. Um idioma novo é uma pasta nova aqui mais uma linha em
// `SUPPORTED_LANGUAGES` (`lib/i18n.ts`).
//
// Namespace único de propósito: o app é pequeno e os bundles são estáticos.
// A separação por arquivo é para quem escreve copy, não para o runtime.

type Bundle = Record<string, unknown>

const files = import.meta.glob<Bundle>("./*/*.json", { eager: true, import: "default" })

export const resources = Object.entries(files).reduce<Record<string, { translation: Bundle }>>(
  (acc, [file, bundle]) => {
    // "./pt-BR/brand.json" → "pt-BR"
    const language = file.split("/")[1]
    acc[language] ??= { translation: {} }
    Object.assign(acc[language].translation, bundle)
    return acc
  },
  {}
)

/** Os idiomas que têm arquivo — para conferir contra `SUPPORTED_LANGUAGES`. */
export const bundledLanguages = Object.keys(resources)
