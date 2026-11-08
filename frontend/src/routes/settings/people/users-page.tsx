import { useEffect, useMemo, useRef, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "@/lib/router"
import { Crown, Eye, Pencil, RotateCcw, UserPlus, UserX } from "lucide-react"

import { PeopleAreaNav } from "@/components/people/area-nav"
import { NewPersonPanel } from "@/components/people/new-person-panel"
import { PersonIdentity } from "@/components/people/person-identity"
import { PersonPanel } from "@/components/people/person-panel"
import {
  DataTable,
  EmptyState,
  FacetedFilter,
  FilterBar,
  PageBody,
  PageHeader,
  RelativeTime,
  SegmentedControl,
  StatusBadge,
  type RowAction,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAccessRoles, useRoleName } from "@/hooks/people/use-access-roles"
import { usePeople } from "@/hooks/people/use-people"
import { usePersonActions } from "@/hooks/people/use-person-actions"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { useTeams } from "@/hooks/people/use-teams"
import { useSession } from "@/lib/auth"
import { rulesFor } from "@/lib/people/person-rules"
import type { Person, Team } from "@/lib/people/types"
import { matchesSearch } from "@/lib/search-text"

type StatusFilter = "active" | "revoked"

/** Os filtros de grupo tratam "Dono" e "Sem grupo" como opções, porque é assim que se pergunta. */
const OWNER_FILTER = "owner"
const NO_GROUP_FILTER = "none"
const NO_TEAM_FILTER = "none"

function groupFilterValue(person: Person): string {
  if (person.role === "owner") return OWNER_FILTER
  return person.accessRoleId ?? NO_GROUP_FILTER
}

function teamNames(person: Person, teamsById: Map<string, Team>): string {
  return person.teamIds
    .map((id) => teamsById.get(id)?.name)
    .filter(Boolean)
    .join(", ")
}

export default function UsersPage() {
  const { t } = useTranslation()
  const { account: actor } = useSession()
  const { people, error, isLoading, reload } = usePeople()
  const { teams } = useTeams()
  const { roles } = useAccessRoles()
  const roleName = useRoleName()
  const { revoke, restore } = usePersonActions()

  /* ---------- painéis: o endereço diz o que está aberto, e dá para mandar o link ---------- */

  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get("person")
  const creating = searchParams.get("new") === "1"

  const openPerson = (id: string) =>
    setSearchParams(
      (current) => {
        current.delete("new")
        current.set("person", id)
        return current
      },
      { replace: true }
    )
  const openNew = () =>
    setSearchParams(
      (current) => {
        current.delete("person")
        current.set("new", "1")
        return current
      },
      { replace: true }
    )
  // Salvar pode terminar com a página já fora da tela: a pessoa foi para outra área, ou
  // acabou de perder o acesso a esta. Fechar o painel, então, a arrastaria de volta para cá.
  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const closePanels = () => {
    if (!isMounted.current) return
    setSearchParams(
      (current) => {
        current.delete("new")
        current.delete("person")
        return current
      },
      { replace: true }
    )
  }

  const selected = people?.find((person) => person.id === selectedId) ?? null
  const shownPerson = useRetained(selected)

  // Link para alguém que não existe mais: a tela segue, sem painel nenhum.
  useEffect(() => {
    if (selectedId && people && !selected) closePanels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, selected, selectedId])

  const personPanelKey = useOpenCount(Boolean(selected))
  const newPanelKey = useOpenCount(creating)

  /* ---------- filtros ---------- */

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("active")
  const [groups, setGroups] = useState<string[]>([])
  const [teamFilter, setTeamFilter] = useState<string[]>([])

  const clearFilters = () => {
    setQuery("")
    setGroups([])
    setTeamFilter([])
  }

  const teamsById = useMemo(
    () => new Map((teams ?? []).map((team) => [team.id, team])),
    [teams]
  )
  const rolesById = useMemo(
    () => new Map((roles ?? []).map((role) => [role.id, role])),
    [roles]
  )

  const inStatus = useMemo(
    () =>
      (people ?? []).filter((person) =>
        status === "active" ? !person.revokedAt : Boolean(person.revokedAt)
      ),
    [people, status]
  )

  const counts = useMemo(() => {
    const list = people ?? []
    const revoked = list.filter((person) => person.revokedAt).length
    return { active: list.length - revoked, revoked }
  }, [people])

  const groupOptions = useMemo(() => {
    const count = (value: string) =>
      inStatus.filter((person) => groupFilterValue(person) === value).length
    return [
      { value: OWNER_FILTER, label: t("people.users.access.owner"), count: count(OWNER_FILTER) },
      ...(roles ?? []).map((role) => ({
        value: role.id,
        label: roleName(role),
        count: count(role.id),
      })),
      {
        value: NO_GROUP_FILTER,
        label: t("people.users.access.none"),
        count: count(NO_GROUP_FILTER),
      },
    ]
  }, [inStatus, roleName, roles, t])

  const teamFilterOptions = useMemo(
    () => [
      ...(teams ?? []).map((team) => ({
        value: team.id,
        label: team.name,
        count: inStatus.filter((person) => person.teamIds.includes(team.id)).length,
      })),
      {
        value: NO_TEAM_FILTER,
        label: t("people.users.filters.noTeam"),
        count: inStatus.filter((person) => person.teamIds.length === 0).length,
      },
    ],
    [inStatus, t, teams]
  )

  const filtered = useMemo(
    () =>
      inStatus.filter((person) => {
        if (groups.length > 0 && !groups.includes(groupFilterValue(person))) return false
        if (teamFilter.length > 0) {
          const inTeam =
            person.teamIds.some((id) => teamFilter.includes(id)) ||
            (person.teamIds.length === 0 && teamFilter.includes(NO_TEAM_FILTER))
          if (!inTeam) return false
        }
        return !query || matchesSearch(`${person.name} ${person.email}`, query)
      }),
    [groups, inStatus, query, teamFilter]
  )

  const isFiltered = Boolean(query) || groups.length > 0 || teamFilter.length > 0

  /* ---------- tabela ---------- */

  const columns = useMemo<ColumnDef<Person, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("people.users.columns.person"),
        meta: {
          mobile: "primary",
          className: "min-w-64",
          sortLabels: {
            asc: t("people.users.sort.nameAsc"),
            desc: t("people.users.sort.nameDesc"),
          },
        },
        cell: ({ row }) => {
          const person = row.original
          return (
            <PersonIdentity
              name={person.name}
              email={person.email}
              avatarUrl={person.avatarUrl}
              badge={
                person.id === actor.id ? (
                  <StatusBadge tone="neutral" dot={false} className="font-normal">
                    {t("people.users.you")}
                  </StatusBadge>
                ) : null
              }
            />
          )
        },
      },
      {
        id: "access",
        accessorFn: (person) =>
          person.role === "owner"
            ? t("people.users.access.owner")
            : person.accessRoleId
              ? roleName(
                  rolesById.get(person.accessRoleId) ?? { name: "", defaultKey: null }
                )
              : t("people.users.access.none"),
        header: t("people.users.columns.access"),
        meta: { className: "w-56" },
        cell: ({ row, getValue }) => {
          const person = row.original
          const noGroup = person.role !== "owner" && !person.accessRoleId
          return (
            <div className="min-w-0 leading-tight">
              <p className={noGroup ? "text-muted-foreground" : undefined}>
                {person.role === "owner" ? (
                  <Crown className="mr-1.5 inline size-3.5 align-[-2px] text-muted-foreground" />
                ) : null}
                {/* Sem nome: a lista de grupos ainda não chegou. */}
                {getValue<string>() || t("kit.noValue")}
              </p>
              {person.setupOnly ? (
                <p className="text-xs text-muted-foreground">{t("people.users.setupOnlyShort")}</p>
              ) : null}
            </div>
          )
        },
      },
      {
        id: "teams",
        accessorFn: (person) => teamNames(person, teamsById),
        header: t("people.users.columns.teams"),
        enableSorting: false,
        meta: { className: "whitespace-normal w-64" },
        cell: ({ row, getValue }) => {
          const names = getValue<string>()
          if (names) return <span className="line-clamp-2">{names}</span>
          // Com departamentos e sem nomes: a lista deles ainda não chegou, e dizer "sem
          // departamento" seria mentira.
          return row.original.teamIds.length > 0 ? (
            <span aria-hidden className="text-muted-foreground">
              {t("kit.noValue")}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("people.users.noTeams")}</span>
          )
        },
      },
      status === "active"
        ? {
            accessorKey: "createdAt",
            header: t("people.users.columns.joined"),
            meta: {
              className: "w-36",
              mobile: "hidden",
              sortLabels: {
                asc: t("people.users.sort.joinedAsc"),
                desc: t("people.users.sort.joinedDesc"),
              },
            },
            cell: ({ row }) => (
              <RelativeTime value={row.original.createdAt} className="text-muted-foreground" />
            ),
          }
        : {
            accessorKey: "revokedAt",
            header: t("people.users.columns.revoked"),
            meta: {
              className: "w-36",
              sortLabels: {
                asc: t("people.users.sort.revokedAsc"),
                desc: t("people.users.sort.revokedDesc"),
              },
            },
            cell: ({ row }) => (
              <RelativeTime value={row.original.revokedAt} className="text-muted-foreground" />
            ),
          },
    ],
    [actor.id, roleName, rolesById, status, t, teamsById]
  )

  const rowActions = (person: Person): RowAction[] => {
    const rules = rulesFor(person, actor, people ?? [])
    return [
      {
        label: rules.canEdit ? t("people.users.actions.edit") : t("people.users.actions.view"),
        icon: rules.canEdit ? <Pencil /> : <Eye />,
        onSelect: () => openPerson(person.id),
      },
      {
        label: t("people.users.revoke.action"),
        icon: <UserX />,
        hidden: !rules.canRevoke,
        onSelect: () => void revoke(person),
      },
      {
        label: t("people.users.restore.action"),
        icon: <RotateCcw />,
        hidden: !rules.canRestore,
        onSelect: () => void restore(person),
      },
    ]
  }

  const showRevokedEmpty =
    status === "revoked" && !isLoading && !error && counts.revoked === 0

  return (
    <PageBody>
      <PeopleAreaNav />
      <PageHeader
        actions={
          <Button onClick={openNew} className="pointer-coarse:h-10">
            <UserPlus />
            {t("people.users.create.action")}
          </Button>
        }
        mobilePlacement="inline"
      />

      <div className="flex flex-col gap-4">
        <FilterBar
          search={{
            value: query,
            onChange: setQuery,
            debounce: 0,
            placeholder: t("people.users.search"),
          }}
          filters={
            <>
              <FacetedFilter
                title={t("people.users.filters.group")}
                options={groupOptions}
                value={groups}
                onChange={setGroups}
              />
              <FacetedFilter
                title={t("people.users.filters.team")}
                options={teamFilterOptions}
                value={teamFilter}
                onChange={setTeamFilter}
              />
            </>
          }
          activeCount={(groups.length > 0 ? 1 : 0) + (teamFilter.length > 0 ? 1 : 0)}
          onClear={clearFilters}
          actions={
            <SegmentedControl
              aria-label={t("people.users.filters.status")}
              value={status}
              onChange={setStatus}
              options={[
                {
                  value: "active",
                  label: t("people.users.filters.active"),
                  count: people ? counts.active : undefined,
                },
                {
                  value: "revoked",
                  label: t("people.users.filters.revoked"),
                  count: people ? counts.revoked : undefined,
                },
              ]}
            />
          }
        />

        {showRevokedEmpty ? (
          <EmptyState
            icon={<UserX className="size-5" />}
            title={t("people.users.emptyRevoked.title")}
            description={t("people.users.emptyRevoked.description")}
            action={{
              label: t("people.users.emptyRevoked.action"),
              onClick: () => setStatus("active"),
            }}
          />
        ) : (
          <DataTable
            aria-label={t("people.users.tableLabel")}
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            error={error}
            onRetry={reload}
            isFiltered={isFiltered}
            onClearFilters={clearFilters}
            defaultSorting={[{ id: "name", desc: false }]}
            onRowClick={(person) => openPerson(person.id)}
            rowActions={rowActions}
            empty={{
              title: t("people.users.empty.title"),
              description: t("people.users.empty.description"),
              action: { label: t("people.users.create.action"), onClick: openNew },
            }}
          />
        )}
      </div>

      {shownPerson ? (
        <PersonPanel
          key={`${shownPerson.id}-${personPanelKey}`}
          person={shownPerson}
          people={people ?? []}
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) closePanels()
          }}
        />
      ) : null}

      <NewPersonPanel
        key={newPanelKey}
        people={people ?? []}
        open={creating}
        onOpenChange={(open) => {
          if (!open) closePanels()
        }}
        onOpenPerson={openPerson}
      />
    </PageBody>
  )
}
