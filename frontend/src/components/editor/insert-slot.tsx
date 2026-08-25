import type { ReactElement, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"

import { BLOCK_TYPES } from "@/components/editor/block-types"
import { useEditor } from "@/components/editor/editor-store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { defaultBlock, type BlockType } from "@/lib/doc"
import { newId } from "@/lib/store"
import { cn } from "@/lib/utils"

/** Menu com os oito tipos — insere um bloco na posição dada e já seleciona. */
export function InsertMenu({
  index,
  trigger,
  children,
}: {
  index: number
  trigger: ReactElement
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()

  function insert(type: BlockType) {
    dispatch({
      type: "block/insert",
      index,
      block: defaultBlock(type, newId("block")),
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-40">
        {BLOCK_TYPES.map(({ type, icon: Icon }) => (
          <DropdownMenuItem key={type} onClick={() => insert(type)}>
            <Icon /> {t(`editor.blocks.${type}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * O sinal discreto de inserção entre blocos: fora do fluxo (não mexe no
 * layout), aparece quando o ponteiro está sobre o bloco vizinho.
 */
export function InsertSlot({
  index,
  position,
}: {
  index: number
  position: "top" | "bottom"
}) {
  const { t } = useTranslation()

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute inset-x-0 z-10 flex justify-center",
        position === "top" ? "-top-[2.6cqw]" : "-bottom-[2.6cqw]",
        "pointer-events-none opacity-0 transition-opacity duration-150",
        "group-hover/block:pointer-events-auto group-hover/block:opacity-100",
        "focus-within:pointer-events-auto focus-within:opacity-100"
      )}
    >
      <InsertMenu
        index={index}
        trigger={
          <button
            type="button"
            aria-label={t("editor.blocks.insertAria")}
            className={cn(
              "flex size-[4.6cqw] min-h-5 min-w-5 items-center justify-center rounded-full",
              "bg-primary text-primary-foreground shadow-sm",
              "outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            )}
          >
            <Plus className="size-[3cqw] min-h-3 min-w-3" />
          </button>
        }
      />
    </div>
  )
}
