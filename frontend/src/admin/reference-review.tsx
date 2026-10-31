import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, type FieldPath } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertTriangle, ArrowLeft, ExternalLink, LoaderCircle, Plus, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"

import {
  publishReference,
  rejectReference,
  reopenReference,
  retryReference,
  updateReference,
  useReferenceCard,
  type ReferenceAnalysis,
  type ReferenceCard,
  type ReferenceFinding,
} from "@/admin/api"
import { ReferenceStatusBadge } from "@/admin/components/status-badge"
import { ReferenceThumbnail } from "@/admin/components/reference-thumbnail"
import { TaxonomySelect } from "@/admin/components/taxonomy-select"
import { TermsInput } from "@/admin/components/terms-input"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { Field } from "@/components/form-field"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useApi } from "@/hooks/use-api"
import { ApiError } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import {
  ARCHETYPES,
  HOOK_TYPES,
  NICHES,
  OBJECTIVES,
  PIECE_FORMAT_REFERENCE,
  POST_REQUIREMENTS,
  REFERENCE_FORMATS,
  REFERENCE_SIZES,
  REPLICABILITY,
  TARGET_METRICS,
  type Archetype,
  type Niche,
  type Objective,
  type PostRequirement,
  type ReferenceFormat,
  type ReferenceSize,
  type Replicability,
  type TargetMetric,
} from "@/lib/taxonomy"
import { cn } from "@/lib/utils"

// A revisão de uma referência: o que a análise disse, editável campo a campo,
// e a decisão (aprovar, rejeitar). Os erros do servidor chegam no caminho do
// campo (`analysis.hook.type`) — o mesmo nome do formulário, e é ali que
// aparecem.

type Values = {
  niche: Niche | null
  size: ReferenceSize | null
  archetypes: Archetype[]
  objective: Objective | null
  format: ReferenceFormat | null
  suggestedLayoutId: string | null
  bannedTerms: string[]
  analysis: ReferenceAnalysis
}

type LayoutsResponse = { layouts: { id: string; name: string; formats: string[] }[] }

// Os limites do servidor (`ReferenceCard::Analysis`).
const SHORT = 160
const SENTENCE = 200
const TEXT = 280
const PARAGRAPH = 600
const MAX_BEATS = 10
const MAX_ARCHETYPES = 3
const MAX_TARGET_METRICS = 2

/** Múltipla escolha em que a ordem importa: o terceiro clique troca o último. */
function nextOrdered<T>(current: T[], pressed: T[], max: number): T[] {
  const kept = current.filter((value) => pressed.includes(value))
  const added = pressed.filter((value) => !current.includes(value))
  const next = [...kept, ...added]
  return next.length > max ? [...next.slice(0, max - 1), next[next.length - 1]] : next
}

function toValues(card: ReferenceCard): Values {
  return {
    niche: card.niche,
    size: card.size,
    archetypes: card.archetypes,
    objective: card.objective,
    format: card.format,
    suggestedLayoutId: card.suggestedLayoutId,
    bannedTerms: card.source.bannedTerms ?? [],
    analysis: card.analysis,
  }
}

function fieldId(path: string) {
  return `review-${path.replace(/\./g, "-")}`
}

export function ReferenceReviewPage() {
  const { t } = useTranslation()
  const { referenceId } = useParams()
  const { data: card, error, isLoading, mutate } = useReferenceCard(referenceId)

  if (isLoading && !card) return <ReviewSkeleton />
  if (error && !card) {
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState title={t("admin.review.notFound.title")} description={t("admin.review.notFound.description")} />
    }
    return <ErrorState error={error} onRetry={() => void mutate()} />
  }
  if (!card) return null

  return <Review key={`${card.id}-${card.analysisStatus}`} card={card} onChange={(next) => void mutate(next, { revalidate: false })} />
}

function Review({ card, onChange }: { card: ReferenceCard; onChange: (card: ReferenceCard) => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const reduceMotion = useReducedMotion()
  const { data: layouts } = useApi<LayoutsResponse>("/layouts")
  const form = useForm<Values>({ defaultValues: toValues(card) })
  const { control, register, handleSubmit, reset, setError, watch, formState } = form
  const [busy, setBusy] = useState<null | "save" | "publish" | "reject" | "reopen" | "retry">(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")

  const analyzing = card.analysisStatus === "pending" || card.analysisStatus === "running"
  const readOnly = analyzing || card.status === "archived"
  const dirty = formState.isDirty

  // Fechar a aba com alteração não salva pergunta antes.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const format = watch("format")
  const layoutOptions = useMemo(() => {
    const all = layouts?.layouts ?? []
    if (!format) return all
    return all.filter((layout) => layout.formats.some((piece) => PIECE_FORMAT_REFERENCE[piece as keyof typeof PIECE_FORMAT_REFERENCE] === format))
  }, [layouts, format])

  const metrics = watch("analysis.metrics")
  const relative =
    metrics.likes !== null && metrics.comments !== null && metrics.baselineMedian
      ? Math.round(((Number(metrics.likes) + Number(metrics.comments)) / Number(metrics.baselineMedian)) * 100) / 100
      : null

  const applyServerErrors = (error: unknown) => {
    if (!(error instanceof ApiError)) return toast.error(t("admin.errors.generic"))
    if (error.details) {
      for (const [path, messages] of Object.entries(error.details)) {
        setError(path as FieldPath<Values>, { message: messages[0] })
      }
      const first = Object.keys(error.details)[0]
      document.getElementById(fieldId(first))?.focus()
    }
    toast.error(error.serverMessage ?? t("admin.errors.generic"))
  }

  const payload = (values: Values) => ({
    niche: values.niche,
    size: values.size,
    archetypes: values.archetypes,
    objective: values.objective,
    format: values.format,
    suggestedLayoutId: values.suggestedLayoutId,
    analysis: values.analysis,
    source: { bannedTerms: values.bannedTerms },
  })

  const save = handleSubmit(async (values) => {
    setBusy("save")
    try {
      const next = await updateReference(card.id, payload(values))
      reset(toValues(next))
      onChange(next)
      toast.success(t("admin.review.saved"))
    } catch (error) {
      applyServerErrors(error)
    } finally {
      setBusy(null)
    }
  })

  // Aprovar salva antes o que estiver pendente: são dois cliques a menos e
  // nenhuma chance de publicar a versão velha.
  const publish = handleSubmit(async (values) => {
    setBusy("publish")
    try {
      if (dirty) reset(toValues(await updateReference(card.id, payload(values))))
      const next = await publishReference(card.id)
      reset(toValues(next))
      onChange(next)
      toast.success(t("admin.review.published"))
    } catch (error) {
      applyServerErrors(error)
    } finally {
      setBusy(null)
    }
  })

  const act = async (kind: "reject" | "reopen" | "retry") => {
    setBusy(kind)
    try {
      const next =
        kind === "reject" ? await rejectReference(card.id, reason) : kind === "reopen" ? await reopenReference(card.id) : await retryReference(card.id)
      onChange(next)
      setRejecting(false)
      setReason("")
      toast.success(t(`admin.review.${kind === "reject" ? "rejected" : kind === "reopen" ? "reopened" : "retrying"}`))
    } catch (error) {
      applyServerErrors(error)
    } finally {
      setBusy(null)
    }
  }

  const title =
    [card.hookType && t(`admin.taxonomy.hookTypes.${card.hookType}`), card.format && t(`admin.taxonomy.formats.${card.format}`)]
      .filter(Boolean)
      .join(" · ") || t("admin.list.untitled")

  const errorFor = (path: FieldPath<Values>) => {
    const parts = path.split(".")
    let node: unknown = formState.errors
    for (const part of parts) node = (node as Record<string, unknown> | undefined)?.[part]
    return (node as { message?: string } | undefined)?.message
  }

  const textField = (path: FieldPath<Values>, label: string, max: number, rows = 2, hint?: string) => (
    <Field label={label} hint={hint} error={errorFor(path)}>
      {(field) => (
        <Textarea {...field} id={fieldId(path)} rows={rows} maxLength={max} disabled={readOnly} {...register(path)} />
      )}
    </Field>
  )

  return (
    <form noValidate onSubmit={save} className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" render={<Link to="/admin/references" />}>
          <ArrowLeft aria-hidden />
          {t("admin.review.back")}
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
            <ReferenceStatusBadge status={card.status} analysis={card.analysisStatus} />
            {card.partialAnalysis && <Badge variant="outline">{t("admin.review.partialAnalysis")}</Badge>}
            <span className="font-mono text-xs text-muted-foreground">{t("admin.review.version", { version: card.version })}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {card.status === "archived" ? (
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void act("reopen")}>
                {busy === "reopen" && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
                {t("admin.review.reopen")}
              </Button>
            ) : (
              !analyzing && (
                <>
                  <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => setRejecting(true)}>
                    {t("admin.review.reject")}
                  </Button>
                  <Button type="submit" variant="outline" disabled={busy !== null || !dirty}>
                    {busy === "save" && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
                    {t("admin.review.save")}
                  </Button>
                  {card.analysisStatus === "done" && (
                    <Button type="button" disabled={busy !== null || (card.status === "published" && !dirty)} onClick={() => void publish()}>
                      {busy === "publish" && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
                      {card.status === "published" ? t("admin.review.republish") : t("admin.review.publish")}
                    </Button>
                  )}
                </>
              )
            )}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {analyzing && (
          <Banner key="analyzing" reduceMotion={reduceMotion} tone="muted">
            <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
            <div>
              <p className="font-medium">{t("admin.review.analyzing.title")}</p>
              <p className="text-muted-foreground">{t("admin.review.analyzing.description")}</p>
            </div>
          </Banner>
        )}
        {card.analysisStatus === "failed" && (
          <Banner key="failed" reduceMotion={reduceMotion} tone="destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="font-medium">{t("admin.review.failed.title")}</p>
              <p className="text-muted-foreground">{t(`admin.review.failed.${card.analysisError?.code ?? "failed"}`, { defaultValue: t("admin.review.failed.failed") })}</p>
            </div>
            {(card.originalsCount > 0 || card.instagram) && (
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void act("retry")}>
                <RotateCcw aria-hidden />
                {t("admin.review.retry")}
              </Button>
            )}
          </Banner>
        )}
        {card.status === "archived" && (
          <Banner key="archived" reduceMotion={reduceMotion} tone="muted">
            <div>
              <p className="font-medium">{t("admin.review.archived.title")}</p>
              {card.archivedReason && <p className="text-muted-foreground">{card.archivedReason}</p>}
            </div>
          </Banner>
        )}
      </AnimatePresence>

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <ReferenceThumbnail id={card.id} available={card.hasThumbnail} alt={t("admin.review.thumbnailAlt")} className="w-full max-w-72" />
          <Findings findings={card.findings} />
          <section className="space-y-3 text-sm" aria-labelledby="review-source">
            <h2 id="review-source" className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{t("admin.review.source.title")}</h2>
            {card.source.url && (
              <a href={card.source.url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 break-all text-primary hover:underline">
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                {card.source.url}
              </a>
            )}
            {card.source.channel && <p>{card.source.channel}</p>}
            <Controller
              control={control}
              name="bannedTerms"
              render={({ field }) => (
                <TermsInput label={t("admin.new.terms.label")} hint={t("admin.new.terms.hint")} value={field.value} onChange={field.onChange} />
              )}
            />
          </section>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {card.curatedBy && (
              <>
                <dt>{t("admin.review.meta.curatedBy")}</dt>
                <dd className="text-foreground">{card.curatedBy.name}</dd>
              </>
            )}
            <dt>{t("admin.review.meta.created")}</dt>
            <dd className="text-foreground">{formatDateTime(card.createdAt, language)}</dd>
            {card.analyzedAt && (
              <>
                <dt>{t("admin.review.meta.analyzed")}</dt>
                <dd className="text-foreground">{formatDateTime(card.analyzedAt, language)}</dd>
              </>
            )}
            {card.analysisModel && (
              <>
                <dt>{t("admin.review.meta.cost")}</dt>
                <dd className="text-foreground">
                  {t("admin.review.meta.costValue", { model: card.analysisModel, cost: formatNumber(card.analysisCostMicroUsd / 1_000_000, language) })}
                </dd>
              </>
            )}
            <dt>{t("admin.review.meta.embedding")}</dt>
            <dd className="text-foreground">{card.embedded ? t("admin.review.meta.embedded") : t("admin.review.meta.notEmbedded")}</dd>
          </dl>
        </aside>

        <fieldset disabled={readOnly} className="min-w-0 space-y-8">
          <Section title={t("admin.review.sections.fit")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["niche", NICHES, (code: string) => t(`taxonomy.niches.${code}`)],
                  ["size", REFERENCE_SIZES, (code: string) => t(`admin.taxonomy.sizes.${code}`)],
                  ["objective", OBJECTIVES, (code: string) => t(`admin.taxonomy.objectives.${code}`)],
                  ["format", REFERENCE_FORMATS, (code: string) => t(`admin.taxonomy.formats.${code}`)],
                ] as const
              ).map(([name, options, labelFor]) => (
                <Field key={name} label={t(`admin.review.fields.${name}`)} error={errorFor(name)}>
                  {(field) => (
                    <Controller
                      control={control}
                      name={name}
                      render={({ field: control }) => (
                        <TaxonomySelect
                          id={fieldId(name)}
                          ariaDescribedBy={field["aria-describedby"]}
                          invalid={field["aria-invalid"]}
                          value={control.value as string | null}
                          options={options as readonly string[]}
                          labelFor={labelFor}
                          onChange={control.onChange}
                          placeholder={t("admin.review.fields.choose")}
                          noneLabel={t("admin.review.fields.clear")}
                        />
                      )}
                    />
                  )}
                </Field>
              ))}
            </div>

            <Controller
              control={control}
              name="archetypes"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <span id="review-archetypes-label" className="text-sm font-medium">{t("admin.review.fields.archetypes")}</span>
                  <ToggleGroup
                    multiple
                    value={field.value}
                    onValueChange={(value) => field.onChange((value as Archetype[]).slice(0, MAX_ARCHETYPES))}
                    variant="outline"
                    size="sm"
                    className="flex-wrap"
                    aria-labelledby="review-archetypes-label"
                    id={fieldId("archetypes")}
                  >
                    {ARCHETYPES.map((code) => (
                      <ToggleGroupItem key={code} value={code} className="aria-pressed:border-primary aria-pressed:bg-primary/5">
                        {t(`taxonomy.archetypes.${code}.label`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className={cn("text-xs", errorFor("archetypes") ? "text-destructive" : "text-muted-foreground")}>
                    {errorFor("archetypes") ?? t("admin.review.fields.archetypesHint", { max: MAX_ARCHETYPES })}
                  </p>
                </div>
              )}
            />

            <Field label={t("admin.review.fields.suggestedLayout")} hint={t("admin.review.fields.suggestedLayoutHint")} error={errorFor("suggestedLayoutId")}>
              {(field) => (
                <Controller
                  control={control}
                  name="suggestedLayoutId"
                  render={({ field: control }) => (
                    <TaxonomySelect
                      id={fieldId("suggestedLayoutId")}
                      ariaDescribedBy={field["aria-describedby"]}
                      value={control.value}
                      options={layoutOptions.map((layout) => layout.id)}
                      labelFor={(id) => layoutOptions.find((layout) => layout.id === id)?.name ?? id}
                      onChange={control.onChange}
                      placeholder={t("admin.review.fields.noLayout")}
                      noneLabel={t("admin.review.fields.clear")}
                    />
                  )}
                />
              )}
            </Field>
          </Section>

          <Section title={t("admin.review.sections.hook")}>
            <Field label={t("admin.review.fields.hookType")} error={errorFor("analysis.hook.type")}>
              {(field) => (
                <Controller
                  control={control}
                  name="analysis.hook.type"
                  render={({ field: control }) => (
                    <TaxonomySelect
                      id={fieldId("analysis.hook.type")}
                      ariaDescribedBy={field["aria-describedby"]}
                      invalid={field["aria-invalid"]}
                      value={control.value}
                      options={HOOK_TYPES}
                      labelFor={(code) => t(`admin.taxonomy.hookTypes.${code}`)}
                      onChange={control.onChange}
                      placeholder={t("admin.review.fields.choose")}
                    />
                  )}
                />
              )}
            </Field>
            {textField("analysis.hook.description", t("admin.review.fields.hookDescription"), TEXT)}
          </Section>

          <Section title={t("admin.review.sections.structure")}>
            {textField("analysis.structure.summary", t("admin.review.fields.summary"), PARAGRAPH, 3)}
            <Controller
              control={control}
              name="analysis.structure.beats"
              render={({ field }) => (
                <div className="space-y-2">
                  <span className="text-sm font-medium">{t("admin.review.fields.beats")}</span>
                  <ol className="space-y-2">
                    {field.value.map((beat, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{index + 1}</span>
                        <Input
                          id={fieldId(`analysis.structure.beats.${index}`)}
                          value={beat}
                          maxLength={SHORT}
                          aria-label={t("admin.review.fields.beat", { index: index + 1 })}
                          aria-invalid={Boolean(errorFor(`analysis.structure.beats.${index}` as FieldPath<Values>))}
                          onChange={(event) => field.onChange(field.value.map((item, i) => (i === index ? event.target.value : item)))}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("admin.review.fields.removeBeat", { index: index + 1 })}
                          onClick={() => field.onChange(field.value.filter((_, i) => i !== index))}
                        >
                          <X aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ol>
                  {field.value.length < MAX_BEATS && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange([...field.value, ""])}>
                      <Plus aria-hidden />
                      {t("admin.review.fields.addBeat")}
                    </Button>
                  )}
                  {errorFor("analysis.structure.beats") && (
                    <p role="alert" className="text-xs text-destructive">{errorFor("analysis.structure.beats")}</p>
                  )}
                </div>
              )}
            />
          </Section>

          <Section title={t("admin.review.sections.visual")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("analysis.visual.composition", t("admin.review.fields.composition"), TEXT)}
              {textField("analysis.visual.color", t("admin.review.fields.color"), TEXT)}
              {textField("analysis.visual.typography", t("admin.review.fields.typography"), TEXT)}
              {textField("analysis.visual.imagery", t("admin.review.fields.imagery"), TEXT)}
            </div>
          </Section>

          <Section title={t("admin.review.sections.copy")} description={t("admin.review.sections.copyHint")}>
            {textField("analysis.copy.function", t("admin.review.fields.copyFunction"), PARAGRAPH, 3)}
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("analysis.copy.tone", t("admin.review.fields.tone"), SHORT)}
              {textField("analysis.copy.cta", t("admin.review.fields.cta"), SHORT)}
            </div>
          </Section>

          <Section title={t("admin.review.sections.why")}>
            {textField("analysis.whyItWorks.mechanism", t("admin.review.fields.mechanism"), PARAGRAPH, 3, t("admin.review.fields.mechanismHint"))}
            {textField(
              "analysis.whyItWorks.transferablePrinciple",
              t("admin.review.fields.transferablePrinciple"),
              SENTENCE,
              2,
              t("admin.review.fields.transferablePrincipleHint")
            )}
            <Controller
              control={control}
              name="analysis.whyItWorks.targetMetrics"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <span id="review-target-metrics-label" className="text-sm font-medium">{t("admin.review.fields.targetMetrics")}</span>
                  <ToggleGroup
                    multiple
                    value={field.value}
                    onValueChange={(value) => field.onChange(nextOrdered(field.value, value as TargetMetric[], MAX_TARGET_METRICS))}
                    variant="outline"
                    size="sm"
                    className="flex-wrap"
                    aria-labelledby="review-target-metrics-label"
                    id={fieldId("analysis.whyItWorks.targetMetrics")}
                  >
                    {TARGET_METRICS.map((code) => {
                      const position = field.value.indexOf(code)
                      return (
                        <ToggleGroupItem key={code} value={code} className="gap-1.5 aria-pressed:border-primary aria-pressed:bg-primary/5">
                          {position >= 0 && <span className="font-mono text-[0.7rem] text-primary">{position + 1}</span>}
                          {t(`admin.taxonomy.targetMetrics.${code}`)}
                        </ToggleGroupItem>
                      )
                    })}
                  </ToggleGroup>
                  <p className={cn("text-xs", errorFor("analysis.whyItWorks.targetMetrics") ? "text-destructive" : "text-muted-foreground")}>
                    {errorFor("analysis.whyItWorks.targetMetrics") ?? t("admin.review.fields.targetMetricsHint", { max: MAX_TARGET_METRICS })}
                  </p>
                </div>
              )}
            />
            {textField("analysis.whyItWorks.whenNotToUse", t("admin.review.fields.whenNotToUse"), SENTENCE, 2, t("admin.review.fields.whenNotToUseHint"))}
          </Section>

          <Section title={t("admin.review.sections.replicability")}>
            <Controller
              control={control}
              name="analysis.replicability.score"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <ToggleGroup
                    value={field.value === null ? [] : [String(field.value)]}
                    onValueChange={(value) => field.onChange(value[0] ? (Number(value[0]) as Replicability) : null)}
                    variant="outline"
                    className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
                    aria-label={t("admin.review.fields.replicability")}
                    id={fieldId("analysis.replicability.score")}
                  >
                    {REPLICABILITY.map((score) => (
                      <ToggleGroupItem
                        key={score}
                        value={String(score)}
                        className="h-auto w-full flex-col items-start gap-0.5 px-3 py-2 text-left whitespace-normal aria-pressed:border-primary aria-pressed:bg-primary/5"
                      >
                        <span className="font-mono text-xs">{score}</span>
                        <span className="text-xs font-normal text-muted-foreground">{t(`admin.taxonomy.replicability.${score}`)}</span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  {errorFor("analysis.replicability.score") && (
                    <p role="alert" className="text-xs text-destructive">{errorFor("analysis.replicability.score")}</p>
                  )}
                </div>
              )}
            />
            {textField("analysis.replicability.requirements", t("admin.review.fields.requirements"), TEXT)}
            <Controller
              control={control}
              name="analysis.replicability.requires"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <span id="review-requires-label" className="text-sm font-medium">{t("admin.review.fields.requires")}</span>
                  <ToggleGroup
                    multiple
                    value={field.value}
                    // Na ordem da lista, sem repetir — a mesma forma que o servidor grava.
                    onValueChange={(value) => field.onChange(POST_REQUIREMENTS.filter((code) => (value as PostRequirement[]).includes(code)))}
                    variant="outline"
                    size="sm"
                    className="flex-wrap"
                    aria-labelledby="review-requires-label"
                    id={fieldId("analysis.replicability.requires")}
                  >
                    {POST_REQUIREMENTS.map((code) => (
                      <ToggleGroupItem key={code} value={code} className="aria-pressed:border-primary aria-pressed:bg-primary/5">
                        {t(`admin.taxonomy.requires.${code}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className={cn("text-xs", errorFor("analysis.replicability.requires") ? "text-destructive" : "text-muted-foreground")}>
                    {errorFor("analysis.replicability.requires") ?? t("admin.review.fields.requiresHint")}
                  </p>
                </div>
              )}
            />
          </Section>

          <Section title={t("admin.review.sections.metrics")} description={t("admin.review.sections.metricsHint")}>
            <div className="grid gap-4 sm:grid-cols-4">
              {(["likes", "comments", "baselineMedian"] as const).map((name) => (
                <Field key={name} label={t(`admin.review.fields.${name}`)} error={errorFor(`analysis.metrics.${name}`)}>
                  {(field) => (
                    <Input
                      {...field}
                      id={fieldId(`analysis.metrics.${name}`)}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      {...register(`analysis.metrics.${name}`, { setValueAs: (value) => (value === "" || value === null ? null : Number(value)) })}
                    />
                  )}
                </Field>
              ))}
              <div className="space-y-1.5">
                <span className="text-sm font-medium">{t("admin.review.fields.relativeEngagement")}</span>
                <p className="flex h-8 items-center font-mono text-sm">
                  {relative === null ? "—" : t("admin.list.engagementValue", { value: formatNumber(relative, language) })}
                </p>
              </div>
            </div>
            <Field label={t("admin.review.fields.collectedAt")} error={errorFor("analysis.metrics.collectedAt")} className="max-w-48">
              {(field) => (
                <Input
                  {...field}
                  id={fieldId("analysis.metrics.collectedAt")}
                  type="date"
                  {...register("analysis.metrics.collectedAt", { setValueAs: (value) => value || null })}
                />
              )}
            </Field>
          </Section>
        </fieldset>
      </div>

      <AlertDialog open={rejecting} onOpenChange={setRejecting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.review.rejectDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.review.rejectDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Field label={t("admin.review.rejectDialog.reason")}>
            {(field) => (
              <Textarea {...field} autoFocus rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            )}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.review.rejectDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!reason.trim() || busy !== null}
              onClick={(event) => {
                event.preventDefault()
                void act("reject")
              }}
            >
              {busy === "reject" && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {t("admin.review.rejectDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-0.5 border-b pb-2">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Banner({
  tone,
  reduceMotion,
  children,
}: {
  tone: "muted" | "destructive"
  reduceMotion: boolean | null
  children: React.ReactNode
}) {
  return (
    <motion.div
      role="status"
      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        tone === "destructive" ? "border-destructive/30 bg-destructive/5" : "bg-muted/40"
      )}
    >
      {children}
    </motion.div>
  )
}

/** O que barra a publicação (e o que só avisa), com atalho para o campo. */
function Findings({ findings }: { findings: ReferenceFinding[] }) {
  const { t } = useTranslation()
  if (findings.length === 0) return null

  return (
    <section className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" aria-labelledby="review-findings">
      <h2 id="review-findings" className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="size-4 text-destructive" aria-hidden />
        {t("admin.review.findings.title")}
      </h2>
      <ul className="space-y-1.5">
        {findings.map((finding, index) => {
          const message =
            finding.code === "leak"
              ? t(`admin.review.findings.leak.${finding.kind}`, { match: finding.match })
              : t(`admin.review.findings.${finding.code}`)
          const path = "path" in finding ? `analysis.${finding.path}` : null
          return (
            <li key={index} className="text-xs">
              {path ? (
                <button
                  type="button"
                  className="text-left underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => document.getElementById(fieldId(path))?.focus()}
                >
                  {message}
                </button>
              ) : (
                message
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ReviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <Skeleton className="aspect-[4/5] w-full max-w-72 rounded-none" />
        <div className="space-y-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
