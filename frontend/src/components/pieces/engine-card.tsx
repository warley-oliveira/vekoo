import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { ArrowRight, Layers } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { useActiveBrand } from "@/lib/brand-context"
import { newPieceHref, type EngineManifest } from "@/lib/engines"

/** Um motor no catálogo: nome, descrição, formatos e quantos campos pede. */
export function EngineCard({ engine }: { engine: EngineManifest }) {
  const { t } = useTranslation()
  const { brandId } = useActiveBrand()

  return (
    <Link
      to={newPieceHref(brandId, engine.id)}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-5 outline-none transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading text-lg font-semibold tracking-tight">{engine.name}</h3>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground">{engine.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs">
        {engine.formats.map((format) => (
          <Badge key={format} variant="outline">{t(`pieces.catalog.formatShort.${format}`)}</Badge>
        ))}
        {engine.series && <Badge variant="secondary"><Layers /> {t("pieces.catalog.series")}</Badge>}
        <span className="ml-auto text-muted-foreground">{t("pieces.catalog.fields", { count: engine.fields.length })}</span>
      </div>
    </Link>
  )
}
