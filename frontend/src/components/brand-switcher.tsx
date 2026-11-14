import { useTranslation } from "react-i18next"
import { Check, ChevronsUpDown, Loader2, Plus, Settings } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useBrands } from "@/hooks/use-brands"
import { useCreateBrand } from "@/hooks/use-create-brand"
import { brandPath, useCurrentBrandId } from "@/lib/brand-context"
import { useLocation, useNavigate } from "@/lib/router"
import { cn } from "@/lib/utils"

/** Telas de um registro (um carrossel, uma peça, uma pasta): na outra marca, ficam na lista. */
const RECORD_SCREENS = ["/carousels/", "/contents/", "/folders/", "/create/"]

/**
 * O seletor da marca ativa, no topo do grupo Criação. Trocar de marca troca o contexto de toda a
 * Criação (a URL muda de `/brands/<a>` para `/brands/<b>`, na mesma tela). Vive na casca, fora de
 * `/brands/:brandId`: a marca de agora é a da tela, ou a última usada nesta organização.
 *
 * `rail` é a barra recolhida: só a cor da marca, com o nome na dica.
 */
export function BrandSwitcher({
  rail = false,
  onNavigate,
}: {
  rail?: boolean
  /** Depois de navegar: fecha o painel "Mais" no celular. */
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { brands } = useBrands()
  const { create, creating } = useCreateBrand()
  const currentId = useCurrentBrandId()
  const brand = brands?.find((item) => item.id === currentId) ?? brands?.[0]

  if (!brands || brands.length === 0) return null

  const label = brand?.name ?? t("brandSwitcher.untitled")

  function go(path: string) {
    navigate(path)
    onNavigate?.()
  }

  function switchTo(id: string) {
    if (id === brand?.id) return
    // Mantém a tela: quem estava em "conteúdos" continua em conteúdos.
    const prefix = brand ? brandPath(brand.id) : null
    const sub = prefix && pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ""
    const keep = RECORD_SCREENS.some((screen) => sub.startsWith(screen)) ? "" : sub
    go(brandPath(id, keep))
  }

  const trigger = (
    <DropdownMenuTrigger
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg border border-sidebar-border px-2.5 text-left text-sm font-medium outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10",
        rail && "size-10 justify-center border-transparent px-0"
      )}
      aria-label={t("brandSwitcher.aria", { name: label })}
    >
      <BrandDot color={brand?.accentColor ?? null} />
      {!rail && (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </>
      )}
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {rail ? (
        <Tooltip>
          <TooltipTrigger render={<span className="flex justify-center" />}>{trigger}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" side={rail ? "right" : "bottom"} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("brandSwitcher.label")}</DropdownMenuLabel>
          {brands.map((item) => (
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
              {item.id === brand?.id && <Check className="size-4" aria-hidden />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {brand && (
          <DropdownMenuItem onClick={() => go(brandPath(brand.id, "/settings"))}>
            <Settings /> {t("brandSwitcher.settings")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => {
            void create()
            onNavigate?.()
          }}
          disabled={creating}
        >
          {creating ? <Loader2 className="animate-spin" /> : <Plus />} {t("brandSwitcher.newBrand")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A cor da marca no chrome — a obra do usuário, por isso a cor vem dela e não de um token. Sem cor
 * ainda, um anel neutro: nunca uma cor inventada.
 */
function BrandDot({ color }: { color: string | null }) {
  return (
    <span
      className={cn(
        "size-2.5 shrink-0 rounded-full ring-1",
        color ? "ring-foreground/10" : "ring-border"
      )}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
  )
}
