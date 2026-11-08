import { apiAssetUrl } from "@/lib/api"
import { initials } from "@/lib/auth"
import { cn } from "@/lib/utils"

/**
 * O logo da organização ou, sem ele, as iniciais na cor do sistema. Cantos suaves: é interface,
 * não obra da pessoa (as capas de carrossel é que são retas).
 */
export function OrganizationBadge({
  name,
  logoUrl,
  className,
}: {
  name: string
  logoUrl?: string | null
  className?: string
}) {
  if (logoUrl) {
    return (
      <img
        src={apiAssetUrl(logoUrl)}
        alt=""
        className={cn("size-7 shrink-0 rounded-lg bg-muted object-cover", className)}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-heading text-xs font-bold text-primary-foreground",
        className
      )}
    >
      {initials(name)}
    </span>
  )
}
