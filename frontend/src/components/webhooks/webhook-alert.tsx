import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { RelativeTime, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { dismissWebhookAlert } from "@/hooks/webhooks/use-webhooks"
import { cn } from "@/lib/utils"
import type { WebhookAlert } from "@/lib/webhooks/types"

/**
 * Um aviso em aberto: a última entrega falhou. A próxima que der certo resolve sozinha, e salvar o webhook também.
 * Dispensar só cala o aviso, e a confirmação diz isso, porque a tentação é dispensar para o número sumir.
 */
export function WebhookAlertNotice({ alert, showName, className }: { alert: WebhookAlert; showName?: boolean; className?: string }) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  async function dismiss() {
    const confirmed = await confirm({
      title: t("webhooks.alerts.dismissTitle"),
      description: t("webhooks.alerts.dismissDescription"),
      confirmLabel: t("webhooks.alerts.dismiss"),
      onConfirm: () => dismissWebhookAlert(alert),
    })
    if (confirmed) toast.success(t("webhooks.alerts.dismissed"))
  }

  return (
    <div
      className={cn(
        "relative z-10 flex flex-wrap items-start gap-x-2 gap-y-1 rounded-lg bg-status-danger-soft px-3 py-2 text-sm text-status-danger md:flex-nowrap",
        alert.severity !== "error" && "bg-status-warning-soft text-status-warning",
        className
      )}
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {/* No celular o texto fica com a largura toda, e o botão desce. A conta tira o ícone e o espaço entre os dois. */}
      <div className="min-w-0 flex-1 max-md:basis-[calc(100%-1.5rem)]">
        <p className="text-pretty">
          {showName && alert.originName ? <span className="font-medium">{alert.originName}: </span> : null}
          {alert.message ?? t("webhooks.alerts.fallback")}
        </p>
        <RelativeTime value={alert.updatedAt} className="text-xs opacity-80" />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="-my-0.5 shrink-0 text-current hover:bg-foreground/5 hover:text-current max-md:ml-auto pointer-coarse:h-10"
        onClick={() => void dismiss()}
      >
        {t("webhooks.alerts.dismiss")}
      </Button>
    </div>
  )
}
