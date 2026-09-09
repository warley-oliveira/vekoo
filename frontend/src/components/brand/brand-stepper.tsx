import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { Check, Lock } from "lucide-react"

import { BRAND_STEPS, canOpenStep, stepHref, type BrandCore, type BrandStep } from "@/lib/brand-core"
import { cn } from "@/lib/utils"

type BrandStepperProps = {
  brandCore: BrandCore
  current: BrandStep
  className?: string
}

/**
 * A trilha das etapas. Vertical no desktop, pílulas roláveis no celular.
 * Navegação livre entre etapas já visitadas; as outras esperam a vez.
 */
export function BrandStepper({ brandCore, current, className }: BrandStepperProps) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t("brand.stepper.aria")} className={className}>
      <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {BRAND_STEPS.map((step, index) => {
          const percent = brandCore.completeness.sections[step]
          const open = canOpenStep(brandCore, step, current)
          const active = step === current
          const done = percent === 100
          const state = active
            ? t("brand.stepper.current")
            : done
              ? t("brand.stepper.done")
              : open
                ? t("brand.stepper.partial")
                : t("brand.stepper.locked")

          const content = (
            <>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums transition-colors",
                  active && "border-primary bg-primary text-primary-foreground",
                  !active && done && "border-primary/40 bg-accent text-accent-foreground",
                  !active && !done && "border-border text-muted-foreground"
                )}
                aria-hidden
              >
                {done && !active ? <Check className="size-3.5" /> : !open ? <Lock className="size-3" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", active ? "font-medium" : "font-normal")}>
                  {t(`brand.steps.${step}.title`)}
                </span>
                <span className="hidden text-xs text-muted-foreground lg:block">
                  {t("brand.overview.sectionPercent", { percent })}
                </span>
              </span>
            </>
          )

          const classes = cn(
            "flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-1.5 whitespace-nowrap outline-none transition-colors lg:whitespace-normal",
            active && "bg-accent/60",
            open && !active && "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
            !open && "cursor-not-allowed opacity-60"
          )

          return (
            <li key={step} className="shrink-0">
              {open ? (
                <Link
                  to={stepHref(brandCore.id, step)}
                  aria-current={active ? "step" : undefined}
                  aria-label={`${t(`brand.steps.${step}.title`)} — ${state}`}
                  className={classes}
                >
                  {content}
                </Link>
              ) : (
                <span aria-disabled className={classes} title={state}>
                  {content}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
