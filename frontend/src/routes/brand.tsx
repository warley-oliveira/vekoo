import { useState } from "react"
import { Link, Navigate, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Check, Circle, History, Loader2, Palette, Sparkles, Upload } from "lucide-react"
import { toast } from "sonner"

import { BrandCard } from "@/components/brand/brand-card"
import { BrandOverviewSkeleton } from "@/components/brand/brand-skeletons"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandCore, useBrandCoreMutations, useBrandVersions } from "@/hooks/use-brand-core"
import { useActiveBrand } from "@/lib/brand-context"
import { useBrandCoreLive } from "@/hooks/use-brand-core-live"
import { ApiError } from "@/lib/api"
import { BRAND_STEPS, stepHref, type BrandCore, type BrandVersion } from "@/lib/brand-core"
import { onboardingHref } from "@/lib/onboarding"
import { formatDateTime, formatRelative } from "@/lib/format"
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

function BrandOverview({ brandCore }: { brandCore: BrandCore }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const { publish } = useBrandCoreMutations(brandCore.id)
  const [publishing, setPublishing] = useState(false)

  const { completeness } = brandCore
  const published = brandCore.status === "published"
  const continueStep = brandCore.progress.lastStep ?? "identity"

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {brandCore.document.identity.name || t("brand.card.untitled")}
            </h1>
            <Badge variant={published ? "secondary" : "outline"}>
              {published ? t("brand.overview.status.published") : t("brand.overview.status.draft")}
            </Badge>
            {brandCore.hasUnpublishedChanges && (
              <Badge variant="outline">{t("brand.overview.status.unpublishedChanges")}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {published && brandCore.publishedAt
              ? `${t("brand.overview.publishedAt", { when: formatRelative(brandCore.publishedAt, language) })} · ${t("brand.overview.versionLabel", { number: brandCore.currentVersion })}`
              : t("brand.overview.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(stepHref(brandCore.id, continueStep))}>
            {completeness.percent < 100 ? t("brand.overview.continueSetup") : t("brand.overview.editBrand")}
          </Button>
          <Button
            onClick={() => void onPublish()}
            disabled={publishing || !completeness.minimumMet || (published && !brandCore.hasUnpublishedChanges)}
          >
            {publishing ? <Loader2 className="animate-spin" /> : <Upload />}
            {publishing ? t("brand.overview.publishing") : t("brand.overview.publish")}
          </Button>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <BrandCard document={brandCore.document} assets={brandCore.assets} className="self-start" />

        <div className="space-y-5">
          <ReadinessCard brandCore={brandCore} />

          <section className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">{t("brand.overview.sections")}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t("brand.progress", { percent: completeness.percent })}
              </span>
            </div>
            <Progress value={completeness.percent} className="mt-2" aria-label={t("brand.progress", { percent: completeness.percent })} />
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {BRAND_STEPS.map((step) => {
                const percent = completeness.sections[step]
                return (
                  <li key={step}>
                    <Link
                      to={stepHref(brandCore.id, step)}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="flex items-center gap-2">
                        {percent === 100 ? <Check className="size-4 text-primary" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
                        {t(`brand.steps.${step}.title`)}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {t("brand.overview.sectionPercent", { percent })}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          <VersionHistory brandId={brandCore.id} published={published} />
        </div>
      </div>
    </div>
  )
}

/** Pronta ou não para gerar — e, se não, exatamente o que falta. */
function ReadinessCard({ brandCore }: { brandCore: BrandCore }) {
  const { t } = useTranslation()
  const { completeness, readyForGeneration, generationBlockers } = brandCore
  const unmet = completeness.required.filter((r) => !r.met)

  return (
    <section
      className={cn("rounded-lg border p-4", readyForGeneration ? "border-primary/40 bg-accent/40" : "bg-card")}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Sparkles className={cn("mt-0.5 size-5 shrink-0", readyForGeneration ? "text-primary" : "text-muted-foreground")} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-sm font-medium">
            {readyForGeneration ? t("brand.overview.readyTitle") : t("brand.overview.notReadyTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {readyForGeneration ? t("brand.overview.readyDescription") : t("brand.overview.notReadyDescription")}
          </p>
          {!readyForGeneration && completeness.minimumMet && (
            <ul className="text-sm text-muted-foreground">
              {generationBlockers.map((blocker) => (
                <li key={blocker}>{t(`brand.overview.blockers.${blocker}`)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {unmet.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("brand.minimumTitle")}</h3>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {completeness.required.map((item) => (
              <li key={item.key} className={cn("flex items-center gap-2 text-sm", item.met ? "text-muted-foreground" : "text-foreground")}>
                {item.met ? <Check className="size-4 text-primary" aria-hidden /> : <Circle className="size-4" aria-hidden />}
                {t(`brand.required.${item.key}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

    </section>
  )
}

function VersionHistory({ brandId, published }: { brandId: string; published: boolean }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { versions, isLoading, error, reload } = useBrandVersions(brandId, published)

  return (
    <section className="rounded-lg border p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <History className="size-4 text-muted-foreground" aria-hidden /> {t("brand.overview.versionsTitle")}
      </h2>
      {!published ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("brand.overview.versionsEmpty")}</p>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} className="mt-3 p-6" />
      ) : isLoading || !versions ? (
        <ul className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <li key={i}><Skeleton className="h-12" /></li>)}
        </ul>
      ) : versions.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("brand.overview.versionsEmpty")}</p>
      ) : (
        <ol className="mt-3 divide-y">
          {versions.map((version) => <VersionRow key={version.id} version={version} language={language} />)}
        </ol>
      )}
    </section>
  )
}

function VersionRow({ version, language }: { version: BrandVersion; language: string }) {
  const { t } = useTranslation()
  const sections = version.changedSections.map((s) => t(`brand.steps.${s === "palette" ? "colors" : s}.title`)).join(", ")
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium">
          {t("brand.overview.versionLine", { number: version.number })}{" "}
          <span className="font-normal text-muted-foreground">
            {version.account ? t("brand.overview.versionBy", { name: version.account.name }) : t("brand.overview.versionByUnknown")}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {version.changes.length === 0
            ? t("brand.overview.versionInitial")
            : `${t("brand.overview.changeCount", { count: version.changes.length })} · ${t("brand.overview.changedSections", { sections })}`}
        </p>
      </div>
      <time
        className="text-xs text-muted-foreground"
        dateTime={new Date(version.createdAt).toISOString()}
        title={formatDateTime(version.createdAt, language)}
      >
        {formatRelative(version.createdAt, language)}
      </time>
    </li>
  )
}
