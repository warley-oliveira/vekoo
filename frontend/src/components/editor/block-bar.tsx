import { useTranslation } from "react-i18next"

import { BLOCK_TYPES } from "@/components/editor/block-types"
import { activeCard, useEditor } from "@/components/editor/editor-store"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { defaultBlock, type BlockType } from "@/lib/doc"
import { newId } from "@/lib/store"

// A barra de blocos, à direita: um ícone por tipo. Clique insere depois do
// bloco selecionado (ou no fim do card) e já abre a edição.

export function BlockBar() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()

  function insert(type: BlockType) {
    const card = activeCard(state)
    if (!card) return
    const selectedIndex = card.blocks.findIndex(
      (b) => b.id === state.selection.blockId
    )
    const index = selectedIndex >= 0 ? selectedIndex + 1 : card.blocks.length
    dispatch({
      type: "block/insert",
      index,
      block: defaultBlock(type, newId("block")),
    })
  }

  return (
    <aside
      aria-label={t("editor.blockBar.label")}
      className="hidden w-12 shrink-0 flex-col items-center gap-1 border-l bg-background p-1.5 md:flex"
    >
      {BLOCK_TYPES.map(({ type, icon: Icon }) => (
        <Tooltip key={type}>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t(`editor.blocks.${type}`)}
                onClick={() => insert(type)}
              />
            }
          >
            <Icon />
          </TooltipTrigger>
          <TooltipContent side="left">
            {t(`editor.blocks.${type}`)}
          </TooltipContent>
        </Tooltip>
      ))}
    </aside>
  )
}
