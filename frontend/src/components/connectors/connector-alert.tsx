import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { RelativeTime, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { dismissConnectorAlert } from "@/hooks/connectors/use-connector-alerts"
import type { ConnectorAlert } from "@/lib/connectors/types"
import { cn } from "@/lib/utils"

/**
 * Um aviso em aberto. Dispensar não resolve o problema, só cala o aviso para a organização
 * inteira: a confirmação diz isso, porque a tentação é dispensar para o número sumir.
 */
export function ConnectorAlertNotice({
  alert,
  className,
}: {
  alert: ConnectorAlert
  className?: string
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  async function dismiss() {
    const confirmed = await confirm({
      title: t("connectors.alerts.dismissTitle"),
      description: t("connectors.alerts.dismissDescription"),
      confirmLabel: t("connectors.alerts.dismiss"),
      onConfirm: () => dismissConnectorAlert(alert),
    })
    if (confirmed) toast.success(t("connectors.alerts.dismissed"))
  }

  return (
    <div
      className={cn(
        "relative z-10 flex items-start gap-2 rounded-lg bg-status-warning-soft px-3 py-2 text-sm text-status-warning",
        alert.severity === "error" && "bg-status-danger-soft text-status-danger",
        className
      )}
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-pretty">{alert.message}</p>
        <RelativeTime value={alert.createdAt} className="text-xs opacity-80" />
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="-my-0.5 shrink-0 text-current hover:bg-foreground/5 hover:text-current"
        onClick={() => void dismiss()}
      >
        {t("connectors.alerts.dismiss")}
      </Button>
    </div>
  )
}
