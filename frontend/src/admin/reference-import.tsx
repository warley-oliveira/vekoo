import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ExternalLink, ImageOff, Info, LoaderCircle, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import {
  analyzeCandidates,
  estimateAnalysisCost,
  retryImportAccount,
  useReferenceImport,
  type ReferenceCandidate,
  type ReferenceImport,
  type ReferenceImportAccount,
} from "@/admin/api"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Um lote de importação: cada conta com o resultado e os candidatos do melhor
// para o pior (engajamento relativo à mediana da própria conta). A curadoria
// escolhe — cada post escolhido é uma análise paga —, e os escolhidos viram
// card em rascunho na mesma fila da Fase 2.

const VISIBLE_PER_ACCOUNT = 5

export function ReferenceImportPage() {
  const { t } = useTranslation()
  const { importId } = useParams()
  const { data, error, isLoading, mutate } = useReferenceImport(importId)

  if (isLoading && !data) return <ImportSkeleton />
  if (error && !data) {
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState title={t("admin.imports.batch.notFound.title")} description={t("admin.imports.batch.notFound.description")} />
    }
    return <ErrorState error={error} onRetry={() => void mutate()} />
  }
  if (!data) return null

  return <Batch batch={data} onChange={(next) => void mutate(next, { revalidate: false })} />
}

function Batch({ batch, onChange }: { batch: ReferenceImport; onChange: (batch: ReferenceImport) => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const candidates = useMemo(() => batch.accounts.flatMap((account) => account.candidates), [batch])
  const chosen = candidates.filter((candidate) => selected.has(candidate.id) && candidate.status === "pending")
  const cost = estimateAnalysisCost(chosen)

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  // Os destaques da conta que ainda não viraram card — vídeo fica de fora
  // (análise parcial: só com escolha explícita).
  const selectHighlights = (account: ReferenceImportAccount) =>
    setSelected((current) => {
      const next = new Set(current)
      account.candidates
        .filter((candidate) => candidate.highlight && !candidate.partial && candidate.status === "pending")
        .slice(0, VISIBLE_PER_ACCOUNT)
        .forEach((candidate) => next.add(candidate.id))
      return next
    })

  const analyze = async () => {
    setBusy(true)
    try {
      const result = await analyzeCandidates(batch.id, chosen.map((candidate) => candidate.id))
      onChange(result.referenceImport)
      setSelected(new Set())
      setConfirming(false)
      toast.success(t("admin.imports.batch.analyzed", { count: result.created.length }), {
        action: { label: t("admin.imports.batch.openList"), onClick: () => navigate("/admin/references?status=draft") },
      })
    } catch (error) {
      toast.error(error instanceof ApiError && error.serverMessage ? error.serverMessage : t("admin.errors.generic"))
    } finally {
      setBusy(false)
    }
  }

  const retry = async (account: ReferenceImportAccount) => {
    try {
      onChange(await retryImportAccount(batch.id, account.id))
    } catch (error) {
      toast.error(error instanceof ApiError && error.serverMessage ? error.serverMessage : t("admin.errors.generic"))
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" render={<Link to="/admin/imports" />}>
          <ArrowLeft aria-hidden />
          {t("admin.imports.batch.back")}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t("admin.imports.batch.title", { date: formatDateTime(batch.createdAt, language) })}
          </h1>
          {batch.running && (
            <Badge variant="outline" className="gap-1">
              <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
              {t("admin.imports.running")}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {[batch.niche && t(`taxonomy.niches.${batch.niche}`), batch.size && t(`admin.taxonomy.sizes.${batch.size}`)].filter(Boolean).join(" · ") ||
            t("admin.imports.batch.noHints")}
        </p>
      </div>

      {/* Aviso fixo: os números do Meta não separam o orgânico do pago. */}
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="space-y-0.5">
          <p>{t("admin.imports.batch.boostedNotice")}</p>
          <p className="text-muted-foreground">{t("admin.imports.batch.freshNotice")}</p>
        </div>
      </div>

      <div className="space-y-8">
        {batch.accounts.map((account) => (
          <AccountSection
            key={account.id}
            account={account}
            selected={selected}
            onToggle={toggle}
            onSelectHighlights={() => selectHighlights(account)}
            onRetry={() => void retry(account)}
          />
        ))}
      </div>

      <AnimatePresence>
        {chosen.length > 0 && (
          <SelectionBar count={chosen.length} cost={cost} onClear={() => setSelected(new Set())} onAnalyze={() => setConfirming(true)} />
        )}
      </AnimatePresence>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.imports.batch.confirm.title", { count: chosen.length })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.imports.batch.confirm.description", { cost: formatNumber(Math.round(cost * 100) / 100, language) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.imports.batch.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void analyze()
              }}
            >
              {busy && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {t("admin.imports.batch.confirm.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AccountSection({
  account,
  selected,
  onToggle,
  onSelectHighlights,
  onRetry,
}: {
  account: ReferenceImportAccount
  selected: Set<string>
  onToggle: (id: string, on: boolean) => void
  onSelectHighlights: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? account.candidates : account.candidates.slice(0, VISIBLE_PER_ACCOUNT)
  const hasHighlights = account.candidates.some((candidate) => candidate.highlight && !candidate.partial && candidate.status === "pending")

  return (
    <section className="space-y-3" aria-labelledby={`account-${account.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
        <div className="min-w-0">
          <h2 id={`account-${account.id}`} className="font-mono text-sm font-semibold">
            @{account.username}
          </h2>
          {account.status === "done" && (
            <p className="text-xs text-muted-foreground">
              {[
                account.name,
                account.followersCount !== null && t("admin.imports.account.followers", { count: account.followersCount, value: formatNumber(account.followersCount, language) }),
                t("admin.imports.account.posts", { fetched: account.fetchedCount ?? 0, eligible: account.eligibleCount ?? 0 }),
                account.baselineMedian !== null && t("admin.imports.account.median", { value: formatNumber(account.baselineMedian, language) }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {account.status === "done" && hasHighlights && (
          <Button variant="ghost" size="sm" onClick={onSelectHighlights}>
            {t("admin.imports.account.selectHighlights")}
          </Button>
        )}
      </div>

      {(account.status === "pending" || account.status === "running") && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-busy>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/5] rounded-none" />
          ))}
        </div>
      )}

      {account.status === "error" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <div>
            <p className="font-medium">{t(`admin.imports.errors.${account.errorCode ?? "failed"}.title`, { defaultValue: t("admin.imports.errors.failed.title") })}</p>
            <p className="text-muted-foreground">
              {t(`admin.imports.errors.${account.errorCode ?? "failed"}.description`, {
                defaultValue: t("admin.imports.errors.failed.description"),
                when: account.retryAt ? formatDateTime(account.retryAt, language) : "",
              })}
            </p>
          </div>
          {account.retryable && (
            <Button size="sm" variant="outline" onClick={onRetry} disabled={Boolean(account.retryAt && account.retryAt > Date.now())}>
              <RotateCcw aria-hidden />
              {t("admin.imports.account.retry")}
            </Button>
          )}
        </div>
      )}

      {account.status === "done" && account.candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("admin.imports.account.noCandidates")}</p>
      )}

      {account.status === "done" && account.candidates.length > 0 && (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visible.map((candidate) => (
              <CandidateTile
                key={candidate.id}
                candidate={candidate}
                checked={selected.has(candidate.id)}
                onToggle={(on) => onToggle(candidate.id, on)}
              />
            ))}
          </ul>
          {account.candidates.length > VISIBLE_PER_ACCOUNT && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
              {expanded ? t("admin.imports.account.showFewer") : t("admin.imports.account.showAll", { count: account.candidates.length })}
            </Button>
          )}
        </>
      )}
    </section>
  )
}

function CandidateTile({ candidate, checked, onToggle }: { candidate: ReferenceCandidate; checked: boolean; onToggle: (on: boolean) => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [broken, setBroken] = useState(false)
  const carded = candidate.status === "carded"
  const label = t("admin.imports.candidate.select", { date: candidate.postedAt ? formatRelative(candidate.postedAt, language) : "" })

  return (
    <li className={cn("group relative space-y-1.5", carded && "opacity-60")}>
      <div className={cn("relative overflow-hidden", checked && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
        {candidate.previewUrl && !broken ? (
          <img
            src={candidate.previewUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="aspect-[4/5] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center bg-muted text-muted-foreground">
            <ImageOff className="size-4" aria-hidden />
          </div>
        )}
        {!carded && (
          <label className="absolute top-1.5 left-1.5 flex size-10 cursor-pointer items-start justify-start p-1">
            <Checkbox checked={checked} onCheckedChange={(value) => onToggle(value === true)} aria-label={label} className="bg-background" />
          </label>
        )}
        <span
          className={cn(
            "absolute top-1.5 right-1.5 px-1.5 py-0.5 font-mono text-xs",
            candidate.highlight ? "bg-primary text-primary-foreground" : "bg-background/90 text-foreground"
          )}
        >
          {candidate.relativeEngagement === null
            ? t("admin.imports.candidate.noMetric")
            : t("admin.list.engagementValue", { value: formatNumber(candidate.relativeEngagement, language) })}
        </span>
      </div>
      <div className="space-y-0.5 text-xs">
        <p className="flex flex-wrap items-center gap-1">
          <span className="font-medium">
            {candidate.mediaType === "CAROUSEL_ALBUM"
              ? t("admin.imports.candidate.carousel", { count: candidate.childrenCount })
              : t(`admin.taxonomy.formats.${candidate.format}`)}
          </span>
          {candidate.partial && <Badge variant="outline" className="h-4 px-1 text-[0.65rem]">{t("admin.imports.candidate.partial")}</Badge>}
        </p>
        <p className="text-muted-foreground">
          {candidate.likeCount === null
            ? t("admin.imports.candidate.hiddenLikes", { comments: formatNumber(candidate.commentsCount ?? 0, language) })
            : t("admin.imports.candidate.engagement", {
              likes: formatNumber(candidate.likeCount, language),
              comments: formatNumber(candidate.commentsCount ?? 0, language),
            })}
        </p>
        <p className="flex items-center gap-2">
          {carded && candidate.referenceCardId ? (
            <Link to={`/admin/references/${candidate.referenceCardId}`} className="text-primary hover:underline">
              {t("admin.imports.candidate.carded")}
            </Link>
          ) : (
            <span className="text-muted-foreground">{candidate.postedAt ? formatRelative(candidate.postedAt, language) : "—"}</span>
          )}
          {candidate.permalink && (
            <a
              href={candidate.permalink}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-auto inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
              aria-label={t("admin.imports.candidate.open")}
            >
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </p>
      </div>
    </li>
  )
}

function SelectionBar({ count, cost, onClear, onAnalyze }: { count: number; cost: number; onClear: () => void; onAnalyze: () => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      transition={{ type: "spring", bounce: 0, duration: 0.25 }}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm">
          <span className="font-medium">{t("admin.imports.batch.selected", { count })}</span>
          <span className="text-muted-foreground"> · {t("admin.imports.batch.estimate", { cost: formatNumber(Math.round(cost * 100) / 100, language) })}</span>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClear}>
            {t("admin.imports.batch.clear")}
          </Button>
          <Button onClick={onAnalyze}>{t("admin.imports.batch.analyze", { count })}</Button>
        </div>
      </div>
    </motion.div>
  )
}

function ImportSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-14 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="aspect-[4/5] rounded-none" />
        ))}
      </div>
    </div>
  )
}
