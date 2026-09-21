import { Link, Navigate, useNavigate, useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Palette } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { EngineCard } from "@/components/pieces/engine-card"
import { PieceForm } from "@/components/pieces/piece-form"
import { EngineCatalogSkeleton, PieceFormSkeleton } from "@/components/pieces/piece-skeletons"
import { Button } from "@/components/ui/button"
import { useBrandCore } from "@/hooks/use-brand-core"
import { useEngines } from "@/hooks/use-engines"
import { useActiveBrand } from "@/lib/brand-context"

/**
 * O **modo avançado**: `/advanced` escolhe o motor e `/advanced/:engineId` é o
 * formulário gerado do manifesto.
 *
 * Era a tela principal de criação e deixou de ser: expor a engrenagem — "qual
 * motor?", "quantos caracteres cabem?" — é pedir que a pessoa aprenda o
 * sistema antes de usar o produto. O caminho padrão é a conversa
 * (`/create`); isto aqui serve a quem sabe exatamente o que quer e à operação
 * da Vekoo, que precisa testar motor por motor.
 */
export function PieceNewPage() {
  const { t } = useTranslation()
  const { engineId } = useParams()
  const navigate = useNavigate()
  const { engines, isLoading, error, reload } = useEngines()
  const { brandId, path } = useActiveBrand()
  const brand = useBrandCore(brandId)

  if (error && !engines) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <ErrorState error={error} title={t("pieces.catalog.loadFailed")} onRetry={reload} />
      </div>
    )
  }

  if (!engineId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <header className="mb-6">
          <Link
            to={path("/create")}
            className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-3.5" /> {t("pieces.catalog.backToChat")}
          </Link>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("pieces.catalog.heading")}</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t("pieces.catalog.description")}</p>
        </header>
        {isLoading || !engines ? (
          <EngineCatalogSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {engines.map((engine) => <EngineCard key={engine.id} engine={engine} />)}
          </div>
        )}
      </div>
    )
  }

  const engine = engines?.find((e) => e.id === engineId)
  if (engines && !engine) return <Navigate to={path("/advanced")} replace />

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to={path("/advanced")} className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
            <ArrowLeft className="size-3.5" /> {t("pieces.form.back")}
          </Link>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{engine?.name ?? t("pieces.form.heading")}</h1>
          {engine && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{engine.description}</p>}
        </div>
      </header>

      {brand.error && !brand.brandCore ? (
        <ErrorState error={brand.error} onRetry={brand.reload} />
      ) : !engine || !brand.brandCore ? (
        <PieceFormSkeleton />
      ) : brand.brandCore.status !== "published" ? (
        <EmptyState
          icon={<Palette className="size-6" />}
          title={t("pieces.form.brandNotPublished.title")}
          description={t("pieces.form.brandNotPublished.description")}
          action={{ label: t("pieces.form.brandNotPublished.cta"), onClick: () => navigate(path("/settings")) }}
        />
      ) : (
        <PieceForm key={engine.id} engine={engine} brandCore={brand.brandCore} />
      )}
      {!engine && !isLoading && (
        <Button variant="outline" onClick={() => navigate(path("/advanced"))}>{t("pieces.form.back")}</Button>
      )}
    </div>
  )
}
