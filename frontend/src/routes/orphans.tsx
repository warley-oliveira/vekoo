import { useMemo, useState } from "react"
import { Link, Navigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Check, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { CardArt } from "@/components/editor/card-art"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useOrphanMutations, useOrphans } from "@/hooks/use-orphans"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"

/**
 * `/migration/orphans` — ferramenta de migração, não fluxo do produto:
 * lista os carrosséis de antes de existir marca e entrega cada um (ou
 * todos) a uma marca. Some quando zera e quando a API desliga a migração.
 */
export function OrphansPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { orphans, disabled, isLoading, error, reload } = useOrphans()
  const { assign } = useOrphanMutations()
  const [brandId, setBrandId] = useState<string | null>(null)
  const [working, setWorking] = useState<string | "all" | null>(null)

  const brandItems = useMemo(
    () => Object.fromEntries((orphans?.brands ?? []).map((b) => [b.id, b.name ?? t("brandSwitcher.untitled")])),
    [orphans, t]
  )
  const target = brandId ?? orphans?.brands[0]?.id ?? null

  if (disabled) return <Navigate to="/" replace />

  async function run(ids?: string[]) {
    if (!target) return
    setWorking(ids ? ids[0] : "all")
    try {
      const result = await assign(target, ids)
      toast(t("orphans.assignedToast", { count: result.moved ?? 0 }))
    } catch {
      toast.error(t("orphans.assignFailed"))
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <Link to="/" className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        <ArrowLeft className="size-3.5" /> {t("orphans.back")}
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">{t("orphans.title")}</h1>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t("orphans.description")}</p>

      {error ? (
        <ErrorState error={error} onRetry={reload} className="mt-6" />
      ) : isLoading || !orphans ? (
        <div className="mt-6 space-y-3" aria-busy>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : orphans.counts.carousels === 0 && orphans.counts.folders === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Check className="size-6" />} title={t("orphans.doneTitle")} description={t("orphans.doneDescription")} />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3 rounded-lg border p-4">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">{t("orphans.targetBrand")}</span>
              <Select value={target} items={brandItems} onValueChange={(v) => setBrandId(v)}>
                <SelectTrigger className="w-64" aria-label={t("orphans.targetBrand")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orphans.brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name ?? t("brandSwitcher.untitled")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("orphans.counts", { carousels: orphans.counts.carousels, folders: orphans.counts.folders })}
              </p>
            </div>
            <Button onClick={() => void run()} disabled={!target || working !== null}>
              {working === "all" ? <Loader2 className="animate-spin" /> : <Check />}
              {t("orphans.assignAll")}
            </Button>
          </div>

          <ul className="mt-4 divide-y rounded-lg border">
            {orphans.carousels.map((carousel) => (
              <li key={carousel.id} className="flex items-center gap-3 p-3">
                <div className="w-12 shrink-0 overflow-hidden border">
                  <CardArt card={carousel.cards[0]} theme={carousel.theme} format={carousel.format} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{carousel.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelative(carousel.editedAt, language)}
                    {carousel.trashedAt ? ` · ${t("orphans.inTrash")}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void run([carousel.id])} disabled={!target || working !== null}>
                  {working === carousel.id ? <Loader2 className="animate-spin" /> : null}
                  {t("orphans.assignOne")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
