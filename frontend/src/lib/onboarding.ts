import type { BrandColor, BrandFont, Tone } from "@/lib/brand-core"

// O onboarding guiado — a porta de entrada de toda marca nova.
//
// Perguntas em linguagem de dono de negócio, uma por tela. Cada resposta
// escreve numa seção do mesmo documento que o wizard de edição já conhece:
// não existe "brandcore do onboarding", existe outra porta para o mesmo. O
// espelho no servidor é `backend/app/models/brand_core/onboarding.rb`.
//
// Módulo sem idioma: só códigos e regras. O que aparece na tela vem de
// `onboarding.*` no i18n.

export const ONBOARDING_STEPS = [
  "intro",
  "name",
  "what",
  "handle",
  "logo",
  "colors",
  "fonts",
  "voice",
  "offers",
  "done",
] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Dá para seguir sem responder. Cor e fonte não estão aqui: têm "cria pra mim". */
export const SKIPPABLE: readonly OnboardingStep[] = ["handle", "logo", "voice", "offers"]

/** Onde existe o botão "não sei / cria pra mim". */
export const SUGGESTIBLE: readonly OnboardingStep[] = ["colors", "fonts", "voice"]

/** O mínimo para publicar a v1. Curto de propósito. */
export const REQUIRED_STEPS: readonly OnboardingStep[] = ["name", "what", "colors", "fonts"]

/** Os chips de segmento. São códigos: a tela traduz. */
export const SEGMENTS = [
  "restaurant",
  "shop",
  "services",
  "health",
  "education",
  "creator",
  "other",
] as const
export type Segment = (typeof SEGMENTS)[number]

export type OnboardingState = {
  step: OnboardingStep
  answered: OnboardingStep[]
  skipped: OnboardingStep[]
  segment: Segment | null
  /**
   * A pessoa disse "não tenho logo" e aceitou o logotipo da Vekoo. O desenho
   * acontece no fechamento, e não na hora: o logotipo usa a tipografia, e a
   * tipografia é escolhida **depois** da pergunta da logo.
   */
  wantsWordmark: boolean
  done: boolean
  readyToFinish: boolean
}

/* ---------- as propostas do "cria pra mim" ---------- */

export type SuggestKind = "palette" | "fonts" | "voice"

/** Paleta já com os papéis derivados e o contraste conferido pelo servidor. */
export type PaletteOption = {
  name: string
  why: string | null
  colors: BrandColor[]
}

export type FontsOption = {
  why: string | null
  display: BrandFont & { category: string }
  utility: BrandFont & { category: string }
}

export type VoiceOption = {
  essence: string
  why: string | null
  tones: Tone[]
  bannedWords: string[]
}

export type SuggestOption = PaletteOption | FontsOption | VoiceOption

/**
 * `curated` significa que as propostas vieram da lista curada, não do modelo
 * — sem chave, sem rede ou com resposta torta. A tela **não** muda por causa
 * disso: quem clicou em "não sei" não deveria receber um aviso técnico.
 */
export type SuggestResult<T extends SuggestOption = SuggestOption> = {
  kind: SuggestKind
  source: "ai" | "curated"
  options: T[]
  costMicroUsd: number
}

/* ---------- navegação ---------- */

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step)
}

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(step) + 1] ?? null
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const index = stepIndex(step)
  return index > 0 ? ONBOARDING_STEPS[index - 1] : null
}

export function isOnboardingStep(value: string | undefined): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value ?? "")
}

export function onboardingHref(brandId: string, step: OnboardingStep): string {
  return `/brands/${brandId}/onboarding/${step}`
}

export function isSkippable(step: OnboardingStep): boolean {
  return SKIPPABLE.includes(step)
}

export function isSuggestible(step: OnboardingStep): boolean {
  return SUGGESTIBLE.includes(step)
}

/**
 * Quantas perguntas a barra conta. `intro` e `done` não são perguntas —
 * contá-las faria a barra começar em 10% antes de a pessoa digitar nada.
 */
export const QUESTION_COUNT = ONBOARDING_STEPS.length - 2

/** A posição da pergunta (1…8), ou `null` para as telas que não perguntam. */
export function questionPosition(step: OnboardingStep): number | null {
  const index = stepIndex(step)
  return index > 0 && step !== "done" ? index : null
}
