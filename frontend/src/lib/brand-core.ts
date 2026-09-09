import { z } from "zod"

import { newId } from "@/lib/doc"

// O Brandcore — a marca como dado estruturado. Espelho de
// `backend/app/models/brand_core/schema.rb`: as listas de código abaixo têm que
// bater com as de lá. Módulo sem idioma: todo rótulo visível vem de
// `brand.*` no i18n; aqui só há códigos, defaults e regras.

/* ---------- códigos ---------- */

export const BRAND_STEPS = [
  "identity",
  "colors",
  "typography",
  "styles",
  "assets",
  "voice",
  "notes",
] as const
export type BrandStep = (typeof BRAND_STEPS)[number]

/** Seção do documento que cada etapa salva. `assets` mora em arquivos. */
export const STEP_SECTION: Record<BrandStep, BrandSection | null> = {
  identity: "identity",
  colors: "palette",
  typography: "typography",
  styles: "styles",
  assets: null,
  voice: "voice",
  notes: "notes",
}

export type BrandSection =
  | "identity"
  | "palette"
  | "typography"
  | "styles"
  | "voice"
  | "notes"

export const COLOR_ROLES = [
  "darkBackground",
  "lightBackground",
  "textOnDark",
  "textOnLight",
  "muted",
  "accent",
  "campaign",
] as const
export type ColorRole = (typeof COLOR_ROLES)[number]

export const BACKGROUND_ROLES: Partial<Record<ColorRole, ColorRole>> = {
  darkBackground: "textOnDark",
  lightBackground: "textOnLight",
}

export const FONT_ROLES = ["display", "utility"] as const
export type FontRole = (typeof FONT_ROLES)[number]

export const FONT_SOURCES = ["catalog", "file", "system"] as const
export type FontSource = (typeof FONT_SOURCES)[number]

export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const

export const STYLE_KEYS = [
  "kicker",
  "title",
  "lede",
  "body",
  "number",
  "item",
  "footer",
] as const
export type StyleKey = (typeof STYLE_KEYS)[number]

export const STYLE_TRANSFORMS = ["none", "uppercase"] as const
export type StyleTransform = (typeof STYLE_TRANSFORMS)[number]

export const TONES = [
  "direct",
  "warm",
  "playful",
  "technical",
  "inspiring",
  "sober",
  "bold",
  "educational",
] as const
export type Tone = (typeof TONES)[number]

export const QUALITY_RULES = [
  "maxOneAntithesis",
  "alwaysConcreteData",
  "noEmojiRendered",
  "noGenericClaims",
  "noStackedExclamation",
] as const
export type QualityRule = (typeof QUALITY_RULES)[number]

export const NETWORKS = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "linkedin",
  "whatsapp",
  "site",
  "other",
] as const
export type Network = (typeof NETWORKS)[number]

export const ASSET_KINDS = ["logo", "glyph", "photo", "font"] as const
export type BrandAssetKind = (typeof ASSET_KINDS)[number]

/* ---------- o documento ---------- */

export type BrandCharacter = { id: string; name: string; role: string }
export type BrandNetwork = { id: string; network: Network; handle: string }

export type BrandIdentity = {
  name: string
  segment: string
  concept: string
  positioning: string
  characters: BrandCharacter[]
  address: string
  instagram: string
  networks: BrandNetwork[]
}

export type BrandColor = { id: string; name: string; hex: string; role: ColorRole }
export type BrandPalette = { colors: BrandColor[] }

export type BrandFont = {
  family: string
  source: FontSource
  weights: number[]
  usage: string
  assetId: string | null
}
export type BrandTypography = {
  display: BrandFont
  utility: BrandFont
  rules: string[]
}

export type TextStyle = {
  key: StyleKey
  font: FontRole
  size: number
  weight: number
  transform: StyleTransform
  colorOnDark: ColorRole
  colorOnLight: ColorRole
}
export type BrandStyles = { roles: TextStyle[] }

export type BannedWord = { id: string; text: string }
export type CopyExample = { id: string; text: string }
export type BrandVoice = {
  essence: string
  tones: Tone[]
  toneNote: string
  bannedWords: BannedWord[]
  qualityRules: Record<QualityRule, boolean>
  examples: CopyExample[]
}

/**
 * Anotações da operação: preços, horários, promoções — texto livre e
 * opcional. Era uma lista de fatos com status, que barrava a geração; o que
 * sobrou é o que sempre foi útil, uma nota de contexto da marca.
 */
export type BrandNotes = { text: string }

export type BrandDocument = {
  identity: BrandIdentity
  palette: BrandPalette
  typography: BrandTypography
  styles: BrandStyles
  voice: BrandVoice
  notes: BrandNotes
}

/* ---------- o que a API devolve ---------- */

export type BrandAsset = {
  id: string
  kind: BrandAssetKind
  variant: string | null
  name: string
  url: string
  contentType: string
  width: number | null
  height: number | null
  /** true/false quando o servidor olhou o PNG; null é "não sei". */
  transparent: boolean | null
  byteSize: number
  createdAt: number
}

export type RequiredCheck = { key: string; met: boolean }

export type BrandCompleteness = {
  percent: number
  sections: Record<BrandStep, number>
  required: RequiredCheck[]
  minimumMet: boolean
}

export type BrandStatus = "draft" | "published"
export type GenerationBlocker = "notPublished" | "minimumNotMet"

/** O que `GET /brands` devolve por marca — o bastante para o seletor e a lista. */
export type BrandSummary = {
  id: string
  name: string | null
  status: BrandStatus
  percent: number
  minimumMet: boolean
  readyForGeneration: boolean
  visitedSteps: BrandStep[]
  lastStep: BrandStep | null
  currentVersion: number
  publishedAt: number | null
  createdAt: number
  updatedAt: number
}

export type BrandCore = {
  id: string
  name: string | null
  status: BrandStatus
  document: BrandDocument
  publishedDocument: BrandDocument | null
  progress: { visitedSteps: BrandStep[]; lastStep: BrandStep | null }
  completeness: BrandCompleteness
  readyForGeneration: boolean
  generationBlockers: GenerationBlocker[]
  hasUnpublishedChanges: boolean
  assets: BrandAsset[]
  currentVersion: number
  publishedAt: number | null
  updatedAt: number
}

export type BrandChange = { section: BrandSection; path: string; kind: "added" | "removed" | "changed" }

export type BrandVersion = {
  id: string
  number: number
  createdAt: number
  account: { id: string; name: string } | null
  changes: BrandChange[]
  changedSections: BrandSection[]
}

/* ---------- defaults ---------- */

export function emptyFont(): BrandFont {
  return { family: "", source: "catalog", weights: [400, 700], usage: "", assetId: null }
}

export function newCharacter(): BrandCharacter {
  return { id: newId("per"), name: "", role: "" }
}

export function newNetwork(network: Network = "tiktok"): BrandNetwork {
  return { id: newId("rede"), network, handle: "" }
}

export function newColor(role: ColorRole, hex = "#000000"): BrandColor {
  return { id: newId("cor"), name: "", hex, role }
}

export function newBannedWord(): BannedWord {
  return { id: newId("ban"), text: "" }
}

export function newExample(): CopyExample {
  return { id: newId("ex"), text: "" }
}

/**
 * Paleta de partida para quem ainda não tem nenhuma cor: um fundo escuro,
 * um claro, o texto de cada um e um acento. Tons neutros de propósito — o
 * ponto é a pessoa trocar, não aceitar.
 */
export function starterPalette(): BrandColor[] {
  return [
    newColor("darkBackground", "#1c1a24"),
    newColor("textOnDark", "#f6f3ee"),
    newColor("lightBackground", "#f6f3ee"),
    newColor("textOnLight", "#1c1a24"),
    newColor("accent", "#7c3aed"),
  ]
}

/* ---------- cor ---------- */

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function normalizeHex(value: string): string {
  const trimmed = value.trim().replace(/^#?/, "#")
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return trimmed.toLowerCase()
}

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** Luminância relativa (WCAG). Cor inválida conta como preto. */
export function luminance(hex: string): number {
  if (!HEX_RE.test(hex)) return 0
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
}

/** Razão de contraste entre duas cores, 1 a 21 (WCAG). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

export type ContrastLevel = "aaa" | "aa" | "large" | "fail"

export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return "aaa"
  if (ratio >= 4.5) return "aa"
  if (ratio >= 3) return "large"
  return "fail"
}

export function colorsByRole(colors: BrandColor[], role: ColorRole): BrandColor[] {
  return colors.filter((color) => color.role === role && HEX_RE.test(color.hex))
}

export function firstColor(colors: BrandColor[], role: ColorRole): BrandColor | undefined {
  return colorsByRole(colors, role)[0]
}

/** As regras da paleta — as mesmas do servidor (`Schema.palette_rules`). */
export function paletteRules(colors: BrandColor[]) {
  const roles = colors.filter((c) => HEX_RE.test(c.hex)).map((c) => c.role)
  const backgrounds = roles.filter((role) => role in BACKGROUND_ROLES)
  return {
    background: backgrounds.length > 0,
    textPerBackground:
      backgrounds.length > 0 &&
      backgrounds.every((bg) => roles.includes(BACKGROUND_ROLES[bg]!)),
    accent: roles.includes("accent"),
  }
}

/** Pares fundo × texto que o preview desenha. */
export function backgroundPairs(colors: BrandColor[]) {
  return (Object.entries(BACKGROUND_ROLES) as [ColorRole, ColorRole][]).flatMap(
    ([bgRole, textRole]) =>
      colorsByRole(colors, bgRole).map((background) => ({
        background,
        text: firstColor(colors, textRole) ?? null,
        accent: firstColor(colors, "accent") ?? null,
      }))
  )
}

/* ---------- validação por etapa ---------- */

type T = (key: string, options?: Record<string, unknown>) => string

const id = z.string().min(1)

/**
 * O que cada etapa exige para "Continuar". É o mínimo daquela etapa, não o
 * documento inteiro — nada de travar tudo no final. O rascunho salva sem
 * passar por aqui; o servidor normaliza o que vier.
 */
export function buildStepSchemas(t: T) {
  const required = (max: number) =>
    z.string().trim().min(1, t("brand.validation.required")).max(max, t("brand.validation.tooLong", { max }))
  const optional = (max: number) =>
    z.string().trim().max(max, t("brand.validation.tooLong", { max }))

  const identity = z.object({
    name: required(80),
    segment: required(80),
    concept: required(160),
    positioning: optional(600),
    characters: z.array(z.object({ id, name: required(80), role: optional(160) })),
    address: optional(160),
    instagram: optional(80),
    networks: z.array(z.object({ id, network: z.enum(NETWORKS), handle: required(160) })),
  })

  const palette = z
    .object({
      colors: z.array(
        z.object({
          id,
          name: required(80),
          hex: z.string().regex(HEX_RE, t("brand.validation.hex")),
          role: z.enum(COLOR_ROLES),
        })
      ),
    })
    .superRefine((value, ctx) => {
      const rules = paletteRules(value.colors)
      if (!rules.background) {
        ctx.addIssue({ code: "custom", path: ["colors"], message: t("brand.colors.rules.background") })
      } else if (!rules.textPerBackground) {
        ctx.addIssue({ code: "custom", path: ["colors"], message: t("brand.colors.rules.textPerBackground") })
      } else if (!rules.accent) {
        ctx.addIssue({ code: "custom", path: ["colors"], message: t("brand.colors.rules.accent") })
      }
    })

  const font = z
    .object({
      family: required(80),
      source: z.enum(FONT_SOURCES),
      weights: z.array(z.number()).min(1, t("brand.typography.validation.weights")),
      usage: optional(160),
      assetId: z.string().nullable(),
    })
    .superRefine((value, ctx) => {
      if (value.source === "file" && !value.assetId) {
        ctx.addIssue({ code: "custom", path: ["assetId"], message: t("brand.typography.validation.file") })
      }
    })

  const typography = z.object({
    display: font,
    utility: font,
    rules: z.array(optional(160)),
  })

  const styles = z.object({
    roles: z.array(
      z.object({
        key: z.enum(STYLE_KEYS),
        font: z.enum(FONT_ROLES),
        size: z.number().int().min(8).max(200),
        weight: z.number().int(),
        transform: z.enum(STYLE_TRANSFORMS),
        colorOnDark: z.enum(COLOR_ROLES),
        colorOnLight: z.enum(COLOR_ROLES),
      })
    ),
  })

  const voice = z.object({
    essence: required(160),
    tones: z.array(z.enum(TONES)).min(1, t("brand.voice.validation.tones")),
    toneNote: optional(160),
    bannedWords: z.array(z.object({ id, text: required(80) })),
    qualityRules: z.record(z.enum(QUALITY_RULES), z.boolean()),
    examples: z.array(z.object({ id, text: optional(600) })),
  })

  const notes = z.object({
    text: z.string().trim().max(2000, t("brand.validation.tooLong", { max: 2000 })),
  })

  return { identity, palette, typography, styles, voice, notes }
}

export type StepSchemas = ReturnType<typeof buildStepSchemas>

/* ---------- navegação ---------- */

export function stepIndex(step: BrandStep): number {
  return BRAND_STEPS.indexOf(step)
}

export function nextStep(step: BrandStep): BrandStep | null {
  return BRAND_STEPS[stepIndex(step) + 1] ?? null
}

export function previousStep(step: BrandStep): BrandStep | null {
  return BRAND_STEPS[stepIndex(step) - 1] ?? null
}

export function stepHref(brandId: string, step: BrandStep): string {
  return `/brands/${brandId}/setup/${step}`
}

/** Etapa que a pessoa pode abrir: visitada, completa ou a próxima da atual. */
export function canOpenStep(brandCore: BrandCore, step: BrandStep, current: BrandStep): boolean {
  if (brandCore.progress.visitedSteps.includes(step)) return true
  if (brandCore.completeness.sections[step] === 100) return true
  return stepIndex(step) <= stepIndex(current) + 1
}

export function isBrandStep(value: string | undefined): value is BrandStep {
  return (BRAND_STEPS as readonly string[]).includes(value ?? "")
}

/** Papel de cor que um estilo usa em cada contexto, resolvido para hex. */
export function resolveStyleColor(
  colors: BrandColor[],
  role: ColorRole,
  fallback: string
): string {
  return firstColor(colors, role)?.hex ?? fallback
}

/* ---------- estilos de partida ---------- */

/** Os mesmos defaults de `BrandCore::Schema.default_styles` — o "voltar ao padrão". */
export function defaultStyles(): TextStyle[] {
  const style = (
    key: StyleKey,
    font: FontRole,
    size: number,
    weight: number,
    extra: Partial<TextStyle> = {}
  ): TextStyle => ({
    key,
    font,
    size,
    weight,
    transform: "none",
    colorOnDark: "textOnDark",
    colorOnLight: "textOnLight",
    ...extra,
  })
  return [
    style("kicker", "utility", 14, 600, { transform: "uppercase", colorOnDark: "accent", colorOnLight: "accent" }),
    style("title", "display", 44, 700),
    style("lede", "display", 24, 500),
    style("body", "utility", 18, 400),
    style("number", "display", 64, 700, { colorOnDark: "accent", colorOnLight: "accent" }),
    style("item", "utility", 18, 500),
    style("footer", "utility", 13, 400, { colorOnDark: "muted", colorOnLight: "muted" }),
  ]
}

/** "1,2 MB" no idioma ativo — para os limites de upload. */
export function formatBytes(bytes: number, language: string): string {
  const units = ["byte", "kilobyte", "megabyte"] as const
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: units[unit],
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)
}
