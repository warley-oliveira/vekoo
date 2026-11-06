import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { User } from "lucide-react"

import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export type UserAvatarStatus = "online" | "away" | "offline"

const STATUS_COLOR: Record<UserAvatarStatus, string> = {
  online: "bg-status-success",
  away: "bg-status-warning",
  offline: "bg-muted-foreground",
}

export type UserAvatarProps = Omit<ComponentProps<typeof Avatar>, "children"> & {
  name?: string | null
  src?: string | null
  status?: UserAvatarStatus
}

/** "Marina Duarte" vira "MD". Com um nome só, a primeira letra. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""

  const first = Array.from(parts[0])[0] ?? ""
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? "") : ""
  return (first + last).toLocaleUpperCase()
}

/** Pessoa ou contato: foto, ou iniciais sobre fundo neutro. O nome é o que o leitor de tela anuncia. */
export function UserAvatar({ name, src, status, size, className, ...props }: UserAvatarProps) {
  const { t } = useTranslation()
  const initials = name ? getInitials(name) : ""

  return (
    <Avatar
      size={size}
      role="img"
      aria-label={name ?? t("kit.avatar.unknown")}
      className={cn("select-none", className)}
      {...props}
    >
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className="font-medium">
        {initials || <User className="size-1/2" />}
      </AvatarFallback>
      {status ? (
        <AvatarBadge className={STATUS_COLOR[status]}>
          <span className="sr-only">{t(`kit.avatar.status.${status}`)}</span>
        </AvatarBadge>
      ) : null}
    </Avatar>
  )
}
