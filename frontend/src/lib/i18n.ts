import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next, useTranslation } from "react-i18next"

import en from "@/locales/en.json"
import ptBR from "@/locales/pt-BR.json"

// i18n do app. pt-BR é o idioma de origem (é onde a copy nasce e é revisada);
// en existe desde já para o texto nunca voltar a ser escrito solto no JSX.
// Um único namespace e bundles estáticos — sem carregamento por HTTP, sem estado
// de "traduções carregando" nas telas.
//
// Cada domínio traz o seu arquivo em `locales/<lang>/<dominio>.json` (raiz do JSON
// = nome do domínio) e entra aqui sozinho, pelo glob: ninguém disputa o mesmo
// arquivo e ninguém precisa editar este módulo. `locales/<lang>.json` segue valendo.

export const SUPPORTED_LANGUAGES = ["pt-BR", "en"] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const FALLBACK_LANGUAGE: Language = "pt-BR"

const LANGUAGE_STORAGE_KEY = "vekoo.lang"

type Bundle = Record<string, unknown>

const domainFiles = import.meta.glob<Bundle>("../locales/*/*.json", {
  eager: true,
  import: "default",
})

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

function bundleFor(language: Language, base: Bundle): Bundle {
  return Object.keys(domainFiles)
    .filter((path) => path.split("/").at(-2) === language)
    .sort()
    .reduce((bundle, path) => mergeBundles(bundle, domainFiles[path]), base)
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

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "pt-BR": { translation: bundleFor("pt-BR", ptBR) },
      en: { translation: bundleFor("en", en) },
    },
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

/** Mantém `<html lang>` em dia — leitores de tela e `:lang()` dependem disso. */
function syncDocumentLanguage(language: string) {
  document.documentElement.lang = language
}

syncDocumentLanguage(i18n.resolvedLanguage ?? FALLBACK_LANGUAGE)
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
