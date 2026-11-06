import { useTranslation } from "react-i18next"

import { SidePanel } from "@/components/shared"
import { WIDGET_CSS_VARIABLES } from "./widget-css-variables"

/**
 * O que a pessoa precisa para instalar e ajustar o chat. O guia completo da API JavaScript
 * do widget acompanha o bundle, que está fora desta migração.
 */
export function WidgetGuide({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const installSteps = t("connectors.widget.guide.installSteps", { returnObjects: true }) as unknown as string[]
  const limits = t("connectors.widget.guide.limits", { returnObjects: true }) as unknown as string[]

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("connectors.widget.guide.title")}
      description={t("connectors.widget.guide.description")}
    >
      <div className="flex flex-col gap-6 text-sm">
        <section className="space-y-2">
          <h3 className="font-heading text-base font-medium">{t("connectors.widget.guide.installTitle")}</h3>
          <ol className="list-decimal space-y-1 pl-5 text-pretty">
            {installSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="font-heading text-base font-medium">{t("connectors.widget.guide.cssTitle")}</h3>
          <p className="text-pretty text-muted-foreground">{t("connectors.widget.guide.cssIntro")}</p>
          <dl className="divide-y rounded-lg ring-1 ring-foreground/10">
            {WIDGET_CSS_VARIABLES.map(({ name, key }) => (
              <div key={name} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <dt className="font-mono text-xs">{name}</dt>
                <dd className="text-xs text-muted-foreground sm:text-right">
                  {t(`connectors.widget.guide.variables.${key}`)}
                </dd>
              </div>
            ))}
          </dl>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
            {t("connectors.widget.guide.cssExample")}
          </pre>
        </section>

        <section className="space-y-2">
          <h3 className="font-heading text-base font-medium">{t("connectors.widget.guide.pinnedTitle")}</h3>
          <p className="text-pretty text-muted-foreground">{t("connectors.widget.guide.pinnedText")}</p>
        </section>

        <section className="space-y-2">
          <h3 className="font-heading text-base font-medium">{t("connectors.widget.guide.limitsTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-pretty text-muted-foreground">
            {limits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </SidePanel>
  )
}
