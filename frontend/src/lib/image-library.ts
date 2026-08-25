// A biblioteca de imagens da ferramenta. Não são fotos: são fundos de cor
// desenhados, que existem sem depender de arquivo nem de rede — a biblioteca
// de fotos de verdade entra quando o backend entrar.
//
// Cada peça tem cor própria (é obra, não interface) e um nome traduzido em
// `editor.imagePicker.library.<id>`. As cores ficam em oklch cru, como o tema.

export type LibraryImage = {
  id: string
  /** Camadas de gradiente radial, pintadas na ordem sobre a cor de base. */
  base: string
  layers: ReadonlyArray<{ color: string; x: number; y: number; size: number }>
}

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

export function findLibraryImage(id: string): LibraryImage | undefined {
  return IMAGE_LIBRARY.find((image) => image.id === id)
}

/** A peça como valor de `background` — o mesmo no card e na miniatura. */
export function libraryBackground(image: LibraryImage): string {
  const layers = image.layers.map(
    (layer) =>
      `radial-gradient(circle at ${layer.x}% ${layer.y}%, ${layer.color} 0%, transparent ${layer.size}%)`
  )
  return [...layers, image.base].join(", ")
}
