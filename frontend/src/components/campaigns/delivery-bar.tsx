import { useTranslation } from "react-i18next"

import "@/components/dashboard/viz-tokens.css"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DELIVERY_COLORS, type DeliveryNumbers } from "@/lib/campaigns/progress"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// O andamento de uma campanha, em camadas. Os números são cumulativos (lida também conta como
// entregue e como enviada), então cada camada escura termina onde o número dela diz, por cima da
// anterior. Ordinal, um matiz só, do claro ao escuro, validado com `--ordinal`. A falha é a única outra
// cor: vem depois das enviadas, com a fila no trilho.
//
// Só `transform`: cada camada é uma barra inteira, deslocada e recortada pelo trilho. Assim a borda que
// separa as partes não deforma ao animar, como aconteceria com `scaleX`.

type DeliveryBarProps = {
  numbers: DeliveryNumbers
  /** `sm` para as linhas da lista; `md` para o painel. */
  size?: "sm" | "md"
  /** A barra fica por cima do link da linha: sem isto, clicar nela não abriria nada. */
  onClick?: () => void
  className?: string
}

export function DeliveryBar({ numbers, size = "md", onClick, className }: DeliveryBarProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { total, sent, delivered, read, failed } = numbers

  const position = (value: number) => (total > 0 ? Math.min(value / total, 1) : 0)
  const layers = [
    { key: "failed", color: DELIVERY_COLORS.failed, end: position(sent + failed) },
    { key: "sent", color: DELIVERY_COLORS.sent, end: position(sent) },
    { key: "delivered", color: DELIVERY_COLORS.delivered, end: position(delivered) },
    { key: "read", color: DELIVERY_COLORS.read, end: position(read) },
  ]

  const parts = {
    total: formatNumber(total, language),
    sent: formatNumber(sent, language),
    delivered: formatNumber(delivered, language),
    read: formatNumber(read, language),
    failed: formatNumber(failed, language),
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            role="img"
            aria-label={t("campaigns.bar.label", parts)}
            onClick={onClick}
            className={cn(
              "relative isolate w-full overflow-hidden rounded-full bg-(--viz-track)",
              size === "sm" ? "h-1.5" : "h-2",
              onClick && "cursor-pointer",
              className
            )}
          />
        }
      >
        {layers.map((layer) => (
          <span
            key={layer.key}
            aria-hidden
            className="absolute inset-0 border-r-2 border-card transition-transform duration-300 ease-out"
            style={{
              backgroundColor: layer.color,
              transform: `translateX(${(layer.end - 1) * 100}%)`,
            }}
          />
        ))}
      </TooltipTrigger>
      <TooltipContent className="flex flex-col gap-1 tabular-nums">
        <TooltipRow color={DELIVERY_COLORS.sent} label={t("campaigns.numbers.sent")} value={parts.sent} />
        <TooltipRow color={DELIVERY_COLORS.delivered} label={t("campaigns.numbers.delivered")} value={parts.delivered} />
        <TooltipRow color={DELIVERY_COLORS.read} label={t("campaigns.numbers.read")} value={parts.read} />
        <TooltipRow color={DELIVERY_COLORS.failed} label={t("campaigns.numbers.failed")} value={parts.failed} />
      </TooltipContent>
    </Tooltip>
  )
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-medium">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  )
}
