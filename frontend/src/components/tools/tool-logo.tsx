import { useState } from "react"
import { Brain, CalendarCheck, Database, Flag, Headset, Kanban, ShoppingBag, Tag, type LucideIcon } from "lucide-react"

import { apiAssetUrl } from "@/lib/api"
import { cn } from "@/lib/utils"

// O catálogo descreve o ícone com um nome do Iconify, e o app não baixa ícone de fora: a política de segurança
// bloquearia, e o pacote pesa. Cada nome conhecido tem um par aqui; ferramenta nova sem par sai com a inicial, até
// entrar nesta lista. A cor do catálogo fica de fora de propósito: numa tela quieta, oito ladrilhos coloridos gritam.
const ICONS: Record<string, LucideIcon> = {
  "solar:calendar-mark-bold-duotone": CalendarCheck,
  "solar:user-hands-bold-duotone": Headset,
  "solar:server-square-bold-duotone": Database,
  "solar:bag-smile-bold-duotone": ShoppingBag,
  "solar:brain-bold-duotone": Brain,
  "solar:planet-bold-duotone": Kanban,
  "solar:tag-bold-duotone": Tag,
  "solar:flag-bold-duotone": Flag,
}

const SIZES = {
  sm: { box: "size-8 rounded-lg text-sm", icon: "size-4" },
  md: { box: "size-10 rounded-xl text-base", icon: "size-5" },
  lg: { box: "size-12 rounded-xl text-lg", icon: "size-6" },
} as const

export type ToolLogoProps = {
  tool: { name: string; icon?: string | null; imageUrl?: string | null }
  size?: keyof typeof SIZES
  className?: string
}

export function ToolLogo({ tool, size = "md", className }: ToolLogoProps) {
  const sizes = SIZES[size]
  const source = tool.imageUrl ? apiAssetUrl(tool.imageUrl) : null
  const [failed, setFailed] = useState<string | null>(null)
  const Icon = tool.icon ? ICONS[tool.icon] : undefined

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted font-heading font-semibold text-foreground/70",
        sizes.box,
        className
      )}
    >
      {source && failed !== source ? (
        <img src={source} alt="" loading="lazy" onError={() => setFailed(source)} className="size-full object-contain p-1" />
      ) : Icon ? (
        <Icon className={sizes.icon} />
      ) : (
        tool.name.charAt(0).toUpperCase()
      )}
    </span>
  )
}
