import { useTranslation } from "react-i18next"
import { Eye, EyeOff, Pencil, Power, Trash2, Users } from "lucide-react"

import { Money, StatusBadge, TagChip } from "@/components/shared"
import { Button } from "@/components/ui/button"
import type { ClassGroup } from "@/lib/calendar/types"
import { AreaCard } from "./area-card"
import { OccupancyBar } from "./occupancy-bar"
import { normalizeWeek } from "./week-schedule"
import { WeekSummary } from "./week-summary"

/** Uma turma: quando acontece, com quem, onde e quantas vagas ainda tem. */
export function ClassGroupCard({
  classGroup,
  onOpen,
  onEnrollments,
  onToggleActive,
  onToggleVisible,
  onDelete,
}: {
  classGroup: ClassGroup
  onOpen: () => void
  onEnrollments: () => void
  onToggleActive: () => void
  onToggleVisible: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const active = classGroup.activeEnrollmentCount
  const max = classGroup.maxStudents
  const seats = max
    ? t("calendar.classGroups.seats.count", { count: max, active })
    : t("calendar.classGroups.seats.undefined", { count: active })

  const place = [classGroup.room, classGroup.location].filter(Boolean).join(", ")
  const details = [classGroup.instructorName, place].filter(Boolean).join(" · ")

  return (
    <AreaCard
      title={classGroup.name}
      muted={!classGroup.active}
      onOpen={onOpen}
      leading={
        <span
          aria-hidden
          // Cor escolhida pela pessoa: a mesma das aulas na grade do calendário.
          style={{ backgroundColor: classGroup.color ?? undefined }}
          className="mt-1.5 block size-3 rounded-full bg-muted-foreground"
        />
      }
      subtitle={classGroup.category}
      badges={
        !classGroup.active || !classGroup.visible ? (
          <>
            {!classGroup.active ? (
              <StatusBadge tone="neutral">{t("calendar.classGroups.status.inactive")}</StatusBadge>
            ) : null}
            {!classGroup.visible ? (
              <StatusBadge tone="neutral" icon={<EyeOff />}>
                {t("calendar.classGroups.status.hidden")}
              </StatusBadge>
            ) : null}
          </>
        ) : null
      }
      actionsLabel={t("calendar.classGroups.actionsOf", { name: classGroup.name })}
      actions={[
        { label: t("calendar.classGroups.enrollments.open"), icon: <Users />, onSelect: onEnrollments },
        { label: t("calendar.classGroups.edit.action"), icon: <Pencil />, onSelect: onOpen },
        {
          label: classGroup.active
            ? t("calendar.classGroups.status.deactivate")
            : t("calendar.classGroups.status.activate"),
          icon: <Power />,
          onSelect: onToggleActive,
        },
        {
          label: classGroup.visible
            ? t("calendar.classGroups.status.hide")
            : t("calendar.classGroups.status.show"),
          icon: classGroup.visible ? <EyeOff /> : <Eye />,
          onSelect: onToggleVisible,
        },
        {
          label: t("calendar.classGroups.delete.action"),
          icon: <Trash2 />,
          destructive: true,
          separatorBefore: true,
          onSelect: onDelete,
        },
      ]}
      footer={
        <div className="flex flex-col gap-2">
          <OccupancyBar active={active} max={max} label={seats} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{seats}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="relative z-10 -mr-2 text-muted-foreground pointer-coarse:h-10"
              onClick={onEnrollments}
            >
              <Users />
              {t("calendar.classGroups.enrollments.open")}
            </Button>
          </div>
        </div>
      }
    >
      <WeekSummary
        days={normalizeWeek(classGroup.schedule)}
        emptyLabel={t("calendar.classGroups.noSchedule")}
      />
      {details ? <p className="text-sm text-pretty text-muted-foreground">{details}</p> : null}
      {classGroup.priceCents || classGroup.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {classGroup.priceCents ? (
            <Money
              cents={classGroup.priceCents}
              currency={classGroup.priceCurrency ?? undefined}
              className="mr-1 text-sm"
            />
          ) : null}
          {classGroup.tags.map((tag) => (
            <TagChip key={tag}>{tag}</TagChip>
          ))}
        </div>
      ) : null}
    </AreaCard>
  )
}
