import { useState, type DragEvent } from "react"
import { useTranslation } from "react-i18next"
import { GripVertical } from "lucide-react"

import { BlockEditor } from "@/components/editor/block-editors"
import { CardBlockView } from "@/components/editor/card-art"
import { isEditableBlock, useEditor } from "@/components/editor/editor-store"
import { InsertSlot } from "@/components/editor/insert-slot"
import { blockPlainText, type Block, type CarouselTheme } from "@/lib/doc"
import { cn } from "@/lib/utils"

// Um bloco dentro do canvas: clique seleciona (anel violeta), segundo clique
// edita no lugar. O anel, a alça de arrasto e os sinais de inserção vivem fora
// do fluxo — o layout do card é idêntico ao da arte estática.

/** Mime próprio, como o do carrossel na sidebar: só aceitamos o nosso. */
export const BLOCK_DRAG_TYPE = "application/x-vekoo-block"

type EditableBlockProps = {
  block: Block
  theme: CarouselTheme
  index: number
  isLast: boolean
}

export function EditableBlock({ block, theme, index, isLast }: EditableBlockProps) {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const [dropSide, setDropSide] = useState<"before" | "after" | null>(null)
  const [dragging, setDragging] = useState(false)

  const selected = state.selection.blockId === block.id
  const editing = selected && state.selection.editing
  const editable = isEditableBlock(block.type)
  const empty =
    block.type !== "image" &&
    block.type !== "divider" &&
    blockPlainText(block).trim() === ""

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!selected) {
      dispatch({ type: "block/select", id: block.id })
    } else if (!editing && editable) {
      dispatch({ type: "block/edit", editing: true })
    }
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(BLOCK_DRAG_TYPE)) return
    e.preventDefault()
    const box = e.currentTarget.getBoundingClientRect()
    setDropSide(e.clientY < box.top + box.height / 2 ? "before" : "after")
  }

  function onDrop(e: DragEvent) {
    const raw = e.dataTransfer.getData(BLOCK_DRAG_TYPE)
    const side = dropSide
    setDropSide(null)
    if (!raw || !side) return
    e.preventDefault()
    const from = Number(raw)
    if (Number.isNaN(from) || from === index) return
    // O índice de destino é o da lista já sem o bloco que está viajando.
    const insertAt = index + (side === "after" ? 1 : 0)
    dispatch({
      type: "block/reorder",
      from,
      to: from < insertAt ? insertAt - 1 : insertAt,
    })
  }

  return (
    <div
      onClick={handleClick}
      onDragOver={onDragOver}
      onDragLeave={() => setDropSide(null)}
      onDrop={onDrop}
      // Cada bloco é um alvo de teclado de verdade: Tab chega nele, Enter
      // entra na edição. Antes disso, só o mouse selecionava.
      tabIndex={editing ? -1 : 0}
      role="button"
      aria-pressed={selected}
      aria-label={t("editor.blocks.selectAria", {
        type: t(`editor.blocks.${block.type}`),
        position: index + 1,
      })}
      onFocus={() => {
        if (!selected) dispatch({ type: "block/select", id: block.id })
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !editing && editable) {
          e.preventDefault()
          dispatch({ type: "block/edit", editing: true })
        }
      }}
      className={cn(
        "group/block relative outline-none",
        !editing && "cursor-pointer",
        dragging && "opacity-40"
      )}
    >
      {editing ? (
        <BlockEditor block={block} theme={theme} />
      ) : empty ? (
        <p className="text-[4.6cqw] leading-[1.45] opacity-40">
          {t("editor.canvas.emptyBlock")}
        </p>
      ) : (
        <CardBlockView block={block} theme={theme} />
      )}

      {/* Anel de seleção/hover — fora do fluxo, não mexe no layout. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-[1.4cqw] transition-opacity duration-150",
          selected
            ? "ring-2 ring-primary"
            : "opacity-0 ring-1 ring-primary/50 group-hover/block:opacity-100"
        )}
      />

      {/* Linha de destino do arrasto. */}
      {dropSide && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-[-1.4cqw] h-[0.6cqw] bg-primary",
            dropSide === "before" ? "-top-[2cqw]" : "-bottom-[2cqw]"
          )}
        />
      )}

      {/* Alça de arrasto: só ela inicia o arrasto do bloco. */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(BLOCK_DRAG_TYPE, String(index))
          e.dataTransfer.effectAllowed = "move"
          setDragging(true)
        }}
        onDragEnd={() => setDragging(false)}
        onClick={(e) => e.stopPropagation()}
        role="button"
        tabIndex={-1}
        aria-label={t("editor.blocks.dragAria")}
        className={cn(
          "absolute top-0 -left-[6cqw] flex h-[6cqw] w-[5cqw] cursor-grab items-center justify-center",
          "opacity-0 transition-opacity duration-150 active:cursor-grabbing",
          "group-hover/block:opacity-60 hover:!opacity-100"
        )}
      >
        <GripVertical className="size-[4cqw] min-h-3 min-w-3" />
      </div>

      <InsertSlot index={index} position="top" />
      {isLast && <InsertSlot index={index + 1} position="bottom" />}
    </div>
  )
}
