import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { ChevronRight, LayoutGrid, SquareKanban } from "lucide-react"

import { BottomSheet } from "@/components/shell/bottom-sheet"
import { useMobileNav } from "@/hooks/use-mobile-nav"
import { useNavigation } from "@/hooks/use-navigation"
import { ALL_PIPELINES_PATH, PIPELINES_ENTRY_ID } from "@/lib/navigation"
import { cn } from "@/lib/utils"

const ROW =
  "flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"

/**
 * O seletor de pipelines, aberto pela aba "Pipelines". Os pipelines já vêm prontos na árvore
 * do menu: aqui não há requisição nova nem cache duplicado.
 */
export function PipelinesSheet() {
  const { t } = useTranslation()
  const { entries, isActive } = useNavigation()
  const open = useMobileNav((state) => state.activeSheet === "pipelines")
  const closeSheet = useMobileNav((state) => state.closeSheet)

  const entry = entries.find((candidate) => candidate.id === PIPELINES_ENTRY_ID)
  const boards = entry?.children ?? []

  return (
    <BottomSheet
      open={open}
      onClose={closeSheet}
      title={t("navigation.pipelines")}
      showTitle
      maxHeightRatio={0.7}
    >
      <ul className="flex flex-col gap-0.5 pb-3">
        {boards.map((board) => {
          const active = isActive(board)
          return (
            <li key={board.id}>
              <Link
                to={board.to}
                replace
                onClick={closeSheet}
                aria-current={active ? "page" : undefined}
                className={cn(
                  ROW,
                  active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
              >
                <SquareKanban className="size-5 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{board.title}</span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          )
        })}
        <li className="mt-1 border-t pt-1">
          <Link
            to={ALL_PIPELINES_PATH}
            replace
            onClick={closeSheet}
            className={cn(ROW, "text-muted-foreground hover:bg-muted")}
          >
            <LayoutGrid className="size-5 shrink-0" aria-hidden />
            <span className="flex-1 truncate">{t("navigation.allBoards")}</span>
          </Link>
        </li>
      </ul>
    </BottomSheet>
  )
}
