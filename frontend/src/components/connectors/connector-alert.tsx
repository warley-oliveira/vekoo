import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { RelativeTime, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { dismissConnectorAlert } from "@/hooks/connectors/use-connector-alerts"
import { withoutInstanceName } from "@/lib/connectors/channels"
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
        "relative z-10 flex flex-wrap items-start gap-x-2 gap-y-1 rounded-lg bg-status-warning-soft px-3 py-2 text-sm text-status-warning md:flex-nowrap",
        alert.severity === "error" && "bg-status-danger-soft text-status-danger",
        className
      )}
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {/* No celular o texto fica com a largura toda, e o botão desce: lado a lado, sobrava
          uma palavra por linha. A conta tira o ícone e o espaço entre os dois. */}
      <div className="min-w-0 flex-1 max-md:basis-[calc(100%-1.5rem)]">
        <p className="text-pretty">
          {withoutInstanceName(alert.message, t("connectors.types.whatsapp_web"))}
        </p>
        <RelativeTime value={alert.createdAt} className="text-xs opacity-80" />
      </div>
      <Button
        variant="ghost"
        size="xs"
        className="-my-0.5 shrink-0 text-current hover:bg-foreground/5 hover:text-current max-md:ml-auto"
        onClick={() => void dismiss()}
      >
        {t("connectors.alerts.dismiss")}
      </Button>
    </div>
  )
}
