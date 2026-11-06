import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { motion } from "motion/react"
import { AlertTriangle, CalendarCog, ClipboardList, Plus, Users } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { useCalendarArea } from "@/components/calendar/area/area-context"
import { isBroken, sharesOf } from "@/components/calendar/area/distribution"
import { ServiceCard } from "@/components/calendar/area/service-card"
import { ServicePanel } from "@/components/calendar/area/service-panel"
import {
  Callout,
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  FilterBar,
  PageHeader,
  SortMenu,
  TablePagination,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  useProfessionals,
  useServiceMutations,
  useServices,
} from "@/hooks/calendar/use-professionals"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import type { AgendaService } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch } from "@/lib/search-text"

type SortOrder = "name-asc" | "name-desc" | "duration-asc" | "duration-desc"
type PanelState = { kind: "closed" } | { kind: "new" } | { kind: "edit"; id: string }

const PAGE_SIZE = 24

/** Os serviços do calendário: o que dá para marcar, quanto tempo leva e quem atende. */
export default function ServicesPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const preset = useMotionPreset()
  const { calendar } = useCalendarArea()
  const {
    services,
    error: servicesError,
    isLoading: loadingServices,
    reload: reloadServices,
  } = useServices(calendar.id)
  const {
    professionals: loadedProfessionals,
    error: professionalsError,
    isLoading: loadingProfessionals,
    reload: reloadProfessionals,
  } = useProfessionals(calendar.id)
  const { deleteService } = useServiceMutations(calendar.id)

  const professionals = useMemo(() => loadedProfessionals ?? [], [loadedProfessionals])
  const isClassGroupCalendar = calendar.calendarType === "class_group"
  // A API só aceita serviço com distribuição somando 100, e isso exige alguém para atender.
  const canCreate = professionals.length > 0

  const [panel, setPanel] = useState<PanelState>({ kind: "closed" })
  const panelOpen = panel.kind !== "closed"
  const panelKey = useOpenCount(panelOpen)
  const shownPanel = useRetained(panelOpen ? panel : null)
  const editing =
    shownPanel?.kind === "edit"
      ? (services?.find((service) => service.id === shownPanel.id) ?? null)
      : null
  const lastEdited = useRetained(editing)
  const shownService = shownPanel?.kind === "edit" ? lastEdited : null

  const openNew = () => setPanel({ kind: "new" })

  const [query, setQuery] = useState("")
  const [brokenRequested, setBrokenRequested] = useState(false)
  const [sort, setSort] = useState<SortOrder>("name-asc")
  const [page, setPage] = useState(1)

  const clearFilters = () => {
    setQuery("")
    setBrokenRequested(false)
    setPage(1)
  }

  const brokenCount = useMemo(
    () =>
      (services ?? []).filter((service) => isBroken(service.distribution, professionals)).length,
    [professionals, services]
  )
  // Consertou o último: o filtro some junto com o recado, para a lista não ficar vazia à toa.
  const onlyBroken = brokenRequested && brokenCount > 0

  const visible = useMemo(() => {
    const matching = (services ?? []).filter((service) => {
      if (onlyBroken && !isBroken(service.distribution, professionals)) return false
      if (!query) return true
      return [
        service.name,
        service.description,
        service.externalId,
        service.id,
        String(service.duration),
        ...sharesOf(service.distribution, professionals).map(
          ({ professional }) => professional.name
        ),
      ].some((text) => text && matchesSearch(text, query))
    })
    return [...matching].sort((a, b) => {
      if (sort === "duration-asc") return a.duration - b.duration
      if (sort === "duration-desc") return b.duration - a.duration
      const order = a.name.localeCompare(b.name, language)
      return sort === "name-asc" ? order : -order
    })
  }, [language, onlyBroken, professionals, query, services, sort])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  async function remove(service: AgendaService) {
    const confirmed = await confirm({
      title: t("calendar.services.delete.title", { name: service.name }),
      description: t("calendar.services.delete.description"),
      confirmLabel: t("calendar.services.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteService(service.id),
    })
    if (confirmed) {
      setPanel({ kind: "closed" })
      toast.success(t("calendar.services.delete.done", { name: service.name }))
    }
  }

  const error = (!services && servicesError) || (!loadedProfessionals && professionalsError)
  const isLoading = loadingServices || loadingProfessionals
  const noServices = (services?.length ?? 0) === 0

  return (
    <>
      <PageHeader
        description={t("calendar.services.description")}
        actions={
          canCreate ? (
            <Button onClick={openNew} className="pointer-coarse:h-10">
              <Plus />
              {t("calendar.services.create.action")}
            </Button>
          ) : undefined
        }
        mobileActions={
          canCreate ? (
            <Button
              onClick={openNew}
              aria-label={t("calendar.services.create.action")}
              className="pointer-coarse:h-10"
            >
              <Plus />
              {t("calendar.services.create.mobileAction")}
            </Button>
          ) : undefined
        }
        mobilePlacement="inline"
      />

      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void reloadServices()
            void reloadProfessionals()
          }}
        />
      ) : isLoading ? (
        <CardGridSkeleton cards={6} />
      ) : noServices && !canCreate ? (
        isClassGroupCalendar ? (
          <EmptyState
            icon={<CalendarCog className="size-5" />}
            title={t("calendar.services.classGroupCalendar.title")}
            description={t("calendar.services.classGroupCalendar.description")}
            action={{
              label: t("calendar.services.classGroupCalendar.open"),
              onClick: () => navigate(`/calendar/${calendar.id}/class-groups`),
            }}
          />
        ) : (
          <EmptyState
            icon={<Users className="size-5" />}
            title={t("calendar.services.noCollaborators.title")}
            description={t("calendar.services.noCollaborators.description")}
            action={{
              label: t("calendar.services.noCollaborators.open"),
              onClick: () => navigate(`/calendar/${calendar.id}/collaborators`),
            }}
          />
        )
      ) : noServices ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title={t("calendar.services.empty.title")}
          description={t("calendar.services.empty.description")}
          action={{ label: t("calendar.services.create.action"), onClick: openNew }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {!canCreate ? (
            <Callout
              tone="warning"
              role="status"
              icon={<AlertTriangle />}
              title={
                isClassGroupCalendar
                  ? t("calendar.services.noCollaborators.classGroupTitle")
                  : t("calendar.services.noCollaborators.title")
              }
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-10"
                  onClick={() =>
                    navigate(
                      `/calendar/${calendar.id}/${isClassGroupCalendar ? "class-groups" : "collaborators"}`
                    )
                  }
                >
                  {isClassGroupCalendar
                    ? t("calendar.services.classGroupCalendar.open")
                    : t("calendar.services.noCollaborators.open")}
                </Button>
              }
            >
              {isClassGroupCalendar
                ? t("calendar.services.noCollaborators.classGroupDescription")
                : t("calendar.services.noCollaborators.description")}
            </Callout>
          ) : brokenCount > 0 ? (
            <Callout
              tone="warning"
              role="status"
              icon={<AlertTriangle />}
              title={t("calendar.services.brokenNotice.title", { count: brokenCount })}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-10"
                  onClick={() => {
                    setBrokenRequested(!onlyBroken)
                    setPage(1)
                  }}
                >
                  {onlyBroken
                    ? t("calendar.services.brokenNotice.showAll")
                    : t("calendar.services.brokenNotice.showBroken")}
                </Button>
              }
            >
              {t("calendar.services.brokenNotice.description")}
            </Callout>
          ) : null}

          <FilterBar
            search={{
              value: query,
              onChange: (value) => {
                setQuery(value)
                setPage(1)
              },
              debounce: 0,
              placeholder: t("calendar.services.search"),
            }}
            activeCount={onlyBroken ? 1 : 0}
            onClear={clearFilters}
            resultLabel={t("calendar.services.count", { count: visible.length })}
            sort={
              <SortMenu
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name-asc", label: t("calendar.services.sort.nameAsc") },
                  { value: "name-desc", label: t("calendar.services.sort.nameDesc") },
                  { value: "duration-asc", label: t("calendar.services.sort.durationAsc") },
                  { value: "duration-desc", label: t("calendar.services.sort.durationDesc") },
                ]}
              />
            }
          />

          {visible.length === 0 ? (
            <EmptyState
              title={t("calendar.services.noResults.title")}
              description={t("calendar.services.noResults.description")}
              action={{ label: t("calendar.schedule.clearSearch"), onClick: clearFilters }}
            />
          ) : (
            <motion.ul {...preset.stagger} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((service) => (
                <motion.li key={service.id} variants={preset.staggerItem}>
                  <ServiceCard
                    service={service}
                    professionals={professionals}
                    onOpen={() => setPanel({ kind: "edit", id: service.id })}
                    onDelete={() => void remove(service)}
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
        <ServicePanel
          key={panelKey}
          calendar={calendar}
          service={shownService}
          professionals={professionals}
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) setPanel({ kind: "closed" })
          }}
          onDelete={(service) => void remove(service)}
        />
      ) : null}
    </>
  )
}
