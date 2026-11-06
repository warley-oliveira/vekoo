import { useMemo } from "react"
import { useController, useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { NumberInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTriggerContext } from "@/hooks/pipelines-admin/use-trigger-context"
import {
  OPERATORS_BY_KIND,
  conditionFieldsFor,
  conditionKind,
  isKnownConditionKey,
  operatorTakesValue,
} from "@/lib/pipelines-admin/trigger-catalog"
import type { TriggerDraft } from "@/lib/pipelines-admin/trigger-form"
import type { ConditionOperator } from "@/lib/pipelines-admin/types"
import { PhrasePicker } from "./phrase-picker"

const PRIORITIES = ["low", "medium", "high", "urgent"]

/** Uma condição, escrita como o resto da frase: "a prioridade" "for" "Alta". */
export function ConditionRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const { t } = useTranslation()
  const { lookups, stageOptions, peopleOptions } = useTriggerContext()
  const { control, setValue } = useFormContext<TriggerDraft>()

  const eventType = useWatch({ control, name: "eventType" })
  const conditions = useWatch({ control, name: "conditions" })
  const current = conditions?.[index]
  const key = current?.key ?? ""
  const operator = current?.operator ?? "equals"
  const kind = conditionKind(key)

  const { fieldState: valueState } = useController({ control, name: `conditions.${index}.value` })

  const fieldOptions = useMemo(() => {
    const used = new Set((conditions ?? []).map((condition) => condition.key))
    const options = conditionFieldsFor(eventType)
      .filter((field) => field.key === key || !used.has(field.key))
      .map((field) => ({ value: field.key, label: lookups.conditionField(field.key) }))
    // Condição gravada que não é deste evento, ou que a tela nem conhece: continua aparecendo.
    if (!options.some((option) => option.value === key)) {
      options.unshift({ value: key, label: lookups.conditionField(key) })
    }
    return options
  }, [conditions, eventType, key, lookups])

  const operatorOptions = useMemo(
    () =>
      OPERATORS_BY_KIND[kind].map((value) => ({
        value,
        label: lookups.conditionOperator(value),
      })),
    [kind, lookups]
  )

  const setField = (path: "key" | "operator" | "value", value: string) =>
    setValue(`conditions.${index}.${path}`, value as never, {
      shouldDirty: true,
      shouldValidate: valueState.isTouched || valueState.invalid,
    })

  function changeKey(next: string) {
    setField("key", next)
    setField("operator", OPERATORS_BY_KIND[conditionKind(next)][0])
    setField("value", "")
  }

  const error = valueState.error?.message

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <PhrasePicker
          label={t("pipelinesAdmin.triggers.editor.conditionField")}
          value={key}
          options={fieldOptions}
          onChange={changeKey}
        />
        <PhrasePicker
          label={t("pipelinesAdmin.triggers.editor.conditionOperator")}
          value={operator}
          options={operatorOptions}
          onChange={(value) => setField("operator", value as ConditionOperator)}
        />
        {operatorTakesValue(operator) ? (
          kind === "priority" ? (
            <PhrasePicker
              label={t("pipelinesAdmin.triggers.editor.conditionValue")}
              value={current?.value}
              placeholder={t("pipelinesAdmin.triggers.editor.choose")}
              invalid={Boolean(error)}
              options={PRIORITIES.map((value) => ({ value, label: lookups.priorityLabel(value) }))}
              onChange={(value) => setField("value", value)}
            />
          ) : kind === "stage" ? (
            <PhrasePicker
              label={t("pipelinesAdmin.triggers.editor.conditionValue")}
              value={current?.value}
              placeholder={t("pipelinesAdmin.triggers.editor.choose")}
              invalid={Boolean(error)}
              options={stageOptions}
              onChange={(value) => setField("value", value)}
            />
          ) : kind === "person" ? (
            <PhrasePicker
              label={t("pipelinesAdmin.triggers.editor.conditionValue")}
              value={current?.value}
              placeholder={t("pipelinesAdmin.triggers.editor.choose")}
              invalid={Boolean(error)}
              options={peopleOptions}
              onChange={(value) => setField("value", value)}
            />
          ) : kind === "number" ? (
            <NumberInput
              aria-invalid={Boolean(error)}
              aria-describedby={undefined}
              value={current?.value ? Number(current.value) : null}
              onChange={(value) => setField("value", value === null ? "" : String(value))}
              placeholder={t("pipelinesAdmin.triggers.editor.valuePlaceholder")}
              className="w-28"
            />
          ) : (
            <Input
              aria-label={t("pipelinesAdmin.triggers.editor.conditionValue")}
              aria-invalid={Boolean(error) || undefined}
              value={current?.value ?? ""}
              placeholder={t("pipelinesAdmin.triggers.editor.valuePlaceholder")}
              className="h-8 w-44 max-w-full pointer-coarse:h-10"
              onChange={(event) => setField("value", event.target.value)}
            />
          )
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("pipelinesAdmin.triggers.editor.removeCondition")}
          className="text-muted-foreground pointer-coarse:size-10"
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
      {!isKnownConditionKey(key) ? (
        <p className="text-xs text-muted-foreground">{t("pipelinesAdmin.triggers.editor.unknownCondition")}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
