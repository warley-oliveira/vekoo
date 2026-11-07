import { Extension, Mark, mergeAttributes, Node } from "@tiptap/core"
import type { Schema } from "@tiptap/pm/model"
import type { JSONContent } from "@tiptap/react"

// O editor abre o que veio da plataforma antiga sem perder nada: tabela, cor, realce e alinhamento.
// Não há botão para criar nada disso aqui, e também não há dependência nova: só o bastante para a
// tela mostrar e o documento voltar igual ao salvar. Sem estes tipos, o Tiptap trocaria o documento
// inteiro por um vazio, e a primeira tecla apagaria a descrição de verdade.

/** Cor vem de dentro do JSON e vai parar num `style`: só passa o que é uma cor, sem `;`. */
const COLOR = /^[#\w(),.%\s-]+$/

function colorAttribute(property: "color" | "background-color") {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.getPropertyValue(property) || null,
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = attributes.color
      return typeof value === "string" && COLOR.test(value) ? { style: `${property}: ${value}` } : {}
    },
  }
}

const TextStyle = Mark.create({
  name: "textStyle",
  addAttributes: () => ({ color: colorAttribute("color") }),
  parseHTML: () => [{ tag: "span[style*=color]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes), 0],
})

const Highlight = Mark.create({
  name: "highlight",
  addAttributes: () => ({ color: colorAttribute("background-color") }),
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: ({ HTMLAttributes }) => ["mark", mergeAttributes(HTMLAttributes), 0],
})

const TextAlign = Extension.create({
  name: "textAlign",
  addGlobalAttributes: () => [
    {
      types: ["heading", "paragraph"],
      attributes: {
        textAlign: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.textAlign || null,
          renderHTML: (attributes: Record<string, unknown>) => {
            const value = attributes.textAlign
            return value === "center" || value === "right" || value === "justify"
              ? { style: `text-align: ${value}` }
              : {}
          },
        },
      },
    },
  ],
})

const CELL_ATTRIBUTES = {
  colspan: { default: 1 },
  rowspan: { default: 1 },
  colwidth: { default: null, rendered: false },
}

const Table = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,
  parseHTML: () => [{ tag: "table" }],
  renderHTML: ({ HTMLAttributes }) => ["table", mergeAttributes(HTMLAttributes), ["tbody", 0]],
})

const TableRow = Node.create({
  name: "tableRow",
  content: "(tableCell | tableHeader)*",
  parseHTML: () => [{ tag: "tr" }],
  renderHTML: ({ HTMLAttributes }) => ["tr", mergeAttributes(HTMLAttributes), 0],
})

const TableCell = Node.create({
  name: "tableCell",
  content: "block+",
  isolating: true,
  addAttributes: () => CELL_ATTRIBUTES,
  parseHTML: () => [{ tag: "td" }],
  renderHTML: ({ HTMLAttributes }) => ["td", mergeAttributes(HTMLAttributes), 0],
})

const TableHeader = Node.create({
  name: "tableHeader",
  content: "block+",
  isolating: true,
  addAttributes: () => CELL_ATTRIBUTES,
  parseHTML: () => [{ tag: "th" }],
  renderHTML: ({ HTMLAttributes }) => ["th", mergeAttributes(HTMLAttributes), 0],
})

export const LEGACY_EXTENSIONS = [TextStyle, Highlight, TextAlign, Table, TableRow, TableCell, TableHeader]

/**
 * A última rede: o que nem assim este editor conhece vira texto, em vez de esvaziar o documento.
 * Bloco desconhecido dá lugar ao que tem dentro; marca desconhecida só sai.
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
        ...node,
        ...(content ? { content } : null),
        ...(node.marks ? { marks: node.marks.filter((mark) => schema.marks[mark.type]) } : null),
      },
    ]
  }

  return clean(doc)[0] ?? { type: "doc", content: [] }
}
