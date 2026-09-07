import { createContext, useContext, type ReactNode } from "react"

import { useApi } from "@/hooks/use-api"
import type { CarouselFormat, CarouselTheme } from "@/lib/doc"

// O acervo da ferramenta: temas prontos, biblioteca de imagens, paletas,
// formatos, o custo de cada geração e o prazo da lixeira. Vem de `GET /catalog`
// — que é público, porque as telas de entrada já usam parte dele.
//
// A costura tem uma forma incomum de propósito. O acervo também existe aqui
// como **valor estático**, e o SWR só o substitui quando a resposta chega:
//
//   1. nenhuma tela ganha estado de carregando por causa do acervo (o editor
//      abre no primeiro frame, com as cores certas);
//   2. `lib/ai.ts` e `findLibraryImage()` continuam síncronos — o primeiro é um
//      módulo sem React, o segundo é chamado no meio da render de um card.
//
// O preço é duplicação: estes valores também vivem em `backend/db/seeds.rb`.
// Mudar um só de um lado faz quem estiver no primeiro paint ver a cor velha por
// um instante. É barato perto de uma tela de espera antes do editor abrir.

export type ThemePreset = { id: string; theme: CarouselTheme }

export type LibraryImage = {
  id: string
  /** Camadas de gradiente radial, pintadas na ordem sobre a cor de base. */
  base: string
  layers: ReadonlyArray<{ color: string; x: number; y: number; size: number }>
}

export type FolderColor = { id: string; value: string }

/** Quanto cada operação de geração custa em créditos. */
export type AiCosts = {
  carousel: number
  card: number
  rewrite: number
  image: number
  caption: number
}

export type UploadLimits = {
  /** Teto por arquivo, em bytes — do servidor, não da tela. */
  maxBytes: number
  contentTypes: readonly string[]
}

export type Catalog = {
  formats: ReadonlyArray<{ id: CarouselFormat; ratio: number }>
  themePresets: readonly ThemePreset[]
  imageLibrary: readonly LibraryImage[]
  folderColors: readonly FolderColor[]
  accentChoices: readonly string[]
  extendedPalette: readonly string[]
  aiCosts: AiCosts
  /** Quantos dias o carrossel fica na lixeira. Quem apaga é o servidor. */
  trashRetentionDays: number
  uploadLimits: UploadLimits
}

/* ---------- os valores de partida ---------- */

export const EXTENDED_PALETTE: readonly string[] = [
  "oklch(0.97 0.005 285)",
  "oklch(0.92 0.02 85)",
  "oklch(0.9 0.04 25)",
  "oklch(0.88 0.05 145)",
  "oklch(0.9 0.04 240)",
  "oklch(0.88 0.05 300)",
  "oklch(0.45 0.03 285)",
  "oklch(0.35 0.06 260)",
  "oklch(0.4 0.08 155)",
  "oklch(0.42 0.09 25)",
  "oklch(0.3 0.04 300)",
  "oklch(0.22 0.01 285)",
]

export const THEME_PRESETS: ReadonlyArray<{ id: string; theme: CarouselTheme }> = [
  {
    id: "paper",
    theme: {
      bg: "oklch(0.97 0.005 90)",
      surface: "oklch(0.93 0.008 90)",
      ink: "oklch(0.2 0.01 285)",
      accent: "oklch(0.5 0.2 292)",
      accentInk: "oklch(0.98 0.005 292)",
    },
  },
  {
    id: "midnight",
    theme: {
      bg: "oklch(0.2 0.01 285)",
      surface: "oklch(0.26 0.015 285)",
      ink: "oklch(0.98 0 0)",
      accent: "oklch(0.88 0.2 125)",
      accentInk: "oklch(0.2 0.01 285)",
    },
  },
  {
    id: "forest",
    theme: {
      bg: "oklch(0.46 0.13 155)",
      surface: "oklch(0.4 0.12 155)",
      ink: "oklch(0.97 0.02 110)",
      accent: "oklch(0.88 0.17 110)",
      accentInk: "oklch(0.3 0.09 155)",
    },
  },
  {
    id: "clay",
    theme: {
      bg: "oklch(0.42 0.14 20)",
      surface: "oklch(0.37 0.13 20)",
      ink: "oklch(0.96 0.02 80)",
      accent: "oklch(0.85 0.15 85)",
      accentInk: "oklch(0.35 0.12 20)",
    },
  },
  {
    id: "ocean",
    theme: {
      bg: "oklch(0.32 0.1 260)",
      surface: "oklch(0.28 0.09 260)",
      ink: "oklch(0.97 0.005 260)",
      accent: "oklch(0.85 0.15 85)",
      accentInk: "oklch(0.28 0.09 260)",
    },
  },
  {
    id: "solar",
    theme: {
      bg: "oklch(0.85 0.16 95)",
      surface: "oklch(0.8 0.15 95)",
      ink: "oklch(0.2 0.02 95)",
      accent: "oklch(0.4 0.14 25)",
      accentInk: "oklch(0.85 0.16 95)",
    },
  },
  {
    id: "plum",
    theme: {
      bg: "oklch(0.3 0.09 320)",
      surface: "oklch(0.26 0.08 320)",
      ink: "oklch(0.97 0.01 320)",
      accent: "oklch(0.83 0.14 350)",
      accentInk: "oklch(0.3 0.09 320)",
    },
  },
  {
    id: "linen",
    theme: {
      bg: "oklch(0.94 0.02 85)",
      surface: "oklch(0.89 0.03 85)",
      ink: "oklch(0.28 0.03 40)",
      accent: "oklch(0.52 0.14 30)",
      accentInk: "oklch(0.96 0.02 85)",
    },
  },
]

export const ACCENT_CHOICES: readonly string[] = [
  "oklch(0.5 0.2 292)",
  "oklch(0.55 0.19 250)",
  "oklch(0.6 0.16 195)",
  "oklch(0.62 0.17 150)",
  "oklch(0.82 0.17 95)",
  "oklch(0.68 0.19 45)",
  "oklch(0.58 0.2 25)",
  "oklch(0.6 0.19 350)",
]

/**
 * A biblioteca de imagens da ferramenta. Não são fotos: são fundos de cor
 * desenhados, que existem sem depender de arquivo nem de rede. Cada peça tem
 * cor própria (é obra, não interface) e nome traduzido em
 * `editor.imagePicker.library.<id>`.
 */
export const IMAGE_LIBRARY: readonly LibraryImage[] = [
  {
    id: "amanhecer",
    base: "oklch(0.88 0.09 70)",
    layers: [
      { color: "oklch(0.82 0.16 45)", x: 25, y: 20, size: 70 },
      { color: "oklch(0.92 0.11 95)", x: 80, y: 75, size: 65 },
    ],
  },
  {
    id: "orvalho",
    base: "oklch(0.9 0.05 175)",
    layers: [
      { color: "oklch(0.84 0.11 190)", x: 75, y: 25, size: 70 },
      { color: "oklch(0.95 0.05 140)", x: 20, y: 80, size: 60 },
    ],
  },
  {
    id: "mare",
    base: "oklch(0.4 0.11 245)",
    layers: [
      { color: "oklch(0.55 0.15 230)", x: 30, y: 70, size: 80 },
      { color: "oklch(0.3 0.1 265)", x: 80, y: 20, size: 65 },
    ],
  },
  {
    id: "cerrado",
    base: "oklch(0.55 0.11 130)",
    layers: [
      { color: "oklch(0.72 0.14 115)", x: 70, y: 30, size: 75 },
      { color: "oklch(0.42 0.09 150)", x: 20, y: 80, size: 70 },
    ],
  },
  {
    id: "brasa",
    base: "oklch(0.45 0.16 30)",
    layers: [
      { color: "oklch(0.65 0.2 45)", x: 30, y: 30, size: 70 },
      { color: "oklch(0.3 0.12 20)", x: 75, y: 80, size: 70 },
    ],
  },
  {
    id: "algodao",
    base: "oklch(0.95 0.01 285)",
    layers: [
      { color: "oklch(0.9 0.04 300)", x: 25, y: 25, size: 70 },
      { color: "oklch(0.92 0.03 240)", x: 80, y: 70, size: 70 },
    ],
  },
  {
    id: "ametista",
    base: "oklch(0.38 0.13 305)",
    layers: [
      { color: "oklch(0.55 0.18 300)", x: 70, y: 25, size: 75 },
      { color: "oklch(0.28 0.1 320)", x: 25, y: 80, size: 65 },
    ],
  },
  {
    id: "grafite",
    base: "oklch(0.26 0.01 285)",
    layers: [
      { color: "oklch(0.36 0.02 260)", x: 30, y: 25, size: 75 },
      { color: "oklch(0.2 0.01 285)", x: 80, y: 80, size: 70 },
    ],
  },
  {
    id: "goiaba",
    base: "oklch(0.72 0.15 15)",
    layers: [
      { color: "oklch(0.85 0.13 40)", x: 75, y: 25, size: 70 },
      { color: "oklch(0.58 0.16 5)", x: 25, y: 78, size: 68 },
    ],
  },
  {
    id: "menta",
    base: "oklch(0.86 0.08 155)",
    layers: [
      { color: "oklch(0.93 0.07 130)", x: 30, y: 25, size: 70 },
      { color: "oklch(0.75 0.11 175)", x: 78, y: 78, size: 68 },
    ],
  },
  {
    id: "areia",
    base: "oklch(0.9 0.04 80)",
    layers: [
      { color: "oklch(0.84 0.07 60)", x: 70, y: 30, size: 72 },
      { color: "oklch(0.95 0.02 90)", x: 25, y: 75, size: 65 },
    ],
  },
  {
    id: "meianoite",
    base: "oklch(0.22 0.05 275)",
    layers: [
      { color: "oklch(0.34 0.12 285)", x: 30, y: 70, size: 78 },
      { color: "oklch(0.45 0.14 255)", x: 78, y: 22, size: 60 },
    ],
  },
]

export const FOLDER_COLORS = [
  { id: "cinza", value: "oklch(0.65 0.01 285)" },
  { id: "violeta", value: "oklch(0.62 0.12 292)" },
  { id: "azul", value: "oklch(0.62 0.1 245)" },
  { id: "verde", value: "oklch(0.62 0.1 155)" },
  { id: "amarelo", value: "oklch(0.75 0.12 90)" },
  { id: "vermelho", value: "oklch(0.62 0.12 25)" },
] as const

/** Custo de cada geração. O servidor é quem manda; isto é só o ponto de partida. */
export const AI_COSTS: AiCosts = {
  carousel: 5,
  card: 1,
  rewrite: 1,
  image: 2,
  caption: 1,
}

/** Formatos publicáveis. 9:16 entra em etapa futura. */
export const FORMATS: ReadonlyArray<{ id: CarouselFormat; ratio: number }> = [
  { id: "4:5", ratio: 4 / 5 },
  { id: "1:1", ratio: 1 },
]

/**
 * Teto e tipos aceitos no upload. Os valores de verdade vêm do servidor — este
 * é só o ponto de partida, para a tela não travar antes do catálogo chegar.
 */
export const UPLOAD_LIMITS: UploadLimits = {
  maxBytes: 10 * 1024 * 1024,
  contentTypes: ["image/jpeg", "image/png", "image/webp"],
}

export const DEFAULT_CATALOG: Catalog = {
  formats: FORMATS,
  themePresets: THEME_PRESETS,
  imageLibrary: IMAGE_LIBRARY,
  folderColors: FOLDER_COLORS,
  accentChoices: ACCENT_CHOICES,
  extendedPalette: EXTENDED_PALETTE,
  aiCosts: AI_COSTS,
  trashRetentionDays: 30,
  uploadLimits: UPLOAD_LIMITS,
}

/* ---------- acesso ---------- */

// Espelho de módulo para quem não é componente. Escrito pelo provedor, lido
// pelas funções puras — é o que mantém `findLibraryImage` síncrono.
let current: Catalog = DEFAULT_CATALOG

/** O acervo agora, fora de React. Nunca é nulo: começa no valor estático. */
export function getCatalog(): Catalog {
  return current
}

const CatalogContext = createContext<Catalog>(DEFAULT_CATALOG)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { data } = useApi<Catalog>("/catalog", {
    fallbackData: DEFAULT_CATALOG,
    // O acervo não muda no meio da sessão: uma busca por carga de página basta.
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: Infinity,
  })

  const catalog = data ?? DEFAULT_CATALOG
  // Durante a render, de propósito: um efeito deixaria a primeira render das
  // funções síncronas (que leem `getCatalog()`) com o valor velho. A escrita é
  // idempotente e o valor é o mesmo para toda a árvore.
  current = catalog

  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
}

/** O acervo, reativo — para componentes. */
export function useCatalog(): Catalog {
  return useContext(CatalogContext)
}

/* ---------- ajudantes ---------- */

export function findLibraryImage(id: string): LibraryImage | undefined {
  return getCatalog().imageLibrary.find((image) => image.id === id)
}

/** A peça como valor de `background` — o mesmo no card e na miniatura. */
export function libraryBackground(image: LibraryImage): string {
  const layers = image.layers.map(
    (layer) =>
      `radial-gradient(circle at ${layer.x}% ${layer.y}%, ${layer.color} 0%, transparent ${layer.size}%)`
  )
  return [...layers, image.base].join(", ")
}
