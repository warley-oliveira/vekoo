import { useEffect, useRef } from "react"
import { Navigate, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"

import { ErrorState } from "@/components/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandMutations, useBrands } from "@/hooks/use-brands"
import { brandPath, readActiveBrandId } from "@/lib/brand-context"
import { onboardingHref } from "@/lib/onboarding"

/**
 * A raiz (`/`) e `/brands` sem id: manda para a marca ativa — a última
 * usada, se ainda existir; senão a primeira. Conta sem marca nenhuma
 * (não deveria acontecer: a primeira nasce com a conta) ganha uma na hora.
 *
 * Marca que ainda não terminou o onboarding volta para a pergunta onde
 * parou — inclusive de outro aparelho, porque quem guarda o ponto é o
 * servidor. As demais abrem no início.
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
      .then((brand) => navigate(onboardingHref(brand.id, "intro"), { replace: true }))
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
  // Onboarding pendente ganha prioridade sobre qualquer outra tela: uma marca
  // pela metade não serve para nada até fechar.
  if (!active.onboardingDone && active.status === "draft") {
    return <Navigate to={onboardingHref(active.id, active.onboardingStep)} replace />
  }
  return <Navigate to={brandPath(active.id)} replace />
}
