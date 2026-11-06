import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Building2, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { PeopleAreaNav } from "@/components/people/area-nav"
import { EntityCard } from "@/components/shared/entity-card"
import { TeamPanel } from "@/components/people/team-panel"
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  FilterBar,
  PageBody,
  PageHeader,
  SegmentedControl,
  SortMenu,
  StatusBadge,
  TablePagination,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { usePeople } from "@/hooks/people/use-people"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { useTeamMutations, useTeams } from "@/hooks/people/use-teams"
import { apiAssetUrl } from "@/lib/api"
import { useLanguage } from "@/lib/i18n"
import { errorMessage } from "@/lib/people/error-message"
import type { Team } from "@/lib/people/types"
import { matchesSearch } from "@/lib/search-text"

type StatusFilter = "all" | "active" | "inactive"
type SortOrder = "name-asc" | "name-desc" | "people-desc"

const PAGE_SIZE = 24
const MAX_NAMES_ON_CARD = 3

type PanelState = { kind: "closed" } | { kind: "new" } | { kind: "edit"; id: string }

export default function TeamsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { teams, error, isLoading, reload } = useTeams()
  const { people } = usePeople()
  const { updateTeam, deleteTeam } = useTeamMutations()

  // Criar não fecha o painel: ele passa a ser o do departamento novo, sem trocar de instância.
  const [panel, setPanel] = useState<PanelState>({ kind: "closed" })
  const panelOpen = panel.kind !== "closed"
  const panelKey = useOpenCount(panelOpen)
  const shownPanel = useRetained(panelOpen ? panel : null)
  const editing =
    shownPanel?.kind === "edit"
      ? (teams?.find((team) => team.id === shownPanel.id) ?? null)
      : null
  // Excluiu: o departamento sai da lista, e o painel ainda precisa dele para animar a saída.
  const lastEdited = useRetained(editing)
  const shownTeam = shownPanel?.kind === "edit" ? lastEdited : null

  const openNew = () => setPanel({ kind: "new" })

  /* ---------- filtros ---------- */

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<SortOrder>("name-asc")
  const [page, setPage] = useState(1)

  const clearFilters = () => {
    setQuery("")
    setStatus("all")
    setPage(1)
  }

  const membersByTeam = useMemo(() => {
    const members = new Map<string, { id: string; name: string; src: string | null }[]>()
    for (const person of people ?? []) {
      if (person.revokedAt) continue
      for (const teamId of person.teamIds) {
        const list = members.get(teamId) ?? []
        list.push({
          id: person.id,
          name: person.name,
          src: person.avatarUrl ? apiAssetUrl(person.avatarUrl) : null,
        })
        members.set(teamId, list)
      }
    }
    return members
  }, [people])

  const visible = useMemo(() => {
    const matching = (teams ?? []).filter((team) => {
      if (status === "active" && !team.active) return false
      if (status === "inactive" && team.active) return false
      return !query || matchesSearch(team.name, query)
    })
    return [...matching].sort((a, b) => {
      if (sort === "people-desc") {
        return b.accountsCount - a.accountsCount || a.name.localeCompare(b.name, language)
      }
      const order = a.name.localeCompare(b.name, language)
      return sort === "name-asc" ? order : -order
    })
  }, [language, query, sort, status, teams])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const isFiltered = Boolean(query) || status !== "all"

  /* ---------- ações ---------- */

  async function toggleActive(team: Team) {
    try {
      await updateTeam(team.id, { active: !team.active })
      toast.success(
        t(team.active ? "people.teams.deactivated" : "people.teams.activated", { name: team.name })
      )
    } catch (cause) {
      toast.error(errorMessage(t, cause))
    }
  }

  async function remove(team: Team) {
    const confirmed = await confirm({
      title: t("people.teams.delete.title", { name: team.name }),
      description: t("people.teams.delete.description", { count: team.accountsCount }),
      confirmLabel: t("people.teams.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteTeam(team.id),
    })
    if (confirmed) {
      setPanel({ kind: "closed" })
      toast.success(t("people.teams.delete.done", { name: team.name }))
    }
  }

  const peopleLabel = (count: number) =>
    count === 0 ? t("people.teams.noMembers") : t("people.teams.memberCount", { count })

  /** "Camila Rocha e Thiago Almeida": quem está lá, sem precisar abrir o departamento. */
  const memberNames = (teamId: string) => {
    const names = (membersByTeam.get(teamId) ?? []).map((member) => member.name)
    if (names.length === 0) return null
    const shown = names.slice(0, MAX_NAMES_ON_CARD)
    const hidden = names.length - shown.length
    return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
      hidden > 0 ? [...shown, t("people.teams.moreMembers", { count: hidden })] : shown
    )
  }

  return (
    <PageBody>
      <PeopleAreaNav />
      <PageHeader
        description={t("people.teams.description")}
        actions={
          <Button onClick={openNew} className="pointer-coarse:h-10">
            <Plus />
            {t("people.teams.create.action")}
          </Button>
        }
        // O rótulo inteiro não cabe ao lado do título em 390 px, e cortaria o título.
        mobileActions={
          <Button
            onClick={openNew}
            aria-label={t("people.teams.create.action")}
            className="pointer-coarse:h-10"
          >
            <Plus />
            {t("people.teams.create.mobileAction")}
          </Button>
        }
        mobilePlacement="inline"
      />

      {error && !teams ? (
        <ErrorState error={error} onRetry={reload} />
      ) : isLoading ? (
        <CardGridSkeleton cards={6} />
      ) : (teams?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title={t("people.teams.empty.title")}
          description={t("people.teams.empty.description")}
          action={{ label: t("people.teams.create.action"), onClick: openNew }}
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
              placeholder: t("people.teams.search"),
            }}
            activeCount={status === "all" ? 0 : 1}
            onClear={clearFilters}
            sort={
              <SortMenu
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name-asc", label: t("people.teams.sort.nameAsc") },
                  { value: "name-desc", label: t("people.teams.sort.nameDesc") },
                  { value: "people-desc", label: t("people.teams.sort.peopleDesc") },
                ]}
              />
            }
            actions={
              <SegmentedControl
                aria-label={t("people.teams.filters.status")}
                value={status}
                onChange={(value) => {
                  setStatus(value)
                  setPage(1)
                }}
                options={[
                  { value: "all", label: t("people.teams.filters.all") },
                  { value: "active", label: t("people.teams.filters.active") },
                  { value: "inactive", label: t("people.teams.filters.inactive") },
                ]}
              />
            }
          />

          {visible.length === 0 ? (
            <EmptyState
              title={t("people.teams.noResults.title")}
              description={t("people.teams.noResults.description")}
              action={
                isFiltered ? { label: t("people.common.clearFilters"), onClick: clearFilters } : undefined
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((team) => (
                <li key={team.id}>
                  <EntityCard
                    title={team.name}
                    muted={!team.active}
                    badge={
                      team.active ? null : (
                        <StatusBadge tone="neutral">{t("people.teams.inactive")}</StatusBadge>
                      )
                    }
                    description={memberNames(team.id)}
                    people={membersByTeam.get(team.id) ?? []}
                    peopleLabel={peopleLabel(team.accountsCount)}
                    onOpen={() => setPanel({ kind: "edit", id: team.id })}
                    actionsLabel={t("people.teams.actionsOf", { name: team.name })}
                    actions={[
                      {
                        label: t("people.teams.actions.edit"),
                        icon: <Pencil />,
                        onSelect: () => setPanel({ kind: "edit", id: team.id }),
                      },
                      {
                        label: team.active
                          ? t("people.teams.actions.deactivate")
                          : t("people.teams.actions.activate"),
                        icon: <Power />,
                        onSelect: () => void toggleActive(team),
                      },
                      {
                        label: t("people.teams.delete.action"),
                        icon: <Trash2 />,
                        destructive: true,
                        separatorBefore: true,
                        onSelect: () => void remove(team),
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
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
        <TeamPanel
          key={panelKey}
          team={shownTeam}
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) setPanel({ kind: "closed" })
          }}
          onCreated={(team) => setPanel({ kind: "edit", id: team.id })}
          onDelete={(team) => void remove(team)}
        />
      ) : null}
    </PageBody>
  )
}
