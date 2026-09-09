import { useEffect, useRef } from "react"
import { Navigate, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"

import { ErrorState } from "@/components/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandMutations, useBrands } from "@/hooks/use-brands"
import { brandPath, readActiveBrandId } from "@/lib/brand-context"
import { stepHref } from "@/lib/brand-core"

/**
 * A raiz (`/`) e `/brands` sem id: manda para a marca ativa — a última
 * usada, se ainda existir; senão a primeira. Conta sem marca nenhuma
 * (não deveria acontecer: a primeira nasce com a conta) ganha uma na hora.
 * Marca ainda não começada abre no formulário; as outras, no início.
 */
export function BrandGate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { brands, isLoading, error, reload } = useBrands()
  const { createBrand } = useBrandMutations()
  const creating = useRef(false)

  useEffect(() => {
    if (!brands || brands.length > 0 || creating.current) return
    creating.current = true
    createBrand()
      .then((brand) => navigate(stepHref(brand.id, "identity"), { replace: true }))
      .catch(() => {
        creating.current = false
      })
  }, [brands, createBrand, navigate])

  if (error && !brands) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (isLoading || !brands || brands.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-10" aria-busy aria-label={t("brandSwitcher.loading")}>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const remembered = readActiveBrandId()
  const active = brands.find((b) => b.id === remembered) ?? brands[0]
  const untouched = active.visitedSteps.length === 0 && active.status === "draft"
  return <Navigate to={untouched ? stepHref(active.id, "identity") : brandPath(active.id)} replace />
}
