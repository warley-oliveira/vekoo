import { useEffect, type ReactNode } from "react"

import { ErrorState } from "@/components/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandCoreLive } from "@/hooks/use-brand-core-live"
import { useBrands } from "@/hooks/use-brands"
import { BrandProvider, forgetActiveBrand } from "@/lib/brand-context"
import { Navigate, Outlet, useParams } from "@/lib/router"

/**
 * Tudo sob `/brands/:brandId` vive aqui dentro: o provider da marca ativa e a validação de que a
 * marca existe nesta organização (id de outra organização ou apagado volta para `/brands`, que
 * escolhe a marca certa). Serve às telas dentro da casca (como rota-pai, por `<Outlet />`) e às de
 * tela cheia, o editor e o onboarding (por `children`).
 */
export function BrandLayout({ children }: { children?: ReactNode }) {
  const { brandId } = useParams()
  const { brands, isLoading, error, reload } = useBrands()
  useBrandCoreLive()
  const unknown = Boolean(brandId && brands && !brands.some((b) => b.id === brandId))

  useEffect(() => {
    if (brandId && unknown) forgetActiveBrand(brandId)
  }, [brandId, unknown])

  if (!brandId) return <Navigate to="/brands" replace />
  if (error && !brands) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (isLoading || !brands) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 md:px-6" aria-busy>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (unknown) return <Navigate to="/brands" replace />

  return <BrandProvider brandId={brandId}>{children ?? <Outlet />}</BrandProvider>
}
