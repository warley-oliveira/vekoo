import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Check, ChevronsUpDown, Loader2, Plus, Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCreateBrand } from "@/hooks/use-create-brand"
import { brandPath, useActiveBrand } from "@/lib/brand-context"
import { cn } from "@/lib/utils"

/**
 * O seletor da marca ativa, no topo. Trocar de marca troca o contexto
 * inteiro (a URL muda de `/brands/<a>` para `/brands/<b>`, na mesma tela).
 * Com uma marca só, fica discreto: o nome e o menu de sempre, sem alarde.
 */
export function BrandSwitcher() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { brandId, brand, brands, path } = useActiveBrand()
  const { create, creating } = useCreateBrand()
  const single = (brands?.length ?? 0) <= 1

  function switchTo(id: string) {
    if (id === brandId) return
    // Mantém a tela: quem estava em "conteúdos" continua em conteúdos.
    const sub = window.location.pathname.slice(path("").length)
    const keep = sub.startsWith("/carousels/") || sub.startsWith("/contents/") || sub.startsWith("/folders/") ? "" : sub
    navigate(brandPath(id, keep))
  }

  const label = brand?.name ?? t("brandSwitcher.untitled")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("h-9 max-w-52 gap-2 rounded-full border-vk-border bg-transparent px-3 font-medium", single && "text-vk-fg")}
            aria-label={t("brandSwitcher.aria", { name: label })}
          />
        }
      >
        <BrandDot color={brand?.accentColor ?? null} />
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("brandSwitcher.label")}</DropdownMenuLabel>
        <DropdownMenuGroup>
          {(brands ?? []).map((item) => (
            <DropdownMenuItem key={item.id} onClick={() => switchTo(item.id)}>
              <BrandDot color={item.accentColor} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{item.name ?? t("brandSwitcher.untitled")}</span>
                <span className="text-xs text-muted-foreground">
                  {item.readyForGeneration
                    ? t("brand.overview.status.published")
                    : item.onboardingDone
                      ? t("brand.progress", { percent: item.percent })
                      : t("brandSwitcher.incomplete")}
                </span>
              </span>
              {item.id === brandId && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(path("/settings"))}>
          <Settings /> {t("brandSwitcher.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void create()} disabled={creating}>
          {creating ? <Loader2 className="animate-spin" /> : <Plus />} {t("brandSwitcher.newBrand")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A cor da marca no chrome — o único lugar fora da prévia em que ela
 * aparece. Sem cor ainda, um anel neutro: nunca uma cor inventada.
 */
function BrandDot({ color }: { color: string | null }) {
  return (
    <span
      className={cn("size-2.5 shrink-0 rounded-full", color ? "ring-1 ring-black/10" : "ring-1 ring-vk-border-strong")}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
  )
}
