import { useMemo } from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { useTranslation } from "react-i18next"
import {
  Archive,
  ArrowRightLeft,
  Check,
  CheckSquare,
  PanelRightOpen,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useBoardHandle } from "@/hooks/pipelines/board-handle"
import { useBoardUi } from "@/hooks/pipelines/use-board-ui"
import { useCardActions } from "@/hooks/pipelines/use-card-actions"
import { findCard } from "@/lib/pipelines/board-state"

/**
 * O menu "..." dos cards do quadro. Um só para a tela inteira, ancorado no botão clicado: um menu
 * por card seria centenas de árvores montadas para nunca abrir.
 */
export function CardMenu({ isCrm }: { isCrm: boolean }) {
  const { t } = useTranslation()
  const handle = useBoardHandle()
  const actions = useCardActions()
  const request = useBoardUi((state) => state.cardMenu)
  const openMenu = useBoardUi((state) => state.openCardMenu)
  const requestMove = useBoardUi((state) => state.requestMove)
  const requestLost = useBoardUi((state) => state.requestLost)
  const toggleSelected = useBoardUi((state) => state.toggleSelected)

  const card = useMemo(() => {
    const board = handle.getBoard()
    return request && board ? (findCard(board, request.cardId)?.card ?? null) : null
  }, [handle, request])

  const close = () => openMenu(null)
  const open = Boolean(request && card)
  const isDealOpen = card ? !card.wonAt && !card.lostAt : false

  return (
    <MenuPrimitive.Root open={open} onOpenChange={(next) => (next ? null : close())}>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          className="isolate z-50 outline-none"
          anchor={request?.anchor}
          align="end"
          side="bottom"
          sideOffset={4}
        >
          <MenuPrimitive.Popup className="z-50 max-h-(--available-height) w-56 origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {card ? (
              <>
                <DropdownMenuItem onClick={() => actions.open(card.id)}>
                  <PanelRightOpen />
                  {t("pipelines.card.open")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => requestMove([card.id])}>
                  <ArrowRightLeft />
                  {t("pipelines.move.action")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleSelected(card.id)}>
                  <CheckSquare />
                  {t("pipelines.bulk.select")}
                </DropdownMenuItem>

                {isCrm ? <DropdownMenuSeparator /> : null}
                {isCrm && isDealOpen ? (
                  <>
                    <DropdownMenuItem onClick={() => void actions.closeDeal(card.id, "won")}>
                      <Check />
                      {t("pipelines.deal.markWon")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => requestLost(card.id)}>
                      <X />
                      {t("pipelines.deal.markLost")}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {isCrm && !isDealOpen ? (
                  <DropdownMenuItem onClick={() => void actions.reopen(card.id)}>
                    <RotateCcw />
                    {t("pipelines.deal.reopen")}
                  </DropdownMenuItem>
                ) : null}

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void actions.archive(card.id)}>
                  <Archive />
                  {t("pipelines.card.archive")}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => void actions.remove(card)}>
                  <Trash2 />
                  {t("pipelines.card.delete")}
                </DropdownMenuItem>
              </>
            ) : null}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  )
}
