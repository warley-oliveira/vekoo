import { useTranslation } from "react-i18next"

import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { UserAvatar, type UserAvatarProps } from "./user-avatar"

export type AvatarStackUser = {
  id?: string
  name: string
  src?: string | null
}

export type AvatarStackProps = {
  users: AvatarStackUser[]
  /** Quantos rostos aparecem antes do "+N". */
  max?: number
  size?: UserAvatarProps["size"]
  className?: string
}

/** Quem participa de algo (responsáveis, membros), sem ocupar uma linha com nomes. */
export function AvatarStack({ users, max = 4, size = "sm", className }: AvatarStackProps) {
  const { t } = useTranslation()
  const visible = users.slice(0, max)
  const hidden = users.slice(max)

  if (users.length === 0) return null

  return (
    <AvatarGroup
      role="group"
      aria-label={users.map((user) => user.name).join(", ")}
      className={cn("w-fit", className)}
    >
      {visible.map((user, index) => (
        <Tooltip key={user.id ?? `${user.name}-${index}`}>
          <TooltipTrigger
            render={<UserAvatar name={user.name} src={user.src} size={size} />}
          />
          <TooltipContent>{user.name}</TooltipContent>
        </Tooltip>
      ))}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <AvatarGroupCount aria-hidden className="text-xs font-medium" />
            }
          >
            {t("kit.avatar.more", { count: hidden.length })}
          </TooltipTrigger>
          <TooltipContent>{hidden.map((user) => user.name).join(", ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </AvatarGroup>
  )
}
