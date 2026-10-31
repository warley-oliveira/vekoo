import { useEffect, useRef } from "react"
import { Navigate, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"

import { ErrorState } from "@/components/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandMutations, useBrands } from "@/hooks/use-brands"
import { brandPath, readActiveBrandId } from "@/lib/brand-context"
import { needsOnboarding, onboardingHref } from "@/lib/onboarding"

/**
 * A raiz (`/`) e `/brands` sem id: manda para a marca ativa — a última
 * usada, se ainda existir; senão a primeira. Conta sem marca nenhuma
 * (não deveria acontecer: a primeira nasce com a conta) ganha uma na hora.
 *
 * A marca pronta tem prioridade: quem já tem uma abre no início dela, mesmo
 * que a última usada esteja pela metade — essa se retoma pelo card do
 * painel. Só quem não tem nenhuma pronta cai no onboarding, na pergunta
 * onde parou (inclusive de outro aparelho: quem guarda o ponto é o servidor).
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
      .then((brand) => navigate(onboardingHref(brand.id), { replace: true }))
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

  const remembered = brands.find((b) => b.id === readActiveBrandId())
  const ready =
    remembered && !needsOnboarding(remembered) ? remembered : brands.find((b) => !needsOnboarding(b))
  // Sem marca pronta, o onboarding é a única tela que serve para alguma coisa.
  if (!ready) return <Navigate to={onboardingHref((remembered ?? brands[0]).id)} replace />
  return <Navigate to={brandPath(ready.id)} replace />
}
