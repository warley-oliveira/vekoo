import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Download, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { usePwaUpdate } from "@/hooks/use-pwa-update"

/**
 * O aviso de versão nova: um cartão discreto no canto, que não bloqueia nada. No celular
 * fica acima da barra inferior. Montado na raiz, porque vale também no editor e nas
 * telas de entrada.
 */
export function PwaUpdatePrompt() {
  const { t } = useTranslation()
  const { phase, apply, dismiss } = usePwaUpdate()
  const reducedMotion = useReducedMotion()
  const applying = phase === "applying"

  return (
    <AnimatePresence>
      {phase !== "idle" && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          transition={
            reducedMotion
              ? { duration: 0.12 }
              : { type: "spring", duration: 0.3, bounce: 0.05 }
          }
          className="fixed inset-x-3 bottom-[calc(max(var(--app-bottom-nav-total),var(--app-safe-bottom))+0.75rem)] z-40 rounded-xl border bg-popover p-3.5 text-popover-foreground shadow-lg sm:right-4 sm:left-auto sm:w-80"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              {applying ? (
                <Spinner className="size-4" aria-label={t("navigation.pwa.applying")} />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug font-medium">
                {t(applying ? "navigation.pwa.applying" : "navigation.pwa.updateTitle")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {t(
                  applying
                    ? "navigation.pwa.applyingDescription"
                    : "navigation.pwa.updateDescription"
                )}
              </p>
              {!applying && (
                <Button size="sm" className="mt-2.5 pointer-coarse:h-10" onClick={apply}>
                  {t("navigation.pwa.update")}
                </Button>
              )}
            </div>
            {!applying && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="-mt-0.5 -mr-0.5 text-muted-foreground pointer-coarse:size-10"
                aria-label={t("navigation.pwa.dismiss")}
                onClick={dismiss}
              >
                <X />
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
