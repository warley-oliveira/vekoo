import { Navigate, Outlet, useParams } from "react-router"

import { ErrorState } from "@/components/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandCoreLive } from "@/hooks/use-brand-core-live"
import { useBrands } from "@/hooks/use-brands"
import { BrandProvider } from "@/lib/brand-context"

/**
 * Tudo sob `/brands/:brandId` vive aqui dentro: o provider da marca ativa
 * e a validação de que a marca existe nesta organização (id de outra conta
 * ou apagado volta para a raiz, que escolhe a marca certa).
 */
export function BrandLayout() {
  const { brandId } = useParams()
  const { brands, isLoading, error, reload } = useBrands()
  useBrandCoreLive()

  if (!brandId) return <Navigate to="/" replace />
  if (error && !brands) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (isLoading || !brands) {
    return (
      <div className="flex h-dvh">
        <Skeleton className="hidden w-64 rounded-none lg:block" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }
  if (!brands.some((b) => b.id === brandId)) return <Navigate to="/" replace />

  return (
    <BrandProvider brandId={brandId}>
      <Outlet />
    </BrandProvider>
  )
}
