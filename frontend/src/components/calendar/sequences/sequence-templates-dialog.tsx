import { useTranslation } from "react-i18next"
import {
  BellRing,
  Compass,
  MessageCircleHeart,
  RefreshCw,
  type LucideIcon,
} from "lucide-react"

import { Callout, ResponsiveDialog, StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import type { SequenceTrigger } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { SEQUENCE_TEMPLATES, type SequenceTemplate } from "./sequence-templates"

const ICONS: Record<string, LucideIcon> = {
  show_feedback: MessageCircleHeart,
  show_next_step: Compass,
  noshow_reactivation: RefreshCw,
  noshow_quick: BellRing,
}

type SequenceTemplatesDialogProps = {
  trigger: SequenceTrigger | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUse: (template: SequenceTemplate) => void
}

/** Modelos prontos para o resultado escolhido. Usar só preenche o painel: nada existe até criar. */
export function SequenceTemplatesDialog({
  trigger,
  open,
  onOpenChange,
  onUse,
}: SequenceTemplatesDialogProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const templates = SEQUENCE_TEMPLATES.filter((template) => template.trigger === trigger)

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("calendar.sequences.templates.title")}
      description={trigger ? t(`calendar.sequences.templates.description.${trigger}`) : undefined}
    >
      <div className="flex flex-col gap-3">
        <Callout>{t("calendar.sequences.templates.aiNotice")}</Callout>
        <ul className="flex flex-col divide-y">
          {templates.map((template) => {
            const content = template.content[language]
            const Icon = ICONS[template.key] ?? BellRing
            const first = template.steps[0]
            return (
              <li key={template.key} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 gap-3">
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm leading-snug font-medium">{content.name}</p>
                    <p className="text-sm text-pretty text-muted-foreground">{content.description}</p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <StatusBadge tone="neutral" dot={false}>
                        {t("calendar.sequences.stepsCount", { count: template.steps.length })}
                      </StatusBadge>
                      <StatusBadge tone="neutral" dot={false}>
                        {t("calendar.sequences.templates.firstAfter", {
                          delay: t(`calendar.sequences.delay.preset.${first.runAfterUnit}`, {
                            count: first.runAfter,
                          }),
                        })}
                      </StatusBadge>
                      {template.stopOnReply ? (
                        <StatusBadge tone="neutral" dot={false}>
                          {t("calendar.sequences.badges.stopOnReply")}
                        </StatusBadge>
                      ) : null}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t("calendar.sequences.templates.useNamed", { name: content.name })}
                  className="shrink-0 self-start pointer-coarse:h-10"
                  onClick={() => onUse(template)}
                >
                  {t("calendar.sequences.templates.use")}
                </Button>
              </li>
            )
          })}
        </ul>
      </div>
    </ResponsiveDialog>
  )
}
