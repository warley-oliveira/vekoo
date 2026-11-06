import type { ReactNode } from "react"

import { UserAvatar, type UserAvatarProps } from "@/components/shared"
import { apiAssetUrl } from "@/lib/api"
import { cn } from "@/lib/utils"

type PersonIdentityProps = {
  name: string
  email?: string | null
  avatarUrl?: string | null
  /** Ao lado do nome: "Você", "Dono". */
  badge?: ReactNode
  size?: UserAvatarProps["size"]
  className?: string
}

/** Foto, nome e e-mail: como uma pessoa aparece em toda lista desta área. */
export function PersonIdentity({ name, email, avatarUrl, badge, size, className }: PersonIdentityProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <UserAvatar name={name} src={avatarUrl ? apiAssetUrl(avatarUrl) : null} size={size} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          {badge}
        </p>
        {email ? (
          <p className="truncate text-xs font-normal text-muted-foreground">{email}</p>
        ) : null}
      </div>
    </div>
  )
}
