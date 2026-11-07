import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Lock, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Uma ação, com o número da vez em que roda: é assim que a pessoa enxerga que uma depende da outra. */
export function ActionCard({
  step,
  icon,
  title,
  description,
  locked,
  removeLabel,
  onRemove,
  children,
}: {
  step: number
  icon: ReactNode
  title: string
  description: string
  locked?: boolean
  removeLabel?: string
  onRemove?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <article className="flex flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
      <header className="flex items-start gap-3">
        <span
          aria-label={t("webhooks.actions.step", { step })}
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums"
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-sm leading-snug font-medium">
            <span aria-hidden className="text-muted-foreground [&>svg]:size-4">
              {icon}
            </span>
            {title}
            {locked ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <Lock className="size-3 text-muted-foreground" aria-label={t("webhooks.actions.locked")} />
                </TooltipTrigger>
                <TooltipContent side="top">{t("webhooks.actions.locked")}</TooltipContent>
              </Tooltip>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{description}</p>
        </div>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={removeLabel}
            className="shrink-0 text-muted-foreground hover:text-status-danger pointer-coarse:size-10"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        ) : null}
      </header>
      {children}
    </article>
  )
}
