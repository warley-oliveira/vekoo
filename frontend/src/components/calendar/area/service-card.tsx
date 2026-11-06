import { useTranslation } from "react-i18next"
import { AlertTriangle, Pencil, Trash2 } from "lucide-react"

import { StatusBadge } from "@/components/shared"
import type { AgendaService, Professional } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { AreaCard } from "./area-card"
import { FULL, sharesOf } from "./distribution"

const NO_COLOR = "#71717a"

/** Um serviço: o que é, quanto tempo leva e quem atende. */
export function ServiceCard({
  service,
  professionals,
  onOpen,
  onDelete,
}: {
  service: AgendaService
  professionals: Professional[]
  onOpen: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  const shares = sharesOf(service.distribution, professionals)
  const sum = shares.reduce((total, { share }) => total + share, 0)
  const broken = sum !== FULL

  const details = [
    t("calendar.services.card.duration", { count: service.duration }),
    t("calendar.services.card.interval", { count: service.timeIncrementInterval }),
    ...(service.bufferBefore > 0
      ? [t("calendar.services.card.bufferBefore", { count: service.bufferBefore })]
      : []),
    ...(service.bufferAfter > 0
      ? [t("calendar.services.card.bufferAfter", { count: service.bufferAfter })]
      : []),
    ...(service.guestLimit > 1
      ? [t("calendar.services.card.guests", { count: service.guestLimit })]
      : []),
  ]

  const legend = new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
    shares.map(({ professional, share }) =>
      t("calendar.services.card.share", { name: professional.name, value: share })
    )
  )

  return (
    <AreaCard
      title={service.name}
      onOpen={onOpen}
      badges={
        broken ? (
          <StatusBadge tone="warning" icon={<AlertTriangle />}>
            {shares.length === 0
              ? t("calendar.services.card.nobody")
              : t("calendar.services.card.broken", { value: sum })}
          </StatusBadge>
        ) : null
      }
      actionsLabel={t("calendar.services.actionsOf", { name: service.name })}
      actions={[
        { label: t("calendar.services.edit.action"), icon: <Pencil />, onSelect: onOpen },
        {
          label: t("calendar.services.delete.action"),
          icon: <Trash2 />,
          destructive: true,
          separatorBefore: true,
          onSelect: onDelete,
        },
      ]}
      footer={
        shares.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div
              aria-hidden
              className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              {shares.map(({ professional, share }) => (
                <span
                  key={professional.id}
                  // Cor escolhida pela pessoa: a mesma do colaborador na grade.
                  style={{
                    width: `${(share / Math.max(sum, FULL)) * 100}%`,
                    backgroundColor: professional.color ?? NO_COLOR,
                  }}
                />
              ))}
            </div>
            <p className="text-xs text-pretty text-muted-foreground tabular-nums">{legend}</p>
          </div>
        ) : null
      }
    >
      {service.description ? (
        <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">
          {service.description}
        </p>
      ) : null}
      <p className="text-sm tabular-nums">{details.join(" · ")}</p>
    </AreaCard>
  )
}
