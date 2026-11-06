import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  isImportRunning,
  useProductImports,
  type ImportFeed,
} from "@/hooks/products/use-product-imports"
import { useMotionPreset } from "@/lib/motion"

const RECENT_IMPORTS = 5

type ImportBannerProps = {
  feed: ImportFeed
  /** O painel já está mostrando: a faixa só repetiria. */
  hidden: boolean
  onOpen: (importId: string) => void
}

/**
 * Importação em andamento, na grade: a de quem fechou o painel, a de um colega, e a de quem
 * recarregou a página no meio. Sem isto, os itens apareceriam sem explicação.
 */
export function ImportBanner({ feed, hidden, onOpen }: ImportBannerProps) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const { imports } = useProductImports(1, RECENT_IMPORTS)

  const running = imports?.find((entry) => {
    const live = feed.live[entry.id]
    return isImportRunning(entry) && live?.kind !== "completed" && live?.kind !== "error"
  })
  const live = running ? feed.live[running.id] : undefined
  const percentage =
    live && live.kind !== "error" ? live.percentage : (running?.percentage ?? 0)

  return (
    <AnimatePresence initial={false}>
      {running && !hidden ? (
        <motion.div
          {...preset.slideUp}
          role="status"
          className="flex flex-col gap-2 rounded-lg bg-muted/50 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
            <span className="truncate">
              {t("products.import.banner.running", {
                name: running.filename,
                value: Math.round(percentage),
              })}
            </span>
          </div>
          <Progress
            value={Math.min(percentage, 100)}
            aria-label={t("products.import.tracking.progressLabel")}
            className="gap-0 sm:w-40"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-end pointer-coarse:h-10 sm:self-auto"
            onClick={() => onOpen(running.id)}
          >
            {t("products.import.banner.open")}
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
