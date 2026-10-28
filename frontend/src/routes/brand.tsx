import { useState, type ReactNode } from "react"
import { Link, Navigate, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Loader2, Palette } from "lucide-react"
import { toast } from "sonner"

import { BrandCard } from "@/components/brand/brand-card"
import { BrandOverviewSkeleton } from "@/components/brand/brand-skeletons"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { HoloBar } from "@/components/holo-bar"
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
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandCore, useBrandCoreMutations, useBrandVersions } from "@/hooks/use-brand-core"
import { useActiveBrand } from "@/lib/brand-context"
import { useBrandCoreLive } from "@/hooks/use-brand-core-live"
import { ApiError } from "@/lib/api"
import {
  BRAND_STEPS,
  sectionPercent,
  stepHref,
  type BrandCore,
  type BrandSection,
  type BrandStep,
  type BrandVersion,
} from "@/lib/brand-core"
import { onboardingHref } from "@/lib/onboarding"
import { formatDateTime, formatShortDate } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** `/brands/:id/settings` — a marca: cartão, estado, mínimo para gerar e histórico. */
export function BrandPage() {
  const { t } = useTranslation()
  const { brandId } = useActiveBrand()
  const { brandCore, isLoading, error, reload } = useBrandCore(brandId)

  useBrandCoreLive((event) => {
    const name = event.accountName ?? t("brand.overview.liveSomeone")
    if (event.event === "published") {
      toast(t("brand.overview.livePublished", { name, version: event.currentVersion }))
    } else {
      toast(t("brand.overview.liveUpdated", { name }))
    }
  })

  if (error && !brandCore) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (isLoading || !brandCore) return <BrandOverviewSkeleton />

  // Onboarding por terminar: a marca ainda não é uma marca, e a tela de
  // visão geral não tem o que mostrar.
  if (!brandCore.onboarding.done && brandCore.status === "draft") {
    return <Navigate to={onboardingHref(brandCore.id)} replace />
  }

  const started = brandCore.progress.visitedSteps.length > 0 || brandCore.completeness.percent > 10

  if (!started) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <BrandStartHero />
      </div>
    )
  }

  return <BrandOverview brandCore={brandCore} />
}

function BrandStartHero() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { brandId } = useActiveBrand()
  return (
    <EmptyState
      icon={<Palette className="size-6" />}
      title={t("brand.overview.heading")}
      description={t("brand.overview.description")}
      action={{ label: t("brand.overview.startSetup"), onClick: () => navigate(stepHref(brandId, "identity")) }}
    />
  )
}

/** A etapa do wizard que edita cada seção do documento — a mesma, com outro nome. */
const SECTION_STEP: Record<BrandSection, BrandStep> = {
  identity: "identity",
  palette: "colors",
  typography: "typography",
  styles: "styles",
  voice: "voice",
  offers: "offers",
  notes: "notes",
  assets: "assets",
}

/** Onde o item do mínimo obrigatório (`palette.accent`) se resolve no wizard. */
function requiredStep(key: string): BrandStep {
  return SECTION_STEP[key.split(".")[0] as BrandSection] ?? "identity"
}

/**
 * A visão geral da marca. A cor do cliente fica presa na prévia do cartão;
 * todo o resto é chrome da Vekoo — tinta, mono e o holográfico na barra.
 */
function BrandOverview({ brandCore }: { brandCore: BrandCore }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const { path } = useActiveBrand()
  const { publish } = useBrandCoreMutations(brandCore.id)
  const [publishing, setPublishing] = useState(false)

  const { completeness } = brandCore
  const published = brandCore.status === "published"
  const pending = published && brandCore.hasUnpublishedChanges ? Math.max(brandCore.unpublishedChangeCount, 1) : 0
  const continueStep = brandCore.progress.lastStep ?? "identity"
  const filled = BRAND_STEPS.filter((step) => sectionPercent(completeness, step) === 100).length

  async function onPublish() {
    setPublishing(true)
    try {
      const before = brandCore.currentVersion
      const result = await publish()
      if (result.currentVersion === before) toast(t("brand.overview.publishNothing"))
      else toast(t("brand.overview.publishedToast", { version: result.currentVersion }))
    } catch (error) {
      if (error instanceof ApiError && error.code === "brandIncomplete") {
        toast.error(t("brand.overview.publishIncomplete"))
      } else {
        toast.error(t("brand.overview.publishFailed"))
      }
    } finally {
      setPublishing(false)
    }
  }

  const publishButton = (label: string, variant: "default" | "outline") => (
    <Button
      size="lg"
      variant={variant}
      className={cn("h-10", variant === "outline" && "border-vk-border-strong bg-transparent")}
      onClick={() => void onPublish()}
      disabled={publishing || !completeness.minimumMet}
    >
      {publishing && <Loader2 className="animate-spin" aria-hidden />}
      {publishing ? t("brand.overview.publishing") : label}
    </Button>
  )

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="font-mono text-xs text-vk-muted">{t("brand.overview.eyebrow")}</p>
          <h1 className="mt-2 text-[34px] leading-tight font-semibold tracking-[-0.025em] break-words">
            {brandCore.document.identity.name || t("brand.card.untitled")}
          </h1>
          <MetaLine
            items={[
              published ? t("brand.overview.meta.published") : t("brand.overview.meta.draft"),
              published && t("brand.overview.meta.version", { number: brandCore.currentVersion }),
              published && brandCore.publishedAt && formatShortDate(brandCore.publishedAt, language),
              `${t("brand.overview.meta.brandcore", { filled, total: BRAND_STEPS.length })}${filled === BRAND_STEPS.length ? " ✓" : ""}`,
            ]}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {/* O motor lê sempre a última publicação: com rascunho pendente, gerar
              continua sendo o principal, e publicar vira o secundário. */}
          {pending > 0 ? (
            publishButton(t("brand.overview.actions.publishChanges", { count: pending }), "outline")
          ) : (
            <Button
              size="lg"
              variant="outline"
              className="h-10 border-vk-border-strong bg-transparent"
              onClick={() => navigate(stepHref(brandCore.id, continueStep))}
            >
              {t("brand.overview.actions.edit")}
            </Button>
          )}
          {published ? (
            <Button size="lg" className="h-10" onClick={() => navigate(path("/create"))}>
              {t("brand.overview.actions.generate")}
            </Button>
          ) : (
            publishButton(t("brand.overview.actions.publishFirst"), "default")
          )}
        </div>
      </header>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[400px_1fr]">
        <BrandCard document={brandCore.document} assets={brandCore.assets} logos={brandCore.logos} />

        <div className="min-w-0 space-y-6">
          <StatusTerminal brandCore={brandCore} filled={filled} pending={pending} />
          <SectionsCard brandCore={brandCore} filled={filled} />
          <VersionHistory brandCore={brandCore} />
        </div>
      </div>
    </div>
  )
}

/** "publicada · v2 · 5 set 2026 · brandcore 8/8 ✓" — uma linha, em mono. */
function MetaLine({ items }: { items: Array<string | false | null | undefined | 0> }) {
  const parts = items.filter((item): item is string => typeof item === "string" && item.length > 0)
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 font-mono text-xs text-vk-muted">
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden>·</span>}
          {part}
        </span>
      ))}
    </p>
  )
}

/* ---------- status: o bloco de terminal ---------- */

type LogLine = { key: string; text: string; ok: boolean; to?: string }

/**
 * O estado da marca como um log: o que já está de pé leva ✓, o que falta fica
 * sem marca, e a última linha diz o próximo passo — com link para ele.
 */
function StatusTerminal({ brandCore, filled, pending }: { brandCore: BrandCore; filled: number; pending: number }) {
  const { t } = useTranslation()
  const { path } = useActiveBrand()
  const { completeness, readyForGeneration } = brandCore
  const published = brandCore.status === "published"
  const unmet = completeness.required.filter((item) => !item.met)
  const firstOpen = BRAND_STEPS.find((step) => sectionPercent(completeness, step) < 100)

  const lines: LogLine[] = [
    published
      ? { key: "published", text: t("brand.overview.status.lines.published", { number: brandCore.currentVersion }), ok: true }
      : { key: "published", text: t("brand.overview.status.lines.notPublished"), ok: false },
    {
      key: "sections",
      text: t("brand.overview.status.lines.sections", { filled, total: BRAND_STEPS.length }),
      ok: filled === BRAND_STEPS.length,
    },
    ...unmet.map((item) => ({
      key: `missing-${item.key}`,
      text: t("brand.overview.status.lines.missing", { item: t(`brand.required.${item.key}`) }),
      ok: false,
      to: stepHref(brandCore.id, requiredStep(item.key)),
    })),
    readyForGeneration
      ? { key: "engine", text: t("brand.overview.status.lines.engineReading"), ok: true }
      : { key: "engine", text: t("brand.overview.status.lines.engineIdle"), ok: false },
    ...(pending > 0
      ? [{ key: "pending", text: t("brand.overview.status.lines.pending", { count: pending }), ok: false }]
      : []),
  ]

  // O próximo passo, do mais urgente ao mais feliz.
  const next: LogLine =
    unmet.length > 0
      ? {
          key: "next",
          text: t("brand.overview.status.next.complete", { section: t(`brand.steps.${requiredStep(unmet[0].key)}.title`) }),
          ok: false,
          to: stepHref(brandCore.id, requiredStep(unmet[0].key)),
        }
      : !published
        ? { key: "next", text: t("brand.overview.status.next.publishFirst"), ok: false }
        : pending > 0
          ? { key: "next", text: t("brand.overview.status.next.publishChanges"), ok: false }
          : readyForGeneration
            ? { key: "next", text: t("brand.overview.status.next.generate"), ok: false, to: path("/create") }
            : { key: "next", text: t("brand.overview.status.next.complete", { section: t(`brand.steps.${firstOpen ?? "identity"}.title`) }), ok: false, to: stepHref(brandCore.id, firstOpen ?? "identity") }

  const state = completeness.minimumMet ? (readyForGeneration ? "ready" : "unpublished") : "incomplete"

  return (
    <section
      className="rounded-vk bg-vk-fg px-[22px] py-5 font-mono text-[13px] leading-[1.9] text-vk-bg"
      aria-labelledby="brand-status-title"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="brand-status-title" className="text-[11px] tracking-[0.08em] text-vk-bg/55 uppercase">
          {t("brand.overview.status.label")}
        </h2>
        <span className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "size-2 rounded-full",
              state === "ready" ? "bg-vk-green shadow-[0_0_0_3px_var(--vk-green-glow)]" : "bg-vk-bg/35"
            )}
            aria-hidden
          />
          <span className={state === "ready" ? undefined : "text-vk-bg/55"}>{t(`brand.overview.status.state.${state}`)}</span>
        </span>
      </div>
      <ul className="mt-2">
        {lines.map((line) => (
          <LogRow key={line.key} line={line} mark={line.ok ? "✓" : null} />
        ))}
        <LogRow line={next} mark="→" next />
      </ul>
    </section>
  )
}

function LogRow({ line, mark, next }: { line: LogLine; mark: string | null; next?: boolean }) {
  const content: ReactNode = (
    <>
      <span className={cn("min-w-0", !line.ok && !next && "text-vk-bg/70")}>{line.text}</span>
      {mark && (
        <span className={cn("shrink-0", line.ok ? "text-vk-term-ok" : "text-vk-bg")} aria-hidden>
          {mark}
        </span>
      )}
    </>
  )
  return (
    <li>
      {line.to ? (
        <Link
          to={line.to}
          className="-mx-1.5 flex items-baseline justify-between gap-4 rounded px-1.5 outline-none hover:bg-vk-bg/8 focus-visible:ring-2 focus-visible:ring-vk-bg/40"
        >
          {content}
        </Link>
      ) : (
        <div className="flex items-baseline justify-between gap-4">{content}</div>
      )}
    </li>
  )
}

/* ---------- seções ---------- */

function SectionsCard({ brandCore, filled }: { brandCore: BrandCore; filled: number }) {
  const { t } = useTranslation()
  const { completeness } = brandCore

  return (
    <section className="rounded-vk border border-vk-border bg-vk-surface p-5" aria-labelledby="brand-sections-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="brand-sections-title" className="text-[15px] font-semibold">
          {t("brand.overview.sections")}
        </h2>
        <span className="font-mono text-xs text-vk-muted tabular-nums">
          {t("brand.overview.sectionsSummary", { filled, total: BRAND_STEPS.length, percent: completeness.percent })}
        </span>
      </div>
      <HoloBar value={completeness.percent / 100} className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-vk-track" />

      <ol className="mt-3 grid gap-x-8 sm:grid-cols-2">
        {BRAND_STEPS.map((step, index) => {
          const percent = sectionPercent(completeness, step)
          const done = percent === 100
          return (
            <li key={step} className="border-b border-vk-border">
              <Link
                to={stepHref(brandCore.id, step)}
                className="-mx-2 flex h-11 items-center justify-between gap-3 rounded-md px-2 outline-none transition-colors hover:bg-vk-faint focus-visible:ring-2 focus-visible:ring-vk-fg/30"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="font-mono text-xs text-vk-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  <span className="truncate text-sm">{t(`brand.steps.${step}.title`)}</span>
                </span>
                <span className={cn("shrink-0 font-mono text-xs tabular-nums", done ? "text-vk-green" : "text-vk-muted")}>
                  {t("brand.overview.sectionPercent", { percent })} {done ? "✓" : "○"}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>

      <p className="mt-4 font-mono text-xs text-vk-muted">{t("brand.overview.sectionsFootnote")}</p>
    </section>
  )
}

/* ---------- histórico ---------- */

function VersionHistory({ brandCore }: { brandCore: BrandCore }) {
  const { t } = useTranslation()
  const published = brandCore.status === "published"
  const { versions, isLoading, error, reload } = useBrandVersions(brandCore.id, published)

  return (
    <section className="rounded-vk border border-vk-border bg-vk-surface p-5" aria-labelledby="brand-history-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="brand-history-title" className="text-[15px] font-semibold">
          {t("brand.overview.versionsTitle")}
        </h2>
        {versions && versions.length > 0 && (
          <span className="font-mono text-xs text-vk-muted tabular-nums">
            {t("brand.overview.versionCount", { count: versions.length })}
          </span>
        )}
      </div>
      {!published ? (
        <p className="mt-3 text-sm text-vk-muted">{t("brand.overview.versionsEmpty")}</p>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} className="mt-3 p-6" />
      ) : isLoading || !versions ? (
        <ul className="mt-3 space-y-2" aria-busy>
          {Array.from({ length: 2 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-14" />
            </li>
          ))}
        </ul>
      ) : versions.length === 0 ? (
        <p className="mt-3 text-sm text-vk-muted">{t("brand.overview.versionsEmpty")}</p>
      ) : (
        <ol className="mt-2 divide-y divide-vk-border">
          {versions.map((version) => (
            <VersionRow
              key={version.id}
              brandId={brandCore.id}
              version={version}
              current={version.number === brandCore.currentVersion}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

function VersionRow({ brandId, version, current }: { brandId: string; version: BrandVersion; current: boolean }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { restoreVersion } = useBrandCoreMutations(brandId)
  const [diffOpen, setDiffOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const sections = version.changedSections.map((section) => t(`brand.steps.${SECTION_STEP[section]}.title`)).join(", ")

  async function restore() {
    setRestoring(true)
    try {
      await restoreVersion(version.id)
      toast(t("brand.overview.restored", { number: version.number }))
      setConfirmOpen(false)
    } catch {
      toast.error(t("brand.overview.restoreFailed"))
    } finally {
      setRestoring(false)
    }
  }

  const action = current ? (
    version.changes.length > 0 && (
      <button type="button" className={LINK} onClick={() => setDiffOpen(true)}>
        {t("brand.overview.viewDiff")}
      </button>
    )
  ) : (
    <button type="button" className={LINK} onClick={() => setConfirmOpen(true)}>
      {t("brand.overview.restore")}
    </button>
  )

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-none tabular-nums",
            current ? "bg-vk-fg text-vk-bg" : "border border-vk-border-strong"
          )}
        >
          {t("brand.overview.meta.version", { number: version.number })}
        </span>
        <div className="min-w-0">
          <p className="text-sm">
            {version.account
              ? t("brand.overview.publishedBy", { name: version.account.name })
              : t("brand.overview.publishedByUnknown")}
          </p>
          <p className="truncate font-mono text-xs text-vk-muted">
            {version.changes.length === 0 ? (
              t("brand.overview.versionInitial")
            ) : (
              <>
                {t("brand.overview.changeCount", { count: version.changes.length })} ·{" "}
                <span className="lowercase">{sections}</span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 font-mono text-xs">
        <time
          className="text-vk-muted"
          dateTime={new Date(version.createdAt).toISOString()}
          title={formatDateTime(version.createdAt, language)}
        >
          {formatShortDate(version.createdAt, language)}
        </time>
        {action}
      </div>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("brand.overview.diffTitle", { number: version.number })}</DialogTitle>
            <DialogDescription>{t("brand.overview.changeCount", { count: version.changes.length })}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-80 divide-y divide-vk-border overflow-y-auto">
            {version.changes.map((change, index) => (
              <li key={`${change.path}-${index}`} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block">{t(`brand.steps.${SECTION_STEP[change.section]}.title`)}</span>
                  <span className="block truncate font-mono text-xs text-vk-muted">{change.path}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-vk-muted">{t(`brand.overview.diffKind.${change.kind}`)}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("brand.overview.restoreTitle", { number: version.number })}</AlertDialogTitle>
            <AlertDialogDescription>{t("brand.overview.restoreBody", { number: version.number })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restore()} disabled={restoring}>
              {restoring && <Loader2 className="animate-spin" aria-hidden />}
              {t("brand.overview.restoreConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

/** O link mono sublinhado do histórico ("ver diff", "restaurar"). */
const LINK =
  "rounded-sm text-vk-fg underline underline-offset-4 decoration-vk-border-strong outline-none transition-colors hover:decoration-vk-fg focus-visible:ring-2 focus-visible:ring-vk-fg/30"
