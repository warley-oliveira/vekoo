import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"

import { BLOCK_TYPES } from "@/components/editor/block-types"
import { activeCard, useEditor } from "@/components/editor/editor-store"
import { InsertMenu } from "@/components/editor/insert-slot"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { defaultBlock, type BlockType } from "@/lib/doc"
import { newId } from "@/lib/store"

// A barra de blocos, à direita. O primeiro item é um "+" que abre a lista
// nomeada — é ele que diz, sem tooltip nenhuma, para que a barra serve. Os
// ícones abaixo são atalhos para quem já sabe: um clique insere depois do
// bloco selecionado e já abre a edição.

export function BlockBar() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()

  const card = activeCard(state)
  const selectedIndex =
    card?.blocks.findIndex((b) => b.id === state.selection.blockId) ?? -1
  const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : card?.blocks.length ?? 0

  function insert(type: BlockType) {
    if (!card) return
    dispatch({
      type: "block/insert",
      index: insertAt,
      block: defaultBlock(type, newId("block")),
    })
  }

  return (
    <aside
      aria-label={t("editor.blockBar.label")}
      className="hidden w-12 shrink-0 flex-col items-center gap-1 border-l bg-background p-1.5 md:flex"
    >
      <InsertMenu
        index={insertAt}
        trigger={
          <Button
            size="icon-sm"
            aria-label={t("editor.blockBar.insert")}
            className="shrink-0"
          />
        }
      >
        <Plus />
      </InsertMenu>

      <Separator className="my-1 w-6" />

      {BLOCK_TYPES.map(({ type, icon: Icon }) => (
        <Tooltip key={type}>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t(`editor.blocks.add.${type}`)}
                onClick={() => insert(type)}
              />
            }
          >
            <Icon />
          </TooltipTrigger>
          <TooltipContent side="left">
            {t(`editor.blocks.add.${type}`)}
          </TooltipContent>
        </Tooltip>
      ))}
    </aside>
  )
}
