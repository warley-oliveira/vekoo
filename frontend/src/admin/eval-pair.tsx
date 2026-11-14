import { useCallback, useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, Navigate, useNavigate, useParams } from "@/lib/router"
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import {
  EVAL_MAX_USABLE,
  EVAL_REASONS,
  saveEvalPair,
  useEvalPair,
  useEvalRound,
  type EvalPair,
  type EvalPiece,
  type EvalReason,
  type EvalSide,
  type EvalVerdict,
} from "@/admin/api"
import { ErrorState } from "@/components/error-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

// O teste lado a lado, às cegas: o mesmo pedido, gerado de dois jeitos, um
// em cada coluna. A tela nunca sabe que lado tem referência — a API não diz —
// e chama os lados de A e B.

const SIDES: EvalSide[] = ["left", "right"]
const USABLE = Array.from({ length: EVAL_MAX_USABLE + 1 }, (_, index) => index)

/** `/admin/evals/:round` — abre no primeiro par sem avaliação; rodada completa vai ao resultado. */
export function EvalRoundEntry() {
  const { round } = useParams()
  const { data, error, mutate } = useEvalRound(round)

  if (error && !data) return <ErrorState error={error} onRetry={() => void mutate()} />
  if (!data) return <PairSkeleton />

  const next = data.pairs.find((pair) => !pair.decided)
  if (!next) return <Navigate to={`/admin/evals/${round}/results`} replace />
  return <Navigate to={`/admin/evals/${round}/pairs/${next.id}`} replace />
}

/** `/admin/evals/:round/pairs/:pairId` — um par. */
export function EvalPairPage() {
  const { t } = useTranslation()
  const { round, pairId } = useParams()
  const { data: pair, error, mutate } = useEvalPair(pairId)

  if (error && !pair) {
    return <ErrorState error={error} onRetry={() => void mutate()} />
  }
  if (!pair) return <PairSkeleton />

  return (
    <div className="space-y-6">
      <PairHeader pair={pair} round={round ?? pair.round} />

      <section className="space-y-2 rounded-lg border p-4 sm:p-5" aria-labelledby="eval-request">
        <p id="eval-request" className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{t("admin.evals.pair.request")}</p>
        <p className="font-heading text-xl leading-snug font-semibold text-balance">“{pair.requestText}”</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{pair.brand.name}</span>
          {pair.brand.segment && <span>· {pair.brand.segment}</span>}
          {pair.brand.niche && <Badge variant="outline">{t(`taxonomy.niches.${pair.brand.niche}`)}</Badge>}
          {pair.brand.archetypes.primary && (
            <Badge variant="outline">{t(`taxonomy.archetypes.${pair.brand.archetypes.primary}.label`)}</Badge>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {SIDES.map((side) => (
          <SideColumn key={side} side={side} pieces={pair[side]} />
        ))}
      </div>

      {/* A chave reinicia o formulário a cada par. */}
      <PairForm key={pair.id} pair={pair} round={round ?? pair.round} onSaved={(saved) => void mutate(saved, { revalidate: false })} />
    </div>
  )
}

function PairHeader({ pair, round }: { pair: EvalPair; round: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" render={<Link to="/admin/evals" />}>
        <ArrowLeft aria-hidden />
        {t("admin.evals.pair.rounds")}
      </Button>
      <p className="font-mono text-xs tabular-nums text-muted-foreground">
        {t("admin.evals.pair.position", { round, position: pair.position, total: pair.total })}
      </p>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!pair.previousId}
          aria-label={t("admin.evals.pair.previous")}
          render={pair.previousId ? <Link to={`/admin/evals/${round}/pairs/${pair.previousId}`} /> : undefined}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!pair.nextId}
          aria-label={t("admin.evals.pair.next")}
          render={pair.nextId ? <Link to={`/admin/evals/${round}/pairs/${pair.nextId}`} /> : undefined}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

function SideColumn({ side, pieces }: { side: EvalSide; pieces: EvalPiece[] }) {
  const { t } = useTranslation()
  const label = t(`admin.evals.sides.${side}`)
  return (
    <section className="min-w-0 space-y-4" aria-label={t("admin.evals.pair.side", { side: label })}>
      <h2 className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-foreground font-mono text-sm font-semibold text-background">{label}</span>
        <span className="text-sm text-muted-foreground">{t("admin.evals.pair.options", { count: pieces.length })}</span>
      </h2>
      {pieces.map((piece, index) => (
        <PieceView key={piece.id} piece={piece} index={index} />
      ))}
    </section>
  )
}

function PieceView({ piece, index }: { piece: EvalPiece; index: number }) {
  const { t } = useTranslation()
  const tall = piece.format === "story"
  return (
    <article className="min-w-0 space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">
        <span className="font-mono text-xs text-muted-foreground">{index + 1}. </span>
        {piece.title}
      </p>
      {piece.rendering ? (
        <div className="flex gap-2" aria-busy aria-label={t("admin.evals.pair.rendering")}>
          <Skeleton className={cn("w-40 shrink-0 rounded-none", tall ? "aspect-[9/16]" : "aspect-[4/5]")} />
          <Skeleton className={cn("w-40 shrink-0 rounded-none", tall ? "aspect-[9/16]" : "aspect-[4/5]")} />
          <p className="self-center text-xs text-muted-foreground">{t("admin.evals.pair.rendering")}</p>
        </div>
      ) : (
        // Obra do usuário: cantos retos, como no Instagram.
        <div className="flex snap-x gap-2 overflow-x-auto pb-1">
          {piece.images.map((image) => (
            <img
              key={image.index}
              src={image.url}
              alt={t("admin.evals.pair.slide", { index: image.index })}
              loading="lazy"
              className={cn("w-40 shrink-0 snap-start border object-cover sm:w-48", tall ? "aspect-[9/16]" : "aspect-[4/5]")}
            />
          ))}
        </div>
      )}
      {piece.why && <p className="text-xs text-muted-foreground">{piece.why}</p>}
      {piece.caption && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{t("admin.evals.pair.caption")}</summary>
          <p className="mt-2 whitespace-pre-line">{piece.caption}</p>
          {piece.hashtags.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{piece.hashtags.join(" ")}</p>}
        </details>
      )}
    </article>
  )
}

function PairForm({ pair, round, onSaved }: { pair: EvalPair; round: string; onSaved: (pair: EvalPair) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const notesId = useId()
  const [verdict, setVerdict] = useState<EvalVerdict | null>(pair.verdict)
  const [usable, setUsable] = useState<Record<EvalSide, number | null>>({ left: pair.usableLeft, right: pair.usableRight })
  const [reasons, setReasons] = useState<EvalReason[]>(pair.reasons)
  const [copied, setCopied] = useState<EvalSide[]>(pair.copiedSides)
  const [notes, setNotes] = useState(pair.notes ?? "")
  const [saving, setSaving] = useState(false)

  const ready = verdict !== null && usable.left !== null && usable.right !== null

  const save = useCallback(async () => {
    if (!ready || saving || verdict === null || usable.left === null || usable.right === null) return
    setSaving(true)
    try {
      const saved = await saveEvalPair(pair.id, {
        verdict,
        usableLeft: usable.left,
        usableRight: usable.right,
        reasons,
        copiedSides: copied,
        notes,
      })
      onSaved(saved)
      toast.success(t("admin.evals.form.saved"))
      navigate(saved.nextPendingId ? `/admin/evals/${round}/pairs/${saved.nextPendingId}` : `/admin/evals/${round}/results`)
    } catch (error) {
      toast.error(error instanceof ApiError && error.serverMessage ? error.serverMessage : t("admin.errors.generic"))
    } finally {
      setSaving(false)
    }
  }, [copied, navigate, notes, onSaved, pair.id, ready, reasons, round, saving, t, usable, verdict])

  // Atalhos: A, B e E escolhem; Ctrl/⌘+Enter salva. Fora dos campos de texto.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault()
        void save()
        return
      }
      const target = event.target as HTMLElement | null
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, [contenteditable]")) return
      const choice = ({ a: "left", b: "right", e: "tie" } as const)[event.key.toLowerCase() as "a" | "b" | "e"]
      if (choice) setVerdict(choice)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save])

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      className="space-y-5 rounded-lg border p-4 sm:p-5"
      aria-label={t("admin.evals.form.label")}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("admin.evals.form.verdict")}</legend>
        <ToggleGroup
          value={verdict ? [verdict] : []}
          onValueChange={(value) => setVerdict((value[0] as EvalVerdict | undefined) ?? null)}
          variant="outline"
          className="flex-wrap"
        >
          {(["left", "tie", "right"] as const).map((value) => (
            <ToggleGroupItem key={value} value={value} className="min-w-24 aria-pressed:border-primary aria-pressed:bg-primary/5">
              {value === "tie" ? t("admin.evals.form.tie") : t("admin.evals.form.chooseSide", { side: t(`admin.evals.sides.${value}`) })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("admin.evals.form.usable")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {SIDES.map((side) => (
            <div key={side} className="flex items-center gap-3">
              <span className="w-6 font-mono text-sm font-semibold">{t(`admin.evals.sides.${side}`)}</span>
              <ToggleGroup
                value={usable[side] === null ? [] : [String(usable[side])]}
                onValueChange={(value) => setUsable((current) => ({ ...current, [side]: value[0] === undefined ? null : Number(value[0]) }))}
                variant="outline"
                size="sm"
                aria-label={t("admin.evals.form.usableSide", { side: t(`admin.evals.sides.${side}`) })}
              >
                {USABLE.map((count) => (
                  <ToggleGroupItem key={count} value={String(count)} className="w-10 font-mono aria-pressed:border-primary aria-pressed:bg-primary/5">
                    {count}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("admin.evals.form.reasons")}</legend>
        <ToggleGroup multiple value={reasons} onValueChange={(value) => setReasons(value as EvalReason[])} variant="outline" size="sm" className="flex-wrap">
          {EVAL_REASONS.map((reason) => (
            <ToggleGroupItem key={reason} value={reason} className="aria-pressed:border-primary aria-pressed:bg-primary/5">
              {t(`admin.evals.reasons.${reason}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("admin.evals.form.copied")}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {SIDES.map((side) => (
            <label key={side} className="flex min-h-10 items-center gap-2 text-sm">
              <Checkbox
                checked={copied.includes(side)}
                onCheckedChange={(checked) =>
                  setCopied((current) => (checked === true ? [...current, side] : current.filter((value) => value !== side)))
                }
              />
              {t("admin.evals.form.copiedSide", { side: t(`admin.evals.sides.${side}`) })}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor={notesId} className="text-sm font-medium">{t("admin.evals.form.notes")}</label>
        <Textarea id={notesId} rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("admin.evals.form.notesPlaceholder")} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!ready || saving}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden />}
          {t("admin.evals.form.save")}
        </Button>
        <p className="text-xs text-muted-foreground">{ready ? t("admin.evals.form.shortcuts") : t("admin.evals.form.missing")}</p>
      </div>
    </form>
  )
}

function PairSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  )
}
