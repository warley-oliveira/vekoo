import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { ErrorState } from "@/components/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandMutations, useBrands } from "@/hooks/use-brands"
import { brandPath, readActiveBrandId } from "@/lib/brand-context"
import { needsOnboarding, onboardingHref } from "@/lib/onboarding"
import { Navigate, useNavigate, useSearchParams } from "@/lib/router"

/** Só um caminho dentro da marca: nada de `//outro-site` nem caminho de fora dela. */
function safeSub(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return ""
  return raw
}

/**
 * `/brands` sem id, o "Início da marca" do menu e os caminhos de Criação de antes da marca
 * (`/carousels`, `/folders/:id`, `/trash`, `/templates`): manda para a marca ativa — a última
 * usada nesta organização, se ainda existir; senão a primeira. Conta sem marca nenhuma (não
 * deveria acontecer: a primeira nasce com a conta) ganha uma na hora.
 *
 * `sub` (ou `?to=`) é a tela dentro da marca: `/carousels` cai em `/brands/<ativa>/carousels`.
 *
 * A marca pronta tem prioridade: quem já tem uma abre nela, mesmo que a última usada esteja pela
 * metade — essa se retoma pelo card do painel. Só quem não tem nenhuma pronta cai no onboarding,
 * na pergunta onde parou (inclusive de outro aparelho: quem guarda o ponto é o servidor).
 */
export function BrandGate({ sub }: { sub?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { brands, isLoading, error, reload } = useBrands()
  const { createBrand } = useBrandMutations()
  const creating = useRef(false)
  const target = safeSub(sub ?? searchParams.get("to"))

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
  return <Navigate to={brandPath(ready.id, target)} replace />
}
