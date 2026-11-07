import { Extension, type Editor, type Range } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import { ReactRenderer } from "@tiptap/react"
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion"
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Table as TableIcon,
} from "lucide-react"

import { matchesSearch } from "@/lib/search-text"
import {
  MENU_MAX_HEIGHT_PX,
  MENU_WIDTH_PX,
  SlashMenu,
  type SlashCommand,
  type SlashDescribe,
  type SlashMenuHandle,
  type SlashMenuProps,
} from "./description-slash-menu"

// A barra de comandos: "/" abre a lista do que dá para pôr aqui, e digitar filtra.

const MENU_GAP_PX = 4
const VIEWPORT_MARGIN_PX = 8
export type SlashOptions = {
  /** Título e apoio de cada comando, na língua da tela. */
  describe: SlashDescribe
  /** Imagem pede um endereço, e quem pergunta é o campo da barra de ferramentas. */
  onRequestImage: () => void
}

function buildCommands(options: SlashOptions): SlashCommand[] {
  const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range)

  return [
    { id: "heading1", icon: Heading1, run: (editor, range) => chain(editor, range).setNode("heading", { level: 1 }).run() },
    { id: "heading2", icon: Heading2, run: (editor, range) => chain(editor, range).setNode("heading", { level: 2 }).run() },
    { id: "heading3", icon: Heading3, run: (editor, range) => chain(editor, range).setNode("heading", { level: 3 }).run() },
    { id: "bulletList", icon: List, run: (editor, range) => chain(editor, range).toggleBulletList().run() },
    { id: "orderedList", icon: ListOrdered, run: (editor, range) => chain(editor, range).toggleOrderedList().run() },
    { id: "taskList", icon: ListChecks, run: (editor, range) => chain(editor, range).toggleTaskList().run() },
    { id: "quote", icon: Quote, run: (editor, range) => chain(editor, range).toggleBlockquote().run() },
    { id: "code", icon: Code2, run: (editor, range) => chain(editor, range).toggleCodeBlock().run() },
    {
      id: "table",
      icon: TableIcon,
      run: (editor, range) => chain(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    { id: "divider", icon: Minus, run: (editor, range) => chain(editor, range).setHorizontalRule().run() },
    {
      id: "image",
      icon: ImageIcon,
      run: (editor, range) => {
        chain(editor, range).run()
        options.onRequestImage()
      },
    },
  ]
}

/** Abaixo do cursor, ou acima se não couber, sempre dentro da área que se vê (o teclado encolhe). */
function placeMenu(host: HTMLElement, props: SuggestionProps) {
  const rect = props.clientRect?.()
  if (!rect) return

  const viewport = window.visualViewport
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  // Na primeira vez a lista ainda não desenhou: conta com a altura máxima, e o quadro seguinte acerta.
  const menuHeight = host.offsetHeight || MENU_MAX_HEIGHT_PX

  const below = rect.bottom + MENU_GAP_PX
  const top =
    below + menuHeight > height - VIEWPORT_MARGIN_PX && rect.top - menuHeight - MENU_GAP_PX > VIEWPORT_MARGIN_PX
      ? rect.top - menuHeight - MENU_GAP_PX
      : below
  const left = Math.max(
    VIEWPORT_MARGIN_PX,
    Math.min(rect.left, width - MENU_WIDTH_PX - VIEWPORT_MARGIN_PX)
  )

  host.style.top = `${top}px`
  host.style.left = `${left}px`
}

const slashKey = new PluginKey("descriptionSlash")

export const SlashCommands = Extension.create<SlashOptions>({
  name: "descriptionSlash",

  addOptions() {
    return {
      describe: (id) => ({ label: id, hint: "" }),
      onRequestImage: () => {},
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    const commands = buildCommands(options)

    return [
      Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        pluginKey: slashKey,
        char: "/",
        // Em bloco de código, "/" é só uma barra.
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) =>
          commands.filter((command) => {
            const { label, hint } = options.describe(command.id)
            return matchesSearch(`${label} ${hint}`, query)
          }),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let menu: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null
          let host: HTMLDivElement | null = null

          const close = () => {
            menu?.destroy()
            host?.remove()
            menu = null
            host = null
          }

          return {
            onStart: (props) => {
              host = document.createElement("div")
              host.style.position = "fixed"
              host.style.zIndex = "60"
              // Dentro do painel, e não no `body`: para o painel, um clique lá fora o fecharia.
              const parent = props.editor.view.dom.closest('[role="dialog"]') ?? document.body
              parent.appendChild(host)

              menu = new ReactRenderer(SlashMenu, {
                editor: props.editor,
                props: { items: props.items, describe: options.describe, onPick: props.command },
              })
              host.appendChild(menu.element)
              placeMenu(host, props)
              const placed = host
              requestAnimationFrame(() => {
                if (host === placed) placeMenu(placed, props)
              })
            },
            onUpdate: (props) => {
              menu?.updateProps({ items: props.items, onPick: props.command })
              const placed = host
              if (placed) {
                placeMenu(placed, props)
                // Filtrar encolhe a lista: quem abre para cima precisa descer junto.
                requestAnimationFrame(() => {
                  if (host === placed) placeMenu(placed, props)
                })
              }
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                // Fecha a lista, e só ela: o painel em volta também ouve Esc.
                props.event.stopPropagation()
                close()
                return true
              }
              return menu?.ref?.onKeyDown(props) ?? false
            },
            onExit: close,
          }
        },
      }),
    ]
  },
})
