import { useMemo } from "react"
import { Link, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { ArrowRight, Images, Layers, Palette, RefreshCw, Sparkles, SquarePen } from "lucide-react"

import { useShell } from "@/components/app-shell"
import { BrandCard } from "@/components/brand/brand-card"
import { BrandNudge } from "@/components/brand/brand-nudge"
import { ContentCard, mergeContents } from "@/components/contents/content-card"
import { ErrorState } from "@/components/error-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandCore } from "@/hooks/use-brand-core"
import { useCarousels } from "@/hooks/use-carousels"
import { useOrphans } from "@/hooks/use-orphans"
import { usePieces } from "@/hooks/use-pieces"
import { usePiecesLive } from "@/hooks/use-pieces-live"
import { useActiveBrand } from "@/lib/brand-context"

/** `/brands/:id` — o início da marca: criar, o que saiu por último e o estado da marca. */
export function BrandDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { brandId, path } = useActiveBrand()
  const { openCreate } = useShell()
  const { brandCore, error, reload } = useBrandCore(brandId)
  const pieces = usePieces(brandId)
  const carousels = useCarousels({ brandId })
  const { orphans } = useOrphans()
  usePiecesLive()

  const recent = useMemo(
    () => mergeContents(pieces.pieces ?? [], carousels.carousels ?? []).slice(0, 8),
    [pieces.pieces, carousels.carousels]
  )
  const outdatedCount = pieces.pieces?.filter((p) => p.outdated).length ?? 0
  const orphanCount = (orphans?.counts.carousels ?? 0) + (orphans?.counts.folders ?? 0)

  if (error && !brandCore) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <BrandNudge />

      {orphanCount > 0 && (
        <aside className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1">{t("orphans.banner", { count: orphanCount })}</span>
          <Button size="sm" variant="outline" onClick={() => navigate("/migration/orphans")}>
            {t("orphans.bannerCta")}
          </Button>
        </aside>
      )}

      <section className="grid gap-3 sm:grid-cols-2" aria-label={t("dashboard.createTitle")}>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-start gap-3 rounded-xl border bg-card p-5 text-left outline-none transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="block font-heading text-lg font-semibold tracking-tight">{t("dashboard.createCarousel")}</span>
            <span className="block text-sm text-muted-foreground">{t("dashboard.createCarouselHint")}</span>
          </span>
        </button>
        <Link
          to={path("/create")}
          className="flex items-start gap-3 rounded-xl border bg-card p-5 outline-none transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <SquarePen className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="block font-heading text-lg font-semibold tracking-tight">{t("dashboard.createPiece")}</span>
            <span className="block text-sm text-muted-foreground">{t("dashboard.createPieceHint")}</span>
          </span>
        </Link>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label={t("dashboard.recentTitle")}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("dashboard.recentTitle")}</h2>
            <Link to={path("/contents")} className="inline-flex items-center gap-1 rounded text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              {t("dashboard.allContents")} <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {outdatedCount > 0 && (
            <p className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <RefreshCw className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex-1">{t("pieces.list.outdatedCount", { count: outdatedCount })}</span>
              <Link to={path("/contents?outdated=1")} className="font-medium underline-offset-4 hover:underline">{t("pieces.list.outdatedOnly")}</Link>
            </p>
          )}
          {pieces.isLoading || carousels.isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-none" />)}
            </div>
          ) : recent.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("dashboard.recentEmpty")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {recent.map((item) => <li key={item.key}><ContentCard item={item} /></li>)}
            </ul>
          )}
        </section>

        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("dashboard.brandTitle")}</h2>
            <Link to={path("/settings")} className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              <Palette className="size-3.5" /> {t("dashboard.brandSettings")}
            </Link>
          </div>
          {brandCore ? (
            <BrandCard document={brandCore.document} assets={brandCore.assets} />
          ) : (
            <Skeleton className="aspect-[3/4] w-full rounded-xl" />
          )}
          <Link to={path("/contents")} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
            <Images className="size-4 text-muted-foreground" /> {t("dashboard.contentsCount", { count: (pieces.pieces?.length ?? 0) + (carousels.carousels?.length ?? 0) })}
          </Link>
        </aside>
      </div>
    </div>
  )
}
