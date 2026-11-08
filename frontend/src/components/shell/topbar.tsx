import { Link } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"

import { HeaderSlotOutlet } from "@/components/shell/header-slot"
import { NotificationCenter } from "@/components/shell/notification-center"
import { Button } from "@/components/ui/button"
import { useHeaderTitle } from "@/hooks/use-header-slot"

/** Barra superior do desktop: título da rota, ações da página e avisos. */
export function Topbar() {
  const { t } = useTranslation()
  const { title, color, backTo } = useHeaderTitle()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
      {backTo && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-1.5 text-muted-foreground"
          nativeButton={false}
          render={<Link to={backTo} aria-label={t("common.back")} />}
        >
          <ArrowLeft />
        </Button>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {color && (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        )}
        <h1 className="truncate font-heading text-lg font-semibold tracking-tight">
          {title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <HeaderSlotOutlet />
        <NotificationCenter />
      </div>
    </header>
  )
}
