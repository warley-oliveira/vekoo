import { ImageOff } from "lucide-react"

import { useThumbnail } from "@/admin/api"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** A miniatura do post — privada, buscada com a sessão. Cantos retos: é obra. */
export function ReferenceThumbnail({
  id,
  available,
  alt,
  className,
}: {
  id: string
  available: boolean
  alt: string
  className?: string
}) {
  const url = useThumbnail(id, available)

  if (!available) {
    return (
      <div className={cn("flex aspect-[4/5] items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageOff className="size-4" aria-hidden />
      </div>
    )
  }
  if (!url) return <Skeleton className={cn("aspect-[4/5] rounded-none", className)} />
  return <img src={url} alt={alt} className={cn("aspect-[4/5] object-cover", className)} />
}
