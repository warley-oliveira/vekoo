import { useTranslation } from "react-i18next"

import type { Piece } from "@/lib/engines"
import { formatDateTime, formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"

/** De onde a peça saiu: a versão da marca que estava publicada na geração. */
export function ProvenancePanel({ piece }: { piece: Piece }) {
  const { t } = useTranslation()
  const language = useLanguage()

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

    </section>
  )
}
