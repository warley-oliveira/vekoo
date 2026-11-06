import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { motion } from "motion/react"
import { GraduationCap, Plus } from "lucide-react"
import { toast } from "sonner"
import { useSWRConfig } from "swr"

import { useCalendarArea } from "@/components/calendar/area/area-context"
import { areaErrorMessage } from "@/components/calendar/area/area-errors"
import { ClassGroupCard } from "@/components/calendar/area/class-group-card"
import { ClassGroupPanel } from "@/components/calendar/area/class-group-panel"
import { EnrollmentsPanel } from "@/components/calendar/area/enrollments-panel"
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  PageHeader,
  SortMenu,
  TablePagination,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useClassGroupMutations, useClassGroups } from "@/hooks/calendar/use-class-groups"
import { useChannel } from "@/hooks/use-channel"
import { useDebouncedCallback } from "@/hooks/use-debounced-value"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import type { AgendaChannelMessage, ClassGroup } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch } from "@/lib/search-text"

type SortOrder = "name-asc" | "name-desc" | "enrolled-desc" | "start-asc"
type PanelState = { kind: "closed" } | { kind: "new" } | { kind: "edit"; id: string }

const PAGE_SIZE = 24

/** As turmas do calendário: horários que se repetem, com gente inscrita. */
export default function ClassGroupsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const preset = useMotionPreset()
  const { mutate } = useSWRConfig()
  const { calendar } = useCalendarArea()
  const { classGroups, error, isLoading, reload } = useClassGroups(calendar.id)
  const { updateClassGroup, deleteClassGroup } = useClassGroupMutations(calendar.id)

  const [panel, setPanel] = useState<PanelState>({ kind: "closed" })
  const panelOpen = panel.kind !== "closed"
  const panelKey = useOpenCount(panelOpen)
  const shownPanel = useRetained(panelOpen ? panel : null)
  const editing =
    shownPanel?.kind === "edit"
      ? (classGroups?.find((group) => group.id === shownPanel.id) ?? null)
      : null
  const lastEdited = useRetained(editing)
  const shownClassGroup = shownPanel?.kind === "edit" ? lastEdited : null

  const [enrollmentsId, setEnrollmentsId] = useState<string | null>(null)
  const enrollmentsOpen = enrollmentsId !== null
  const enrollmentsKey = useOpenCount(enrollmentsOpen)
  const enrollmentsGroup = useRetained(
    enrollmentsId ? classGroups?.find((group) => group.id === enrollmentsId) : null
  )

  const openNew = () => setPanel({ kind: "new" })

  // Outra pessoa inscreveu alguém, ou foi a automação: os números da tela andam junto.
  const revalidateSoon = useDebouncedCallback(() => {
    void mutate(
      (key) => typeof key === "string" && key.startsWith(`/calendars/${calendar.id}/class-groups`)
    )
  }, 800)
  useChannel<AgendaChannelMessage>("AgendaChannel", undefined, (message) => {
    if (
      message.action === "enrollment_update" &&
      classGroups?.some((group) => group.id === message.classGroupId)
    ) {
      revalidateSoon()
    }
  })

  /* ---------- filtros ---------- */

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<string[]>([])
  const [visibility, setVisibility] = useState<string[]>([])
  const [sort, setSort] = useState<SortOrder>("name-asc")
  const [page, setPage] = useState(1)

  const clearFilters = () => {
    setQuery("")
    setStatus([])
    setVisibility([])
    setPage(1)
  }

  const counts = useMemo(() => {
    const list = classGroups ?? []
    const active = list.filter((group) => group.active).length
    const visible = list.filter((group) => group.visible).length
    return { active, inactive: list.length - active, visible, hidden: list.length - visible }
  }, [classGroups])

  const visible = useMemo(() => {
    const matching = (classGroups ?? []).filter((group) => {
      if (status.length > 0 && !status.includes(group.active ? "active" : "inactive")) return false
      if (visibility.length > 0 && !visibility.includes(group.visible ? "visible" : "hidden")) {
        return false
      }
      if (!query) return true
      return [
        group.name,
        group.description,
        group.instructorName,
        group.location,
        group.room,
        group.address,
        group.category,
        group.externalId,
        ...group.tags,
      ].some((text) => text && matchesSearch(text, query))
    })
    return [...matching].sort((a, b) => {
      if (sort === "enrolled-desc") {
        return b.activeEnrollmentCount - a.activeEnrollmentCount || a.name.localeCompare(b.name, language)
      }
      if (sort === "start-asc") {
        return (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || a.name.localeCompare(b.name, language)
      }
      const order = a.name.localeCompare(b.name, language)
      return sort === "name-asc" ? order : -order
    })
  }, [classGroups, language, query, sort, status, visibility])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const activeFilters = (status.length > 0 ? 1 : 0) + (visibility.length > 0 ? 1 : 0)
  const isFiltered = Boolean(query) || activeFilters > 0

  /* ---------- ações ---------- */

  async function toggleActive(group: ClassGroup) {
    try {
      await updateClassGroup(group.id, { active: !group.active })
      toast.success(
        t(
          group.active
            ? "calendar.classGroups.status.deactivated"
            : "calendar.classGroups.status.activated",
          { name: group.name }
        )
      )
    } catch (cause) {
      toast.error(areaErrorMessage(t, cause))
    }
  }

  async function toggleVisible(group: ClassGroup) {
    try {
      await updateClassGroup(group.id, { visible: !group.visible })
      toast.success(
        t(group.visible ? "calendar.classGroups.status.hidden_done" : "calendar.classGroups.status.shown_done", {
          name: group.name,
        })
      )
    } catch (cause) {
      toast.error(areaErrorMessage(t, cause))
    }
  }

  async function remove(group: ClassGroup) {
    const confirmed = await confirm({
      title: t("calendar.classGroups.delete.title", { name: group.name }),
      description: t("calendar.classGroups.delete.description", {
        count: group.activeEnrollmentCount,
      }),
      confirmLabel: t("calendar.classGroups.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteClassGroup(group.id),
    })
    if (confirmed) {
      setPanel({ kind: "closed" })
      setEnrollmentsId(null)
      toast.success(t("calendar.classGroups.delete.done", { name: group.name }))
    }
  }

  function announceCreated(created: ClassGroup) {
    toast.success(t("calendar.classGroups.create.done", { name: created.name }), {
      action: {
        label: t("calendar.classGroups.create.enroll"),
        onClick: () => setEnrollmentsId(created.id),
      },
    })
  }

  return (
    <>
      <PageHeader
        description={t("calendar.classGroups.description")}
        actions={
          <Button onClick={openNew} className="pointer-coarse:h-10">
            <Plus />
            {t("calendar.classGroups.create.action")}
          </Button>
        }
        mobileActions={
          <Button
            onClick={openNew}
            aria-label={t("calendar.classGroups.create.action")}
            className="pointer-coarse:h-10"
          >
            <Plus />
            {t("calendar.classGroups.create.mobileAction")}
          </Button>
        }
        mobilePlacement="inline"
      />

      {error && !classGroups ? (
        <ErrorState error={error} onRetry={reload} />
      ) : isLoading ? (
        <CardGridSkeleton cards={6} />
      ) : (classGroups?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-5" />}
          title={t("calendar.classGroups.empty.title")}
          description={t("calendar.classGroups.empty.description")}
          action={{ label: t("calendar.classGroups.create.action"), onClick: openNew }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <FilterBar
            search={{
              value: query,
              onChange: (value) => {
                setQuery(value)
                setPage(1)
              },
              debounce: 0,
              placeholder: t("calendar.classGroups.search"),
            }}
            activeCount={activeFilters}
            onClear={clearFilters}
            resultLabel={t("calendar.classGroups.count", { count: visible.length })}
            filters={
              <>
                <FacetedFilter
                  title={t("calendar.classGroups.filters.status")}
                  options={[
                    {
                      value: "active",
                      label: t("calendar.classGroups.filters.active"),
                      count: counts.active,
                    },
                    {
                      value: "inactive",
                      label: t("calendar.classGroups.filters.inactive"),
                      count: counts.inactive,
                    },
                  ]}
                  value={status}
                  onChange={(next) => {
                    setStatus(next)
                    setPage(1)
                  }}
                />
                <FacetedFilter
                  title={t("calendar.classGroups.filters.visibility")}
                  options={[
                    {
                      value: "visible",
                      label: t("calendar.classGroups.filters.visible"),
                      count: counts.visible,
                    },
                    {
                      value: "hidden",
                      label: t("calendar.classGroups.filters.hidden"),
                      count: counts.hidden,
                    },
                  ]}
                  value={visibility}
                  onChange={(next) => {
                    setVisibility(next)
                    setPage(1)
                  }}
                />
              </>
            }
            sort={
              <SortMenu
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name-asc", label: t("calendar.classGroups.sort.nameAsc") },
                  { value: "name-desc", label: t("calendar.classGroups.sort.nameDesc") },
                  { value: "enrolled-desc", label: t("calendar.classGroups.sort.enrolledDesc") },
                  { value: "start-asc", label: t("calendar.classGroups.sort.startAsc") },
                ]}
              />
            }
          />

          {visible.length === 0 ? (
            <EmptyState
              title={t("calendar.classGroups.noResults.title")}
              description={t("calendar.classGroups.noResults.description")}
              action={
                isFiltered
                  ? { label: t("calendar.classGroups.noResults.clear"), onClick: clearFilters }
                  : undefined
              }
            />
          ) : (
            <motion.ul {...preset.stagger} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((group) => (
                <motion.li key={group.id} variants={preset.staggerItem}>
                  <ClassGroupCard
                    classGroup={group}
                    onOpen={() => setPanel({ kind: "edit", id: group.id })}
                    onEnrollments={() => setEnrollmentsId(group.id)}
                    onToggleActive={() => void toggleActive(group)}
                    onToggleVisible={() => void toggleVisible(group)}
                    onDelete={() => void remove(group)}
                  />
                </motion.li>
              ))}
            </motion.ul>
          )}

          {visible.length > PAGE_SIZE ? (
            <TablePagination
              page={currentPage}
              totalPages={totalPages}
              total={visible.length}
              perPage={PAGE_SIZE}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}

      {shownPanel ? (
        <ClassGroupPanel
          key={panelKey}
          calendar={calendar}
          classGroup={shownClassGroup}
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) setPanel({ kind: "closed" })
          }}
          onDelete={(group) => void remove(group)}
          onEnrollments={(group) => {
            setPanel({ kind: "closed" })
            setEnrollmentsId(group.id)
          }}
          onCreated={announceCreated}
        />
      ) : null}

      {enrollmentsGroup ? (
        <EnrollmentsPanel
          key={`enrollments-${enrollmentsKey}`}
          calendarId={calendar.id}
          classGroup={enrollmentsGroup}
          open={enrollmentsOpen}
          onOpenChange={(open) => {
            if (!open) setEnrollmentsId(null)
          }}
          onEdit={(group) => {
            setEnrollmentsId(null)
            setPanel({ kind: "edit", id: group.id })
          }}
        />
      ) : null}
    </>
  )
}
