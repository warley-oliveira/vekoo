import { useTranslation } from "react-i18next"
import { Pencil, Phone, PhoneOff, Trash2 } from "lucide-react"

import { UserAvatar } from "@/components/shared"
import { apiAssetUrl } from "@/lib/api"
import type { Professional } from "@/lib/calendar/types"
import { formatPhone } from "@/lib/format-phone"
import { AreaCard } from "./area-card"
import { normalizeWeek } from "./week-schedule"
import { WeekSummary } from "./week-summary"

/** Um colaborador: quem é, quando atende e o que falta para ele receber avisos. */
export function CollaboratorCard({
  professional,
  onOpen,
  onDelete,
}: {
  professional: Professional
  onOpen: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const blocks = professional.rule?.blockedTimes.length ?? 0
  const counts = [
    t("calendar.collaborators.serviceCount", { count: professional.serviceIds.length }),
    ...(blocks > 0 ? [t("calendar.collaborators.blockCount", { count: blocks })] : []),
  ]

  return (
    <AreaCard
      title={professional.name}
      onOpen={onOpen}
      leading={
        <span className="relative block">
          <UserAvatar
            name={professional.name}
            src={professional.avatarUrl ? apiAssetUrl(professional.avatarUrl) : null}
          />
          {professional.color ? (
            <span
              aria-hidden
              // Cor escolhida pela pessoa: é a mesma que ele tem na grade do calendário.
              style={{ backgroundColor: professional.color }}
              className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-background"
            />
          ) : null}
        </span>
      }
      subtitle={professional.email}
      actionsLabel={t("calendar.collaborators.actionsOf", { name: professional.name })}
      actions={[
        {
          label: t("calendar.collaborators.edit.action"),
          icon: <Pencil />,
          onSelect: onOpen,
        },
        {
          label: t("calendar.collaborators.delete.action"),
          icon: <Trash2 />,
          destructive: true,
          separatorBefore: true,
          onSelect: onDelete,
        },
      ]}
      footer={
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <p className="tabular-nums">{counts.join(" · ")}</p>
          {professional.phone ? (
            <p className="flex items-center gap-1.5 tabular-nums">
              <Phone aria-hidden className="size-3.5 shrink-0" />
              {formatPhone(professional.phone)}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-status-warning">
              <PhoneOff aria-hidden className="size-3.5 shrink-0" />
              {t("calendar.collaborators.noPhone")}
            </p>
          )}
        </div>
      }
    >
      <WeekSummary
        days={normalizeWeek(professional.rule?.days)}
        emptyLabel={t("calendar.collaborators.noWeek")}
      />
    </AreaCard>
  )
}
