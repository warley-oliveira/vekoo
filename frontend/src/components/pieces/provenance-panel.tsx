import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { ArrowRight, RefreshCw } from "lucide-react"

import { useActiveBrand } from "@/lib/brand-context"
import { stepHref } from "@/lib/brand-core"
import type { Piece } from "@/lib/engines"
import { formatDateTime, formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** De onde a peça saiu: versão da marca e cada fato consumido, com o valor de hoje ao lado. */
export function ProvenancePanel({ piece }: { piece: Piece }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { brandId } = useActiveBrand()
  const refs = piece.provenance.refs ?? []
  const staleById = new Map(piece.staleRefs.map((ref) => [ref.factId, ref]))

  return (
    <section className="rounded-lg border p-4" aria-label={t("pieces.detail.provenance")}>
      <h2 className="text-sm font-medium">{t("pieces.detail.provenance")}</h2>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("pieces.detail.brandVersion")}</dt>
          <dd className="tabular-nums">
            {piece.brandCoreVersion ? `v${piece.brandCoreVersion}` : "—"}
            {piece.outdated && <span className="ml-2 text-xs text-muted-foreground">({t("pieces.status.outdated")})</span>}
          </dd>
        </div>
        {piece.renderedAt && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("pieces.detail.renderedAt", { when: "" }).trim()}</dt>
            <dd title={formatDateTime(piece.renderedAt, language)}>{formatRelative(piece.renderedAt, language)}</dd>
          </div>
        )}
      </dl>

      <h3 className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("pieces.detail.refs")}</h3>
      {refs.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("pieces.detail.refsEmpty")}</p>
      ) : (
        <ul className="mt-2 divide-y">
          {refs.map((ref) => {
            const stale = staleById.get(ref.factId)
            return (
              <li key={`${ref.field}-${ref.factId}`} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{ref.label}</span>
                  {stale && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <RefreshCw className="size-3" /> {t(`pieces.detail.staleReason.${stale.reason}`)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 grid grid-cols-2 gap-2 text-xs">
                  <span className={cn(stale && "line-through opacity-70")}>
                    <span className="text-muted-foreground">{t("pieces.detail.refInPiece")}: </span>{ref.value}
                  </span>
                  {stale && (
                    <span>
                      <span className="text-muted-foreground">{t("pieces.detail.refToday")}: </span>{stale.current ?? "—"}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {piece.staleRefs.length > 0 && (
        <Link to={stepHref(brandId, "facts")} className="mt-3 inline-flex items-center gap-1 rounded text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          {t("pieces.detail.fixFacts")} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </section>
  )
}
