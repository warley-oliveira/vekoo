import { memo, useCallback, useId, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ArrowRight, Check, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import {
  Callout,
  CreatableSelect,
  DateRangePicker,
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  SearchInput,
  SelectInput,
  SidePanel,
  useConfirm,
  type DateRangeValue,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  useCustomFieldMutations,
  useCustomFieldValues,
  type ValuesPeriod,
} from "@/hooks/content/use-custom-fields"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { contentErrorMessage } from "@/lib/content/error-message"
import {
  buildSuggestedMapping,
  deriveCustomFieldKey,
  effectiveMapping,
  isEditableText,
  isNumericValue,
} from "@/lib/content/normalization"
import {
  NORMALIZATION_STRATEGIES,
  type CustomField,
  type DistinctFieldValue,
  type NormalizationStrategy,
  type NormalizeChange,
} from "@/lib/content/types"
import { toDateInputValue } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch, normalizeSearchText } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { FieldTypeIcon } from "./field-type-icon"

type Step = "values" | "mapping" | "review"
const STEPS: Step[] = ["values", "mapping", "review"]

/** A partir daqui o de-para ganha busca: ninguém acha um valor rolando 500 campos. */
const SEARCH_THRESHOLD = 12

type CustomFieldValuesPanelProps = {
  field: CustomField
  allFields: CustomField[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Os valores que um campo já tem nas conversas e a troca em massa deles. O caminho é prever,
 * conferir e aplicar: nada muda antes do último passo, e o último passo não tem volta.
 */
export function CustomFieldValuesPanel({
  field,
  allFields,
  open,
  onOpenChange,
}: CustomFieldValuesPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const confirm = useConfirm()
  const { normalize, createCustomField, addOption } = useCustomFieldMutations()

  const [step, setStep] = useState<Step>("values")
  const [period, setPeriod] = useState<DateRangeValue | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [strategy, setStrategy] = useState<NormalizationStrategy>("min")
  const [search, setSearch] = useState("")
  const [changes, setChanges] = useState<NormalizeChange[]>([])
  const [destination, setDestination] = useState<"same" | "other">("same")
  const [targetName, setTargetName] = useState<string | null>(null)
  const [convertToNumber, setConvertToNumber] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // O dia da organização, no fuso dela: a API lê sem fuso, e o fim do dia entra inteiro.
  const range = useMemo<ValuesPeriod>(
    () =>
      period
        ? {
            startDate: `${toDateInputValue(period.from)}T00:00:00`,
            endDate: `${toDateInputValue(period.to)}T23:59:59`,
          }
        : {},
    [period]
  )

  const { values, truncated, error, isLoading, isValidating, reload } = useCustomFieldValues(
    field.id,
    range
  )

  const entries = useMemo(() => values ?? [], [values])
  const filled = useMemo(() => entries.filter((entry) => entry.value !== null), [entries])
  const editable = useMemo(() => entries.filter(isEditableText), [entries])
  const withoutValue = entries.find((entry) => entry.value === null)?.count ?? 0
  const filledTotal = filled.reduce((total, entry) => total + entry.count, 0)
  const maxCount = filled.reduce((max, entry) => Math.max(max, entry.count), 0)

  const effective = useMemo(() => effectiveMapping(mapping), [mapping])
  const pairs = Object.keys(effective).length
  const hasWork = pairs > 0

  const total = changes.reduce((sum, change) => sum + change.count, 0)
  const shownChanges = changes.filter((change) => change.count > 0)

  // Número em tudo depois da troca: só então faz sentido oferecer virar o campo em Número.
  const numericAfter = editable.every((entry) =>
    isNumericValue(effective[entry.value] ?? entry.value)
  )
  const canConvert =
    destination === "same" && field.valueType !== "number" && numericAfter && editable.length > 0

  const targetFields = useMemo(
    () => allFields.filter((other) => other.id !== field.id),
    [allFields, field.id]
  )
  const existingTarget = targetName
    ? targetFields.find(
        (other) => normalizeSearchText(other.name) === normalizeSearchText(targetName)
      )
    : undefined
  const targetKey = existingTarget?.key ?? deriveCustomFieldKey(targetName ?? "")

  const newOptions = useMemo(() => {
    if (field.valueType !== "list" || destination !== "same") return []
    const known = new Set(field.optionValues.map(normalizeSearchText))
    return [...new Set(Object.values(effective))].filter(
      (value) => !known.has(normalizeSearchText(value))
    )
  }, [destination, effective, field.optionValues, field.valueType])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])
  const requestClose = useGuardedClose(hasWork, close)

  function goToMapping() {
    setFailure(null)
    // Em campo numérico, o trabalho quase todo é este. Em texto ou data, "1989-03-14" viraria
    // "1989": lá a sugestão só vem quando a pessoa pede.
    if (field.valueType === "number" && !hasWork) {
      setMapping(buildSuggestedMapping(entries, strategy))
    }
    setStep("mapping")
  }

  function suggest() {
    const suggestion = buildSuggestedMapping(entries, strategy)
    if (Object.keys(suggestion).length === 0) {
      toast.info(t("content.customFields.values.noSuggestions"))
      return
    }
    setMapping((current) => ({ ...current, ...suggestion }))
  }

  const changeMapping = useCallback((from: string, to: string) => {
    setMapping((current) => ({ ...current, [from]: to }))
  }, [])

  async function goToReview() {
    setBusy(true)
    setFailure(null)
    try {
      const preview = await normalize(field.id, { mapping: effective, dryRun: true, ...range })
      setChanges(preview.changes)
      setConvertToNumber(true)
      setStep("review")
    } catch (cause) {
      setFailure(contentErrorMessage(t, cause))
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    let key: string | undefined
    if (destination === "other") {
      // O campo novo só nasce aqui: conferir a prévia não pode deixar rastro.
      key = existingTarget
        ? existingTarget.key
        : (
            await createCustomField({
              name: targetName ?? "",
              valueType: Object.values(effective).every(isNumericValue) ? "number" : "text",
            })
          ).key
    }

    const result = await normalize(field.id, {
      mapping: effective,
      dryRun: false,
      convertToNumber: canConvert && convertToNumber,
      ...(key ? { targetKey: key } : {}),
      ...range,
    })

    // O valor novo precisa existir como opção, ou a conversa fica com algo fora da lista.
    for (const value of newOptions) await addOption(field.id, value)

    return result
  }

  async function apply() {
    let updated = total
    const confirmed = await confirm({
      title: t("content.customFields.values.applyTitle", { count: total }),
      description: t(
        destination === "same"
          ? "content.customFields.values.applyDescription"
          : "content.customFields.values.applyDescriptionOther",
        { name: targetName ?? "" }
      ),
      confirmLabel: t("content.customFields.values.applyConfirm"),
      destructive: true,
      onConfirm: async () => {
        const result = await run()
        updated = result.changes.reduce((sum, change) => sum + change.count, 0)
      },
    })
    if (!confirmed) return

    toast.success(t("content.customFields.values.applied", { count: updated }))
    // Volta para os valores, já recontados: é ali que a pessoa vê o que mudou.
    setMapping({})
    setChanges([])
    setDestination("same")
    setTargetName(null)
    setSearch("")
    setStep("values")
  }

  const visibleEditable = useMemo(
    () =>
      search
        ? editable.filter(
            (entry) =>
              matchesSearch(entry.value, search) ||
              matchesSearch(mapping[entry.value] ?? "", search)
          )
        : editable,
    [editable, mapping, search]
  )

  const optionsListId = useId()
  const targetIncomplete = destination === "other" && !targetKey

  const conversations = (count: number) =>
    t("content.customFields.values.conversations", {
      count,
      formatted: formatNumber(count, language),
    })

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="lg"
      title={field.name}
      description={t(`content.customFields.values.subtitle.${step}`)}
      footer={
        step === "values" ? (
          <>
            <Button type="button" variant="outline" onClick={close} className="pointer-coarse:h-10">
              {t("content.common.close")}
            </Button>
            <Button
              type="button"
              disabled={editable.length === 0}
              onClick={goToMapping}
              className="pointer-coarse:h-10"
            >
              {t("content.customFields.values.startNormalize")}
            </Button>
          </>
        ) : step === "mapping" ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setStep("values")}
              className="pointer-coarse:h-10"
            >
              {t("content.common.back")}
            </Button>
            <Button
              type="button"
              disabled={!hasWork}
              aria-busy={busy}
              onClick={() => {
                if (!busy) void goToReview()
              }}
              className={cn("pointer-coarse:h-10", busy && "pointer-events-none opacity-80")}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t("content.customFields.values.reviewAction")}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("mapping")}
              className="pointer-coarse:h-10"
            >
              {t("content.common.back")}
            </Button>
            <Button
              type="button"
              disabled={total === 0 || targetIncomplete}
              onClick={() => void apply()}
              className="pointer-coarse:h-10"
            >
              {t("content.customFields.values.applyAction", {
                count: total,
                formatted: formatNumber(total, language),
              })}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <StepIndicator current={step} />

        {failure ? (
          <Callout tone="danger" icon={<AlertTriangle />} role="alert">
            {failure}
          </Callout>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} {...preset.fade} className="flex flex-col gap-4">
            {step === "values" ? (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FieldTypeIcon type={field.valueType} className="size-3.5" />
                  <span>{t(`content.customFields.types.${field.valueType}`)}</span>
                  <span aria-hidden>·</span>
                  <code className="min-w-0 truncate font-mono">{field.key}</code>
                </div>

                <DateRangePicker
                  label={t("content.customFields.values.period")}
                  placeholder={t("content.customFields.values.periodPlaceholder")}
                  value={period}
                  onChange={setPeriod}
                />

                {error && !values ? (
                  <ErrorState error={error} onRetry={reload} />
                ) : isLoading && !values ? (
                  <ListSkeleton rows={6} twoLines={false} />
                ) : filled.length === 0 ? (
                  <EmptyState
                    title={t(
                      period
                        ? "content.customFields.values.emptyPeriod.title"
                        : "content.customFields.values.empty.title"
                    )}
                    description={t(
                      period
                        ? "content.customFields.values.emptyPeriod.description"
                        : "content.customFields.values.empty.description"
                    )}
                    action={
                      period
                        ? {
                            label: t("content.customFields.values.clearPeriod"),
                            onClick: () => setPeriod(null),
                          }
                        : undefined
                    }
                  />
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                      {t("content.customFields.values.summary", {
                        count: filled.length,
                        formatted: formatNumber(filled.length, language),
                        conversations: conversations(filledTotal),
                      })}
                      {withoutValue > 0
                        ? ` ${t("content.customFields.values.withoutValue", {
                            count: withoutValue,
                            formatted: formatNumber(withoutValue, language),
                          })}`
                        : null}
                    </p>

                    {truncated ? (
                      <Callout tone="warning" icon={<AlertTriangle />}>
                        {t("content.customFields.values.truncated")}
                      </Callout>
                    ) : null}

                    <ul className={cn("flex flex-col gap-0.5", isValidating && "opacity-70")}>
                      {filled.map((entry, index) => (
                        <ValueRow
                          key={index}
                          entry={entry}
                          share={maxCount > 0 ? entry.count / maxCount : 0}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : null}

            {step === "mapping" ? (
              <>
                <p className="text-sm text-pretty text-muted-foreground">
                  {t("content.customFields.values.mappingIntro")}
                </p>

                <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
                  <p className="text-sm font-medium">
                    {t("content.customFields.values.suggestTitle")}
                  </p>
                  <p className="text-xs text-pretty text-muted-foreground">
                    {t("content.customFields.values.suggestHint")}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <SelectInput
                      aria-label={t("content.customFields.fields.strategy")}
                      options={NORMALIZATION_STRATEGIES.map((value) => ({
                        value,
                        label: t(`content.customFields.strategies.${value}`),
                      }))}
                      value={strategy}
                      onChange={(next) => setStrategy((next as NormalizationStrategy) ?? "min")}
                      className="sm:w-56"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={suggest}
                      className="pointer-coarse:h-10"
                    >
                      <Sparkles />
                      {t("content.customFields.values.suggestAction")}
                    </Button>
                  </div>
                </div>

                {editable.length > SEARCH_THRESHOLD ? (
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    debounce={0}
                    shortcut={false}
                    placeholder={t("content.customFields.values.searchValues")}
                  />
                ) : null}

                {field.valueType === "list" ? (
                  <datalist id={optionsListId}>
                    {field.optionValues.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                ) : null}

                {visibleEditable.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("content.picker.noMatch")}
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {visibleEditable.map((entry) => (
                      <MappingRow
                        key={entry.value}
                        from={entry.value}
                        count={entry.count}
                        to={mapping[entry.value] ?? ""}
                        listId={field.valueType === "list" ? optionsListId : undefined}
                        onChange={changeMapping}
                      />
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            {step === "review" ? (
              <>
                {total > 0 ? (
                  <Callout tone="warning" icon={<AlertTriangle />}>
                    {t("content.customFields.values.reviewWarning", {
                      count: total,
                      formatted: formatNumber(total, language),
                    })}
                  </Callout>
                ) : (
                  <Callout icon={<AlertTriangle />}>
                    {t("content.customFields.values.reviewNothing")}
                  </Callout>
                )}

                {shownChanges.length > 0 ? (
                  <ul className="flex flex-col divide-y">
                    {shownChanges.map((change) => (
                      <li
                        key={change.from}
                        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-sm"
                      >
                        <span className="min-w-0 wrap-anywhere text-muted-foreground line-through">
                          {change.from}
                        </span>
                        <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 wrap-anywhere font-medium">{change.to}</span>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {conversations(change.count)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">
                    {t("content.customFields.values.destination")}
                  </legend>
                  <RadioGroup
                    value={destination}
                    onValueChange={(next) => setDestination(next as "same" | "other")}
                    className="gap-1"
                  >
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md py-1.5 pointer-coarse:min-h-10">
                      <RadioGroupItem value="same" className="mt-px border-muted-foreground/40" />
                      <span className="min-w-0 text-sm leading-snug">
                        {t("content.customFields.values.destinationSame")}
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md py-1.5 pointer-coarse:min-h-10">
                      <RadioGroupItem value="other" className="mt-px border-muted-foreground/40" />
                      <span className="min-w-0 text-sm leading-snug">
                        {t("content.customFields.values.destinationOther")}
                      </span>
                    </label>
                  </RadioGroup>
                </fieldset>

                {destination === "other" ? (
                  <Field
                    label={t("content.customFields.values.targetField")}
                    hint={
                      targetKey
                        ? t(
                            existingTarget
                              ? "content.customFields.values.targetExisting"
                              : "content.customFields.values.targetNew",
                            { key: targetKey }
                          )
                        : t("content.customFields.values.targetHint")
                    }
                  >
                    {(controlProps) => (
                      <CreatableSelect
                        {...controlProps}
                        options={targetFields.map((other) => other.name)}
                        value={targetName}
                        onChange={setTargetName}
                        // Só escolhe o nome: o campo nasce ao aplicar, não ao conferir.
                        onCreate={async () => {}}
                        placeholder={t("content.customFields.values.targetPlaceholder")}
                      />
                    )}
                  </Field>
                ) : null}

                {canConvert ? (
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug pointer-coarse:min-h-10">
                    <Checkbox
                      checked={convertToNumber}
                      onCheckedChange={(checked) => setConvertToNumber(Boolean(checked))}
                      className="mt-px"
                    />
                    <span className="min-w-0">
                      {t("content.customFields.values.convertToNumber")}
                    </span>
                  </label>
                ) : null}

                {newOptions.length > 0 ? (
                  <Callout>
                    {t("content.customFields.values.newOptions", {
                      count: newOptions.length,
                      names: new Intl.ListFormat(language, { type: "conjunction" }).format(
                        newOptions
                      ),
                    })}
                  </Callout>
                ) : null}
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </SidePanel>
  )
}

function StepIndicator({ current }: { current: Step }) {
  const { t } = useTranslation()
  const currentIndex = STEPS.indexOf(current)

  return (
    <ol className="flex items-center gap-1.5 text-xs" aria-label={t("content.customFields.values.stepsLabel")}>
      {STEPS.map((step, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5",
              active ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {index > 0 ? <span aria-hidden className="h-px w-3 bg-border sm:w-6" /> : null}
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full tabular-nums",
                active ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {done ? <Check aria-hidden className="size-3" /> : index + 1}
            </span>
            {t(`content.customFields.values.steps.${step}`)}
          </li>
        )
      })}
    </ol>
  )
}

function ValueRow({ entry, share }: { entry: DistinctFieldValue; share: number }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const system = !entry.editable
  const blank = typeof entry.value === "string" && entry.value.trim() === ""

  return (
    <li className="relative flex min-h-9 items-center gap-3 overflow-hidden rounded-md px-2 py-1.5 text-sm">
      {/* A barra é o tamanho de cada valor perto dos outros: serve para bater o olho. */}
      <span
        aria-hidden
        style={{ transform: `scaleX(${Math.max(share, 0.01)})` }}
        className="absolute inset-0 origin-left rounded-md bg-muted"
      />
      <span
        className={cn(
          "relative min-w-0 flex-1 truncate",
          (system || blank) && "text-muted-foreground italic"
        )}
      >
        {system
          ? t("content.customFields.values.systemValue")
          : blank
            ? t("content.customFields.values.blankValue")
            : String(entry.value)}
      </span>
      <span className="relative shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatNumber(entry.count, language)}
      </span>
    </li>
  )
}

// Até 500 linhas: digitar numa não pode redesenhar as outras.
const MappingRow = memo(function MappingRow({
  from,
  count,
  to,
  listId,
  onChange,
}: {
  from: string
  count: number
  to: string
  listId?: string
  onChange: (from: string, to: string) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <li className="grid gap-1.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3">
      <div className="min-w-0">
        <p className="wrap-anywhere text-sm">{from}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {t("content.customFields.values.conversations", {
            count,
            formatted: formatNumber(count, language),
          })}
        </p>
      </div>
      <ArrowRight aria-hidden className="hidden size-3.5 text-muted-foreground sm:block" />
      <Input
        value={to}
        list={listId}
        autoComplete="off"
        onChange={(event) => onChange(from, event.target.value)}
        aria-label={t("content.customFields.values.newValueFor", { value: from })}
        placeholder={t("content.customFields.values.keep")}
      />
    </li>
  )
})
