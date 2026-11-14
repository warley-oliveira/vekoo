import { useSyncExternalStore } from "react"

import { safeLocalStorage } from "@/lib/safe-local-storage"

/*
 * O tema: claro, escuro ou o do sistema (o padrão). A escolha fica no navegador; o tema que vale
 * é a classe `dark` no `<html>`, e os tokens de `index.css` fazem o resto. Componente nenhum
 * precisa saber o tema para pintar: só quem desenha fora do CSS (Monaco, sonner, xyflow, cor da
 * pessoa calculada em JS) lê `useResolvedTheme()`.
 *
 * `public/theme-init.js` aplica a mesma regra antes da primeira pintura. Mudou a chave, os
 * valores ou as cores da barra do navegador aqui? Mude lá também.
 */

export const THEME_PREFERENCES = ["light", "dark", "system"] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "vekoo.theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"
/** `--background` de cada tema, em hex: a barra do navegador e do PWA não leem variável de CSS. */
const BROWSER_CHROME: Record<ResolvedTheme, string> = { light: "#fefdfd", dark: "#0e0e11" }
/** Duração do caminho sem View Transitions (`theme-switching` em `index.css`), com folga. */
const FALLBACK_TRANSITION_MS = 260

function readPreference(): ThemePreference {
  const stored = safeLocalStorage.getItem(STORAGE_KEY)
  return stored === "light" || stored === "dark" ? stored : "system"
}

function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light"
}

let preference: ThemePreference = typeof window === "undefined" ? "system" : readPreference()
let resolved: ResolvedTheme = preference === "system" ? systemTheme() : preference
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function paint(theme: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BROWSER_CHROME[theme])
}

/**
 * Pinta o tema novo. Com View Transitions, a página atravessa inteira num quadro; sem elas, as
 * cores transitam por 200 ms. Quem pediu menos movimento troca na hora.
 */
function applyResolved(next: ResolvedTheme, animate: boolean) {
  if (next === resolved && document.documentElement.classList.contains("dark") === (next === "dark")) return
  resolved = next
  const reduced = window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false

  if (!animate || reduced) {
    paint(next)
  } else if (typeof document.startViewTransition === "function") {
    document.startViewTransition(() => paint(next))
  } else {
    const root = document.documentElement
    root.classList.add("theme-switching")
    paint(next)
    window.setTimeout(() => root.classList.remove("theme-switching"), FALLBACK_TRANSITION_MS)
  }
  emit()
}

/** Troca a preferência e guarda no navegador. */
export function setThemePreference(next: ThemePreference) {
  preference = next
  if (next === "system") safeLocalStorage.removeItem(STORAGE_KEY)
  else safeLocalStorage.setItem(STORAGE_KEY, next)
  emit()
  applyResolved(next === "system" ? systemTheme() : next, true)
}

let started = false

/**
 * Liga o tema ao resto do mundo: segue o sistema quando a preferência é "Sistema" e acompanha a
 * troca feita em outra aba. Chame uma vez, antes de montar o app.
 */
export function startTheme() {
  if (started || typeof window === "undefined") return
  started = true
  // `theme-init.js` já pintou; aqui só confirma, sem animar (cobre um HTML em cache sem ele).
  paint(resolved)

  window.matchMedia?.(DARK_QUERY).addEventListener("change", () => {
    if (preference === "system") applyResolved(systemTheme(), true)
  })
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    preference = readPreference()
    emit()
    applyResolved(preference === "system" ? systemTheme() : preference, true)
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** O que a pessoa escolheu: `light`, `dark` ou `system`. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference, () => "system")
}

/** O tema que está na tela agora, já resolvido o "Sistema". */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, () => resolved, () => "light")
}

/** O tema da tela fora de componente. */
export function getResolvedTheme(): ResolvedTheme {
  return resolved
}
