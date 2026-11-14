import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { User } from "lucide-react"

import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { avatarTone } from "@/lib/avatar-tone"
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
  /**
   * Com isto, as iniciais saem num dos tons `avatar-*` do tema, sorteado pela semente (o id do
   * contato, para ficar igual na lista e no cabeçalho). Sem, o fundo é neutro.
   */
  colorSeed?: string | null
}

/** "Marina Duarte" vira "MD". Com um nome só, a primeira letra. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""

  const first = Array.from(parts[0])[0] ?? ""
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? "") : ""
  return (first + last).toLocaleUpperCase()
}

/**
 * Pessoa ou contato: foto, ou iniciais sobre fundo neutro (ou no tom do contato, com `colorSeed`). O
 * nome é o que o leitor de tela anuncia.
 */
export function UserAvatar({
  name,
  src,
  status,
  size,
  colorSeed,
  className,
  ...props
}: UserAvatarProps) {
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
      <AvatarFallback className={cn("font-medium", colorSeed && cn(avatarTone(colorSeed).fill, "font-semibold"))}>
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
