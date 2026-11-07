import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next, useTranslation } from "react-i18next"

import { buildBundle, type Bundle } from "@/lib/i18n-bundles"
import ptBR from "@/locales/pt-BR.json"

// i18n do app. pt-BR é o idioma de origem (é onde a copy nasce e é revisada);
// en existe desde já para o texto nunca voltar a ser escrito solto no JSX.
// Um único namespace e nenhum estado de "traduções carregando" nas telas: `main.tsx` espera
// `i18nReady` antes de desenhar, e trocar de idioma só vale depois de o idioma chegar.
//
// Cada domínio traz o seu arquivo em `locales/<lang>/<dominio>.json` (raiz do JSON
// = nome do domínio) e entra sozinho, pelo glob: ninguém disputa o mesmo arquivo e
// ninguém precisa editar este módulo. `locales/<lang>.json` segue valendo.
//
// pt-BR vem no pacote inicial, porque também é o fallback; o inglês desce em chunk próprio
// (`i18n-en.ts`). Juntos, eram metade do JavaScript da primeira visita.

export const SUPPORTED_LANGUAGES = ["pt-BR", "en"] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const FALLBACK_LANGUAGE: Language = "pt-BR"

const LANGUAGE_STORAGE_KEY = "vekoo.lang"

const sourceFiles = import.meta.glob<Bundle>("../locales/pt-BR/*.json", {
  eager: true,
  import: "default",
})

// O que não é o idioma de origem chega por aqui, e o i18next espera antes de trocar.
const lazyLanguages = {
  type: "backend" as const,
  init() {},
  read(
    language: string,
    _namespace: string,
    callback: (error: unknown, data: Bundle | boolean) => void
  ) {
    if (language !== "en") return callback(null, false)

    import("@/lib/i18n-en").then(
      (module) => callback(null, module.default),
      (error) => callback(error, false)
    )
  },
}

/**
 * Reduz o que o navegador informa a um idioma que o app realmente fala:
 * "pt", "pt-PT", "pt-br" → `pt-BR`; "en-US", "en-GB" → `en`. Qualquer outra
 * língua sai como veio e cai no fallback.
 */
export function normalizeLanguageTag(tag: string): string {
  const base = tag.trim().toLowerCase().split(/[-_]/)[0]
  if (base === "pt") return "pt-BR"
  if (base === "en") return "en"
  return tag
}

/** Pronto para desenhar. Se o chunk do idioma falhar, resolve assim mesmo, e o texto cai no fallback. */
export const i18nReady = i18n
  .use(LanguageDetector)
  .use(lazyLanguages)
  .use(initReactI18next)
  .init({
    resources: {
      "pt-BR": { translation: buildBundle(ptBR, sourceFiles) },
    },
    partialBundledLanguages: true,
    supportedLngs: SUPPORTED_LANGUAGES,
    // Mapa explícito em vez de `nonExplicitSupportedLngs`: aquela opção resolve
    // "pt-BR" para "pt", que não é um bundle nosso — e aí *toda* chave em
    // português volta como a própria chave. Aqui "pt" e "pt-PT" caem em pt-BR.
    fallbackLng: {
      pt: [FALLBACK_LANGUAGE],
      "pt-PT": [FALLBACK_LANGUAGE],
      default: [FALLBACK_LANGUAGE],
    },
    detection: {
      // 1) escolha explícita da pessoa (menu da conta), 2) idioma do navegador,
      // 3) o `lang` do index.html como último recurso. Sem escolha salva, o app
      // abre no idioma do navegador — e a escolha manual passa a valer sempre.
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
      convertDetectedLanguage: normalizeLanguageTag,
    },
    interpolation: {
      // React já escapa o que renderiza.
      escapeValue: false,
    },
    returnNull: false,
  })
  .catch(() => undefined)

/** Mantém `<html lang>` em dia — leitores de tela e `:lang()` dependem disso. */
function syncDocumentLanguage(language: string) {
  document.documentElement.lang = language
}

i18n.on("languageChanged", syncDocumentLanguage)

/** Idioma ativo, sempre um dos suportados — use para `Intl.*`. */
export function currentLanguage(): Language {
  const resolved = i18n.resolvedLanguage as Language | undefined
  return resolved && SUPPORTED_LANGUAGES.includes(resolved)
    ? resolved
    : FALLBACK_LANGUAGE
}

/** Idioma ativo, reativo à troca — para `Intl.*` dentro de componentes. */
export function useLanguage(): Language {
  const { i18n: instance } = useTranslation()
  const resolved = instance.resolvedLanguage as Language | undefined
  return resolved && SUPPORTED_LANGUAGES.includes(resolved)
    ? resolved
    : FALLBACK_LANGUAGE
}

export default i18n
