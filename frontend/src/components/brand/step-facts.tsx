import { useMemo } from "react"
import { Controller, useFieldArray, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { CalendarClock, ShieldAlert } from "lucide-react"

import { AddButton, List, ListRow } from "@/components/brand/list-row"
import { useRegisterStep, useWizard } from "@/components/brand/brand-wizard-context"
import { useStepForm } from "@/components/brand/use-step-form"
import { EmptyState } from "@/components/empty-state"
import { Field } from "@/components/form-field"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  FACT_KINDS,
  FACT_STATUSES,
  WEEKDAYS,
  buildStepSchemas,
  emptyHours,
  newFact,
  type BrandFact,
  type FactKind,
  type FactStatus,
} from "@/lib/brand-core"
import { cn } from "@/lib/utils"

export function StepFacts() {
  const { t } = useTranslation()
  const { brandCore, previewSection } = useWizard()
  const schema = useMemo(() => buildStepSchemas(t).facts, [t])
  const { form, status, commit, retry } = useStepForm({
    section: "facts",
    defaults: brandCore.document.facts,
    schema,
    onChange: (values) => previewSection("facts", values),
  })
  useRegisterStep(commit, status, retry)

  const { register, control, setValue, formState: { errors } } = form
  const items = useFieldArray({ control, name: "items" })
  const watched = (useWatch({ control, name: "items" }) ?? []) as BrandFact[]
  const pending = watched.filter((f) => f.status === "pending").length
  const kindLabels = useMemo(() => Object.fromEntries(FACT_KINDS.map((k) => [k, t(`brand.facts.kinds.${k}`)])), [t])

  return (
    <form noValidate className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <p className="text-sm text-muted-foreground">{t("brand.facts.intro")}</p>

      <aside className="flex gap-3 rounded-lg border border-primary/30 bg-accent/40 p-4" aria-label={t("brand.facts.gateTitle")}>
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1 text-sm">
          <p className="font-medium">{t("brand.facts.gateTitle")}</p>
          <p className="text-muted-foreground">{t("brand.facts.gateDescription")}</p>
          <p className="pt-1">
            <Badge variant={pending > 0 ? "destructive" : "secondary"}>
              {pending > 0 ? t("brand.facts.pendingCount", { count: pending }) : t("brand.facts.allConfirmed")}
            </Badge>
          </p>
        </div>
      </aside>

      {items.fields.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-6" />}
          title={t("brand.facts.empty")}
          action={{ label: t("brand.facts.addFact"), onClick: () => items.append(newFact("price")) }}
        />
      ) : (
        <List aria-label={t("brand.steps.facts.title")}>
          {items.fields.map((item, index) => {
            const fact = watched[index] ?? item
            const itemErrors = errors.items?.[index]
            return (
              <ListRow key={item.id} removeLabel={t("brand.facts.remove")} onRemove={() => items.remove(index)}>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[9rem_1fr_auto]">
                    <Controller
                      control={control}
                      name={`items.${index}.kind`}
                      render={({ field }) => (
                        <div className="space-y-1">
                          <span className="text-sm font-medium">{t("brand.facts.kind")}</span>
                          <Select
                            value={field.value}
                            items={kindLabels}
                            onValueChange={(v) => {
                              const kind = v as FactKind
                              field.onChange(kind)
                              if (kind === "hours" && !fact.hours) setValue(`items.${index}.hours`, emptyHours())
                            }}
                          >
                            <SelectTrigger className="w-full" aria-label={t("brand.facts.kind")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FACT_KINDS.map((kind) => <SelectItem key={kind} value={kind}>{kindLabels[kind]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    />
                    <Field label={t("brand.facts.label")} error={itemErrors?.label?.message} className="space-y-1">
                      {(field) => (
                        <Input {...field} {...register(`items.${index}.label`)} placeholder={t(`brand.facts.labelPlaceholder.${fact.kind}`)} />
                      )}
                    </Field>
                    <Controller
                      control={control}
                      name={`items.${index}.status`}
                      render={({ field }) => (
                        <div className="space-y-1">
                          <span className="text-sm font-medium">{t("brand.facts.status")}</span>
                          <ToggleGroup
                            value={[field.value]}
                            onValueChange={(value) => {
                              const next = value[0] as FactStatus | undefined
                              if (next) field.onChange(next)
                            }}
                            variant="outline"
                            spacing={0}
                            aria-label={t("brand.facts.status")}
                          >
                            {FACT_STATUSES.map((s) => (
                              <ToggleGroupItem
                                key={s}
                                value={s}
                                className={cn(s === "confirmed" && "data-pressed:bg-primary data-pressed:text-primary-foreground")}
                              >
                                {t(`brand.facts.statuses.${s}`)}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>
                      )}
                    />
                  </div>

                  {fact.kind === "hours" ? (
                    <fieldset className="space-y-1.5">
                      <legend className="text-sm font-medium">{t("brand.facts.hours")}</legend>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
                        {WEEKDAYS.map((day) => (
                          <Controller
                            key={day}
                            control={control}
                            name={`items.${index}.hours.${day}`}
                            render={({ field }) => (
                              <label className="space-y-1 text-xs">
                                <span className="font-medium text-muted-foreground">{t(`brand.facts.weekdays.${day}`)}</span>
                                <Input
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
                                  placeholder={t("brand.facts.closed")}
                                  className="h-8"
                                  aria-label={t(`brand.facts.weekdays.${day}`)}
                                />
                              </label>
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{t("brand.facts.hoursPlaceholder")} · {t("brand.facts.closed")}</p>
                    </fieldset>
                  ) : (
                    <Field label={t("brand.facts.value")} error={itemErrors?.value?.message} className="space-y-1">
                      {(field) => (
                        <Input {...field} {...register(`items.${index}.value`)} placeholder={t(`brand.facts.valuePlaceholder.${fact.kind}`)} />
                      )}
                    </Field>
                  )}
                </div>
              </ListRow>
            )
          })}
        </List>
      )}

      {items.fields.length > 0 && (
        <AddButton onClick={() => items.append(newFact("price"))}>{t("brand.facts.addFact")}</AddButton>
      )}
    </form>
  )
}
