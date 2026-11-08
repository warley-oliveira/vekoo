import { useTranslation } from "react-i18next"
import { LifeBuoy, LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Link } from "@/lib/router"

/**
 * Aviso fixo de que a aba está em modo suporte: a pessoa do suporte do Vekoo dentro da organização
 * de um cliente, com tudo liberado. Discreto (canto inferior, sem cobrir a navegação), mas sempre
 * na tela, com o nome da organização e a saída.
 */
export function SupportBanner({ organizationName }: { organizationName: string }) {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--app-bottom-nav-total)+0.5rem)] z-50 flex justify-center px-4 lg:bottom-4 lg:pl-[var(--sidebar-width,16rem)]"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-background/95 py-1 pr-1 pl-3 text-xs shadow-sm backdrop-blur">
        <LifeBuoy className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 truncate">
          <span className="font-medium">{t("organizations.support.banner")}</span>
          <span className="text-muted-foreground"> · {organizationName}</span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-full px-2.5 text-xs pointer-coarse:h-9"
          nativeButton={false}
          render={<Link to="/organizations" />}
        >
          <LogOut className="size-3.5" />
          {t("organizations.support.leave")}
        </Button>
      </div>
    </div>
  )
}
