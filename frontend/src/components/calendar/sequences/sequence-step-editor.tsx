import { useController, useFormState, useWatch, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { AlertCircle, ChevronDown, Trash2 } from "lucide-react"

import { MessageRuleField } from "@/components/calendar/settings/message-rule-field"
import { NumberField, SwitchField, TextField } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { ReminderPeriod } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"
import { DelayField } from "./delay-field"
import type { SequenceValues } from "./sequence-form"

type SequenceStepEditorProps = {
  form: UseFormReturn<SequenceValues>
  index: number
  /** Só um passo: não dá para excluir, e a sequência precisa de ao menos um. */
  canRemove: boolean
  isLast: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "Horário de Brasília (America/Sao_Paulo)". */
  zoneLabel: string
  onRemove: () => void
  onTest: () => void
  onShowTools: () => void
}

/** Um passo: dobrado mostra o resumo, para ler a sequência inteira de uma vez. */
export function SequenceStepEditor({
  form,
  index,
  canRemove,
  isLast,
  open,
  onOpenChange,
  zoneLabel,
  onRemove,
  onTest,
  onShowTools,
}: SequenceStepEditorProps) {
  const { t } = useTranslation()
  const { control } = form
  const path = `steps.${index}` as const

  const step = useWatch({ control, name: path })
  const { errors } = useFormState({ control, name: path })
  const hasError = Boolean(errors.steps?.[index])

  const amount = useController({ control, name: `${path}.runAfter` })
  const unit = useController({ control, name: `${path}.runAfterUnit` })

  const allDay = Boolean(step?.allDay)
  const usesAi = step?.mode === "ai"
  const delay =
    step?.runAfter != null
      ? t(`calendar.sequences.delay.long.${step.runAfterUnit}`, { count: step.runAfter })
      : null

  return (
    <li className="relative pb-4 last:pb-0">
      {isLast ? null : (
        <span aria-hidden className="absolute top-8 bottom-0 left-3 w-px -translate-x-1/2 bg-border" />
      )}
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums"
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <CollapsibleTrigger
                render={
                  <button
                    type="button"
                    className="group/step flex min-w-0 flex-1 items-start gap-1.5 rounded text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
                  />
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm leading-6 font-medium">
                    {step?.name?.trim() || t("calendar.sequences.step.unnamed", { number: index + 1 })}
                  </span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    {[
                      delay
                        ? t(
                            index === 0
                              ? "calendar.sequences.step.afterEnrollment"
                              : "calendar.sequences.step.afterPrevious",
                            { delay }
                          )
                        : null,
                      t(usesAi ? "calendar.reminders.badges.ai" : "calendar.reminders.badges.text"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {hasError && !open ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle aria-hidden className="size-3.5" />
                      {t("calendar.sequences.step.hasError")}
                    </span>
                  ) : null}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              {canRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("calendar.sequences.step.remove", { number: index + 1 })}
                  className="-mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={onRemove}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>

            <CollapsibleContent>
              <div className="flex flex-col gap-4 pt-3 pb-1">
                <TextField
                  control={control}
                  name={`${path}.name`}
                  label={t("calendar.sequences.step.name")}
                  maxLength={120}
                  autoComplete="off"
                />

                <DelayField
                  label={t(
                    index === 0
                      ? "calendar.sequences.step.delayFirst"
                      : "calendar.sequences.step.delayNext"
                  )}
                  error={amount.fieldState.error?.message}
                  amount={amount.field.value}
                  unit={unit.field.value as ReminderPeriod}
                  onChange={(nextAmount, nextUnit) => {
                    amount.field.onChange(nextAmount)
                    unit.field.onChange(nextUnit)
                  }}
                />

                <div className="flex flex-col gap-2">
                  <SwitchField
                    control={control}
                    name={`${path}.allDay`}
                    label={t("calendar.sequences.step.allDay")}
                    hint={t("calendar.sequences.step.allDayHint")}
                  />
                  {allDay ? null : (
                    <div className="space-y-1.5">
                      <div className="grid max-w-xs grid-cols-2 gap-3">
                        <NumberField
                          control={control}
                          name={`${path}.timeFrom`}
                          label={t("calendar.sequences.step.from")}
                          min={0}
                          max={23}
                          placeholder="8"
                        />
                        <NumberField
                          control={control}
                          name={`${path}.timeAt`}
                          label={t("calendar.sequences.step.to")}
                          min={1}
                          max={24}
                          placeholder="17"
                        />
                      </div>
                      <p className="text-xs leading-snug text-pretty text-muted-foreground">
                        {t("calendar.sequences.step.windowHint", { zone: zoneLabel })}
                      </p>
                    </div>
                  )}
                </div>

                <MessageRuleField
                  control={control}
                  prefix={`${path}.`}
                  kind="step"
                  onTest={onTest}
                  onShowTools={onShowTools}
                />
              </div>
            </CollapsibleContent>
          </div>
        </div>
      </Collapsible>
    </li>
  )
}
