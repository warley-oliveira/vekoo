import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { createPortal } from "react-dom"

import { BLOCK_TYPES } from "@/components/editor/block-types"
import { activeCard, useEditor } from "@/components/editor/editor-store"
import { defaultBlock, type BlockType } from "@/lib/doc"
import { newId } from "@/lib/store"
import { cn } from "@/lib/utils"

// O menu "/" — digitar a barra num bloco de texto vazio abre a lista de tipos
// e filtra conforme se digita. O bloco vazio de onde ele nasceu é substituído
// pelo escolhido: ninguém quer um parágrafo vazio sobrando.

const MENU_WIDTH = 240
const MENU_MAX_HEIGHT = 280

export function SlashMenu({
  anchor,
  replaceBlockId,
  onClose,
}: {
  anchor: DOMRect
  replaceBlockId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const options = useMemo(() => {
    const term = query.trim().toLowerCase()
    return BLOCK_TYPES.map(({ type, icon }) => ({
      type,
      icon,
      label: t(`editor.blocks.${type}`),
    })).filter((option) => option.label.toLowerCase().includes(term))
  }, [query, t])

  useEffect(() => setHighlight(0), [query])

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-highlighted="true"]')
      ?.scrollIntoView({ block: "nearest" })
  }, [highlight])

  function insert(type: BlockType) {
    const card = activeCard(state)
    const index = card?.blocks.findIndex((b) => b.id === replaceBlockId) ?? -1
    const block = defaultBlock(type, newId("block"))
    dispatch({ type: "block/insert", index: index < 0 ? 0 : index, block })
    dispatch({ type: "block/remove", id: replaceBlockId })
    dispatch({ type: "block/select", id: block.id })
    dispatch({ type: "block/edit", editing: true })
    onClose()
  }

  // Cabe acima do cursor quando não cabe abaixo — o card ocupa a tela toda.
  const below = anchor.bottom + MENU_MAX_HEIGHT < window.innerHeight
  const style = {
    left: Math.min(Math.max(8, anchor.left), window.innerWidth - MENU_WIDTH - 8),
    top: below ? anchor.bottom + 6 : undefined,
    bottom: below ? undefined : window.innerHeight - anchor.top + 6,
    width: MENU_WIDTH,
    maxHeight: MENU_MAX_HEIGHT,
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        aria-hidden
        onMouseDown={onClose}
      />
      <div
        style={style}
        className="fixed z-50 flex flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              onClose()
            } else if (e.key === "ArrowDown") {
              e.preventDefault()
              setHighlight((h) => (h + 1) % Math.max(1, options.length))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setHighlight(
                (h) => (h - 1 + options.length) % Math.max(1, options.length)
              )
            } else if (e.key === "Enter") {
              e.preventDefault()
              const option = options[highlight]
              if (option) insert(option.type)
            }
          }}
          role="combobox"
          aria-expanded
          aria-controls="slash-menu-list"
          aria-label={t("editor.slash.label")}
          placeholder={t("editor.slash.placeholder")}
          className="h-9 shrink-0 border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <ul
          ref={listRef}
          id="slash-menu-list"
          role="listbox"
          aria-label={t("editor.slash.label")}
          className="min-h-0 flex-1 overflow-y-auto p-1"
        >
          {options.length === 0 && (
            <li className="px-2 py-3 text-center text-sm text-muted-foreground">
              {t("editor.slash.noResults")}
            </li>
          )}
          {options.map((option, index) => (
            <li key={option.type}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                data-highlighted={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(option.type)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                  index === highlight && "bg-accent text-accent-foreground"
                )}
              >
                <option.icon className="size-4 shrink-0 text-muted-foreground" />
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body
  )
}
