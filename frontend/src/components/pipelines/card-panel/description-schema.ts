import type { Schema } from "@tiptap/pm/model"
import type { JSONContent } from "@tiptap/react"

// As cores que a descrição oferece. É cor escolhida pela pessoa, como etiqueta: vai para o documento.
export const TEXT_COLORS = [
  { id: "gray", value: "#71717a" },
  { id: "red", value: "#dc2626" },
  { id: "orange", value: "#ea580c" },
  { id: "yellow", value: "#ca8a04" },
  { id: "green", value: "#059669" },
  { id: "blue", value: "#2563eb" },
  { id: "violet", value: "#7c3aed" },
  { id: "pink", value: "#db2777" },
] as const

export const HIGHLIGHT_COLORS = [
  { id: "gray", value: "#e4e4e7" },
  { id: "red", value: "#fecaca" },
  { id: "orange", value: "#fed7aa" },
  { id: "yellow", value: "#fef08a" },
  { id: "green", value: "#bbf7d0" },
  { id: "blue", value: "#bfdbfe" },
  { id: "violet", value: "#ddd6fe" },
  { id: "pink", value: "#fbcfe8" },
] as const

export type ColorSwatch = (typeof TEXT_COLORS)[number] | (typeof HIGHLIGHT_COLORS)[number]

/** Cor vem de dentro do JSON e vai parar num `style`: só passa o que é uma cor, sem `;`. */
const SAFE_COLOR = /^[#\w(),.%\s-]+$/
const ALIGNMENTS = new Set(["left", "center", "right", "justify"])
const COLORED_MARKS = new Set(["textStyle", "highlight"])

function cleanAttrs(node: JSONContent): JSONContent {
  const align = node.attrs?.textAlign
  if (align === undefined || align === null || ALIGNMENTS.has(align)) return node
  return { ...node, attrs: { ...node.attrs, textAlign: null } }
}

function cleanMark(mark: NonNullable<JSONContent["marks"]>[number]) {
  const color = mark.attrs?.color
  if (!COLORED_MARKS.has(mark.type) || color === null || color === undefined) return mark
  return typeof color === "string" && SAFE_COLOR.test(color)
    ? mark
    : { ...mark, attrs: { ...mark.attrs, color: null } }
}

/**
 * A última rede ao abrir o que veio de fora: o que este editor não conhece vira texto, em vez de
 * esvaziar o documento. Bloco desconhecido dá lugar ao que tem dentro; marca desconhecida só sai.
 * Cor e alinhamento que não são o que dizem ser caem fora antes de virar `style`.
 */
export function keepKnownContent(doc: JSONContent, schema: Schema): JSONContent {
  const clean = (node: JSONContent): JSONContent[] => {
    const content = node.content?.flatMap(clean)

    if (node.type && !schema.nodes[node.type]) {
      const inside = content ?? []
      return inside.some((child) => child.type === "text")
        ? [{ type: "paragraph", content: inside }]
        : inside
    }

    return [
      {
        ...cleanAttrs(node),
        ...(content ? { content } : null),
        ...(node.marks
          ? { marks: node.marks.filter((mark) => schema.marks[mark.type]).map(cleanMark) }
          : null),
      },
    ]
  }

  return clean(doc)[0] ?? { type: "doc", content: [] }
}
