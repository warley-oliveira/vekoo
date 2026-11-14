import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { Images, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { ContentCard, mergeContents } from "@/components/contents/content-card"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { PieceGridSkeleton } from "@/components/pieces/piece-skeletons"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useCarousels } from "@/hooks/use-carousels"
import { useEngines } from "@/hooks/use-engines"
import { usePieceMutations, usePieces } from "@/hooks/use-pieces"
import { usePiecesLive } from "@/hooks/use-pieces-live"
import { useActiveBrand } from "@/lib/brand-context"

const ALL = "__all__"
const PERIODS = ["7", "30", "all"] as const
type Period = (typeof PERIODS)[number]
const DAY = 24 * 3_600_000

/** `/brands/:id/contents` — tudo que a marca gerou: peças e carrosséis, com filtros e atualidade. */
export function ContentsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { brandId, path } = useActiveBrand()
  const { engines } = useEngines()
  const pieces = usePieces(brandId)
  const carousels = useCarousels({ brandId })
  const { regenerate } = usePieceMutations(brandId)

  const [kind, setKind] = useState<string>(ALL)
  const [format, setFormat] = useState<string>(ALL)
  const [period, setPeriod] = useState<Period>("all")
  const [outdatedOnly, setOutdatedOnly] = useState(searchParams.get("outdated") === "1")

  usePiecesLive((event) => {
    if (event.piece.status === "ready") toast(t("pieces.live.ready", { title: event.piece.title }))
    if (event.piece.status === "failed") toast.error(t("pieces.live.failed", { title: event.piece.title }))
  })

  const kindItems = useMemo(
    () => Object.fromEntries([[ALL, t("contents.filters.allKinds")], ["carousel", t("contents.kind.carousel")], ...(engines ?? []).map((e) => [e.id, e.name])]),
    [engines, t]
  )
  const formatItems = useMemo(
    () => Object.fromEntries([[ALL, t("contents.filters.allFormats")], ["post", t("pieces.catalog.formatShort.post")], ["story", t("pieces.catalog.formatShort.story")], ["4:5", "4:5"], ["1:1", "1:1"]]),
    [t]
  )
  const periodItems = useMemo(() => Object.fromEntries(PERIODS.map((p) => [p, t(`contents.filters.period.${p}`)])), [t])

  const items = useMemo(() => {
    const all = mergeContents(pieces.pieces ?? [], carousels.carousels ?? [])
    const since = period === "all" ? 0 : Date.now() - Number(period) * DAY
    return all.filter((item) => {
      if (kind !== ALL && item.engineId !== kind) return false
      if (format !== ALL && item.format !== format) return false
      if (item.at < since) return false
      if (outdatedOnly && !(item.kind === "piece" && item.piece.outdated)) return false
      return true
    })
  }, [pieces.pieces, carousels.carousels, kind, format, period, outdatedOnly])

  const outdated = (pieces.pieces ?? []).filter((p) => p.outdated)
  const error = pieces.error ?? carousels.error
  const loading = (pieces.isLoading && !pieces.pieces) || (carousels.isLoading && !carousels.carousels)

  async function regenerateAll() {
    try {
      await Promise.all(outdated.map((p) => regenerate(p.id)))
      toast(t("contents.regenerateAllToast", { count: outdated.length }))
    } catch {
      toast.error(t("pieces.detail.regenerateFailed"))
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={kind} items={kindItems} onValueChange={(v) => setKind(v ?? ALL)}>
            <SelectTrigger size="sm" className="w-48" aria-label={t("contents.filters.kindAria")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("contents.filters.allKinds")}</SelectItem>
              <SelectItem value="carousel">{t("contents.kind.carousel")}</SelectItem>
              {(engines ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={format} items={formatItems} onValueChange={(v) => setFormat(v ?? ALL)}>
            <SelectTrigger size="sm" className="w-36" aria-label={t("contents.filters.formatAria")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(formatItems).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={period} items={periodItems} onValueChange={(v) => setPeriod((v as Period) ?? "all")}>
            <SelectTrigger size="sm" className="w-40" aria-label={t("contents.filters.periodAria")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => <SelectItem key={p} value={p}>{periodItems[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
            <Switch checked={outdatedOnly} onCheckedChange={setOutdatedOnly} />
            {t("pieces.list.outdatedOnly")}
          </Label>
        </div>
        <Button onClick={() => navigate(path("/create"))}>
          <Plus /> {t("pieces.list.newPiece")}
        </Button>
      </div>

      {outdated.length > 0 && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <RefreshCw className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1">{t("pieces.list.outdatedCount", { count: outdated.length })}</span>
          {!outdatedOnly && <Button variant="outline" size="sm" onClick={() => setOutdatedOnly(true)}>{t("pieces.list.outdatedOnly")}</Button>}
          <Button size="sm" onClick={() => void regenerateAll()}>{t("contents.regenerateAll")}</Button>
        </p>
      )}

      {error && !pieces.pieces && !carousels.carousels ? (
        <ErrorState error={error} onRetry={() => { pieces.reload(); carousels.reload() }} />
      ) : loading ? (
        <PieceGridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Images className="size-6" />}
          title={t("contents.emptyTitle")}
          description={t("contents.emptyDescription")}
          action={{ label: t("pieces.list.newPiece"), onClick: () => navigate(path("/create")) }}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => <li key={item.key}><ContentCard item={item} /></li>)}
        </ul>
      )}
    </div>
  )
}
