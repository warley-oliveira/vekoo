import { useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Images, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { PieceCard } from "@/components/pieces/piece-card"
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
import { useEngines } from "@/hooks/use-engines"
import { usePieces } from "@/hooks/use-pieces"
import { usePiecesLive } from "@/hooks/use-pieces-live"

const ALL = "__all__"

/** `/pieces` — a galeria das peças geradas, com filtro por tipo e "só desatualizadas". */
export function PiecesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { engines } = useEngines()
  const [engine, setEngine] = useState<string>(ALL)
  const [staleOnly, setStaleOnly] = useState(false)
  const { pieces, isLoading, error, reload } = usePieces({ engine: engine === ALL ? undefined : engine, stale: staleOnly })

  usePiecesLive((event) => {
    if (event.piece.status === "ready") toast(t("pieces.live.ready", { title: event.piece.title }))
    if (event.piece.status === "failed") toast.error(t("pieces.live.failed", { title: event.piece.title }))
  })

  const engineItems = useMemo(
    () => Object.fromEntries([[ALL, t("pieces.list.allEngines")], ...(engines ?? []).map((e) => [e.id, e.name])]),
    [engines, t]
  )
  const staleCount = pieces?.filter((p) => p.stale).length ?? 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={engine} items={engineItems} onValueChange={(v) => setEngine(v ?? ALL)}>
            <SelectTrigger size="sm" className="w-52" aria-label={t("pieces.list.engineFilterAria")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("pieces.list.allEngines")}</SelectItem>
              {(engines ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
            <Switch checked={staleOnly} onCheckedChange={setStaleOnly} />
            {t("pieces.list.staleOnly")}
          </Label>
        </div>
        <Button onClick={() => navigate("/pieces/new")}>
          <Plus /> {t("pieces.list.newPiece")}
        </Button>
      </div>

      {!staleOnly && staleCount > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <RefreshCw className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="flex-1">{t("pieces.list.staleCount", { count: staleCount })}</span>
          <Button variant="outline" size="sm" onClick={() => setStaleOnly(true)}>{t("pieces.list.staleOnly")}</Button>
        </p>
      )}

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : isLoading || !pieces ? (
        <PieceGridSkeleton />
      ) : pieces.length === 0 ? (
        <EmptyState
          icon={<Images className="size-6" />}
          title={t("pieces.list.emptyTitle")}
          description={t("pieces.list.emptyDescription")}
          action={{ label: t("pieces.list.newPiece"), onClick: () => navigate("/pieces/new") }}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pieces.map((piece) => (
            <li key={piece.id}><PieceCard piece={piece} /></li>
          ))}
        </ul>
      )}
    </div>
  )
}
