import { useTranslation } from "react-i18next"

import { BlockEditor } from "@/components/editor/block-editors"
import { CardBlockView } from "@/components/editor/card-art"
import { isEditableBlock, useEditor } from "@/components/editor/editor-store"
import { InsertSlot } from "@/components/editor/insert-slot"
import { blockPlainText, type Block, type CarouselTheme } from "@/lib/doc"
import { cn } from "@/lib/utils"

// Um bloco dentro do canvas: clique seleciona (anel violeta), segundo clique
// edita no lugar. O anel e os sinais de inserção vivem fora do fluxo — o
// layout do card é idêntico ao da arte estática.

type EditableBlockProps = {
  block: Block
  theme: CarouselTheme
  index: number
  isLast: boolean
}

export function EditableBlock({ block, theme, index, isLast }: EditableBlockProps) {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()

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

  return (
    <div
      onClick={handleClick}
      className={cn("group/block relative", !editing && "cursor-pointer")}
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

      <InsertSlot index={index} position="top" />
      {isLast && <InsertSlot index={index + 1} position="bottom" />}
    </div>
  )
}
