import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { motion } from "motion/react"
import { Plus, Users } from "lucide-react"
import { useNavigate } from "@/lib/router"
import { toast } from "sonner"

import { useCalendarArea } from "@/components/calendar/area/area-context"
import { CollaboratorCard } from "@/components/calendar/area/collaborator-card"
import { CollaboratorPanel } from "@/components/calendar/area/collaborator-panel"
import {
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
  useProfessionalMutations,
  useProfessionals,
  useServices,
} from "@/hooks/calendar/use-professionals"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import type { Professional } from "@/lib/calendar/types"
import { onlyDigits } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch } from "@/lib/search-text"

type SortOrder = "name-asc" | "name-desc" | "services-desc"
type PanelState = { kind: "closed" } | { kind: "new" } | { kind: "edit"; id: string }

const PAGE_SIZE = 24

function matches(professional: Professional, query: string): boolean {
  const digits = onlyDigits(query)
  if (digits && professional.phone?.includes(digits)) return true
  return [
    professional.name,
    professional.email,
    professional.phone,
    professional.externalId,
    professional.color,
    professional.id,
  ].some((text) => text && matchesSearch(text, query))
}

/** Quem atende neste calendário, e os horários de cada um. */
export default function CollaboratorsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const preset = useMotionPreset()
  const { calendar } = useCalendarArea()
  const { professionals, error, isLoading, reload } = useProfessionals(calendar.id)
  const { services } = useServices(calendar.id)
  const { deleteProfessional } = useProfessionalMutations(calendar.id)

  const [panel, setPanel] = useState<PanelState>({ kind: "closed" })
  const panelOpen = panel.kind !== "closed"
  const panelKey = useOpenCount(panelOpen)
  const shownPanel = useRetained(panelOpen ? panel : null)
  const editing =
    shownPanel?.kind === "edit"
      ? (professionals?.find((item) => item.id === shownPanel.id) ?? null)
      : null
  // Excluiu: ele sai da lista, e o painel ainda precisa dele para animar a saída.
  const lastEdited = useRetained(editing)
  const shownProfessional = shownPanel?.kind === "edit" ? lastEdited : null

  const openNew = () => setPanel({ kind: "new" })

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortOrder>("name-asc")
  const [page, setPage] = useState(1)

  const visible = useMemo(() => {
    const matching = (professionals ?? []).filter((item) => !query || matches(item, query))
    return [...matching].sort((a, b) => {
      if (sort === "services-desc") {
        return b.serviceIds.length - a.serviceIds.length || a.name.localeCompare(b.name, language)
      }
      const order = a.name.localeCompare(b.name, language)
      return sort === "name-asc" ? order : -order
    })
  }, [language, professionals, query, sort])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const clearFilters = () => {
    setQuery("")
    setPage(1)
  }

  async function remove(professional: Professional) {
    const affected = (services ?? []).filter(
      (service) => (service.distribution[professional.id] ?? 0) > 0
    )
    const confirmed = await confirm({
      title: t("calendar.collaborators.delete.title", { name: professional.name }),
      description:
        affected.length > 0
          ? t("calendar.collaborators.delete.descriptionWithServices", {
              services: new Intl.ListFormat(language, {
                style: "long",
                type: "conjunction",
              }).format(affected.map((service) => service.name)),
              count: affected.length,
            })
          : t("calendar.collaborators.delete.description"),
      confirmLabel: t("calendar.collaborators.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteProfessional(professional.id),
    })
    if (!confirmed) return

    setPanel({ kind: "closed" })
    if (affected.length > 0) {
      toast.success(t("calendar.collaborators.delete.done", { name: professional.name }), {
        description: t("calendar.collaborators.delete.doneHint", { count: affected.length }),
        action: {
          label: t("calendar.collaborators.delete.openServices"),
          onClick: () => navigate(`/calendar/${calendar.id}/services`),
        },
      })
    } else {
      toast.success(t("calendar.collaborators.delete.done", { name: professional.name }))
    }
  }

  function announceCreated(created: Professional) {
    toast.success(t("calendar.collaborators.create.done", { name: created.name }), {
      description: t("calendar.collaborators.create.doneHint"),
      action: {
        label: t("calendar.collaborators.create.openServices"),
        onClick: () => navigate(`/calendar/${calendar.id}/services`),
      },
    })
  }

  return (
    <>
      <PageHeader
        description={t("calendar.collaborators.description")}
        actions={
          <Button onClick={openNew} className="pointer-coarse:h-10">
            <Plus />
            {t("calendar.collaborators.create.action")}
          </Button>
        }
        // O rótulo inteiro não cabe ao lado do título em 390 px, e cortaria o título.
        mobileActions={
          <Button
            onClick={openNew}
            aria-label={t("calendar.collaborators.create.action")}
            className="pointer-coarse:h-10"
          >
            <Plus />
            {t("calendar.collaborators.create.mobileAction")}
          </Button>
        }
        mobilePlacement="inline"
      />

      {error && !professionals ? (
        <ErrorState error={error} onRetry={reload} />
      ) : isLoading ? (
        <CardGridSkeleton cards={6} />
      ) : (professionals?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title={t("calendar.collaborators.empty.title")}
          description={t("calendar.collaborators.empty.description")}
          action={{ label: t("calendar.collaborators.create.action"), onClick: openNew }}
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
              placeholder: t("calendar.collaborators.search"),
            }}
            onClear={clearFilters}
            resultLabel={t("calendar.collaborators.count", { count: visible.length })}
            sort={
              <SortMenu
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name-asc", label: t("calendar.collaborators.sort.nameAsc") },
                  { value: "name-desc", label: t("calendar.collaborators.sort.nameDesc") },
                  { value: "services-desc", label: t("calendar.collaborators.sort.servicesDesc") },
                ]}
              />
            }
          />

          {visible.length === 0 ? (
            <EmptyState
              title={t("calendar.collaborators.noResults.title")}
              description={t("calendar.collaborators.noResults.description")}
              action={{ label: t("calendar.schedule.clearSearch"), onClick: clearFilters }}
            />
          ) : (
            <motion.ul {...preset.stagger} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((professional) => (
                <motion.li key={professional.id} variants={preset.staggerItem}>
                  <CollaboratorCard
                    professional={professional}
                    onOpen={() => setPanel({ kind: "edit", id: professional.id })}
                    onDelete={() => void remove(professional)}
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
        <CollaboratorPanel
          key={panelKey}
          calendar={calendar}
          professional={shownProfessional}
          professionals={professionals ?? []}
          services={services ?? []}
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) setPanel({ kind: "closed" })
          }}
          onDelete={(professional) => void remove(professional)}
          onCreated={announceCreated}
        />
      ) : null}
    </>
  )
}
