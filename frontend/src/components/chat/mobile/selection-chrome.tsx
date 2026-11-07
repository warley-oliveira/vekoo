import { useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { MoreHorizontal, X } from "lucide-react"

import { BottomSheet } from "@/components/shell/bottom-sheet"
import { Button } from "@/components/ui/button"
import { useBackLayer } from "@/hooks/chat-mobile/use-chat-mobile"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { SelectionChromeProps } from "../chat-variant"
import { SheetRow } from "./sheet-row"

const BAR_ACTION =
  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[0.6875rem] leading-none font-medium transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted disabled:opacity-40 [&_svg]:size-5"

/**
 * Quem segura uma conversa entra na escolha. As barras cobrem o cabeçalho e a barra inferior da casca,
 * do mesmo tamanho: nenhuma linha sai do lugar debaixo do dedo. As ações ficam embaixo, ao alcance do
 * polegar, as três de sempre à vista e o resto numa folha. O voltar do aparelho sai da escolha.
 */
export default function SelectionChrome({
  count,
  loadedCount,
  primary,
  secondary,
  onExit,
  onClear,
  onSelectLoaded,
}: SelectionChromeProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [moreOpen, setMoreOpen] = useState(false)

  useBackLayer(true, onExit)

  const allChecked = loadedCount > 0 && count >= loadedCount
  const fromMore = (action: () => void) => () => {
    setMoreOpen(false)
    action()
  }

  // No `body`: a lista tem `contain`, que prenderia estas barras dentro dela.
  return createPortal(
    <div className="chat-touch">
      <div className="fixed inset-x-0 top-0 z-40 border-b bg-background pt-safe pr-safe pl-safe">
        <div className="flex h-14 items-center gap-1 pr-2 pl-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("chatDetails.bulk.exit")}
            className="size-11 shrink-0 [&_svg]:size-5"
            onClick={onExit}
          >
            <X />
          </Button>
          <p
            aria-live="polite"
            className="min-w-0 flex-1 truncate pl-1 font-heading text-base font-semibold tracking-tight"
          >
            {count > 0
              ? t("chatDetails.bulk.selected", { count, formatted: formatNumber(count, language) })
              : t("chatMobile.selection.none")}
          </p>
          <Button
            type="button"
            variant="ghost"
            className="h-10 shrink-0 px-3"
            disabled={loadedCount === 0}
            onClick={allChecked ? onClear : onSelectLoaded}
          >
            {allChecked ? t("chatMobile.selection.clear") : t("chatMobile.selection.all")}
          </Button>
        </div>
      </div>

      <div
        role="toolbar"
        aria-label={t("chatMobile.selection.actions")}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pr-safe pb-safe pl-safe"
      >
        <div className="flex h-(--app-bottom-nav-h) items-stretch gap-1 px-1 py-1">
          {primary.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={count === 0}
              className={BAR_ACTION}
              onClick={action.onSelect}
            >
              {action.icon}
              <span className="max-w-full truncate px-0.5">{action.label}</span>
            </button>
          ))}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={t("chatDetails.bulk.actions.more")}
            disabled={count === 0}
            className={cn(BAR_ACTION)}
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal />
            <span className="max-w-full truncate px-0.5">{t("chatMobile.selection.more")}</span>
          </button>
        </div>
      </div>

      <BottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t("chatDetails.bulk.actions.more")}
      >
        <div className="chat-touch flex flex-col gap-0.5 pb-3">
          {secondary.map((action) => (
            <SheetRow
              key={action.label}
              icon={action.icon}
              title={action.label}
              onClick={fromMore(action.onSelect)}
            />
          ))}
        </div>
      </BottomSheet>
    </div>,
    document.body
  )
}
