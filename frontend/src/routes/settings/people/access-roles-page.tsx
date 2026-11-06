import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { AccessRolePanel } from "@/components/people/access-role-panel"
import { PeopleAreaNav } from "@/components/people/area-nav"
import { EntityCard } from "@/components/people/entity-card"
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  FilterBar,
  PageBody,
  PageHeader,
  SortMenu,
  StatusBadge,
  useConfirm,
  type AvatarStackUser,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  useAccessRoleMutations,
  useAccessRoles,
  useRoleName,
} from "@/hooks/people/use-access-roles"
import { usePeople } from "@/hooks/people/use-people"
import { useOpenCount, useRetained } from "@/hooks/people/use-panel-session"
import { apiAssetUrl } from "@/lib/api"
import { useLanguage } from "@/lib/i18n"
import {
  PERMISSION_RESOURCES,
  chatListLevel,
  grantedResources,
} from "@/lib/people/permissions"
import type { AccessRole } from "@/lib/people/types"
import { matchesSearch } from "@/lib/search-text"

type SortOrder = "name-asc" | "people-desc"

type PanelState = { kind: "closed" } | { kind: "new" } | { kind: "edit"; id: string }

/** "Chat (só do departamento), Contatos e Catálogo": o que o grupo libera, numa frase. */
function useRoleSummary() {
  const { t } = useTranslation()
  const language = useLanguage()

  return useMemo(() => {
    const list = new Intl.ListFormat(language, { style: "long", type: "conjunction" })

    return (role: AccessRole) => {
      const granted = grantedResources(role.permissions)
      if (granted.length === 0) return t("people.roles.summary.none")

      const level = chatListLevel(role.permissions)
      const labels = granted.map((resource) =>
        resource === "chat" && level !== "all"
          ? t(`people.roles.summary.chat.${level}`)
          : t(`people.roles.resources.${resource}.label`)
      )
      if (granted.length === PERMISSION_RESOURCES.length && level === "all") {
        return t("people.roles.summary.all")
      }
      return list.format(labels)
    }
  }, [language, t])
}

export default function AccessRolesPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { roles, error, isLoading, reload } = useAccessRoles()
  const { people } = usePeople()
  const { deleteRole } = useAccessRoleMutations()
  const roleName = useRoleName()
  const summarize = useRoleSummary()

  const [panel, setPanel] = useState<PanelState>({ kind: "closed" })
  const panelOpen = panel.kind !== "closed"
  const panelKey = useOpenCount(panelOpen)
  const shownPanel = useRetained(panelOpen ? panel : null)
  const editing =
    shownPanel?.kind === "edit"
      ? (roles?.find((role) => role.id === shownPanel.id) ?? null)
      : null
  // Excluiu: o grupo sai da lista, e o painel ainda precisa dele para animar a saída.
  const lastEdited = useRetained(editing)
  const shownRole = shownPanel?.kind === "edit" ? lastEdited : null

  const openNew = () => setPanel({ kind: "new" })

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortOrder>("name-asc")

  const membersByRole = useMemo(() => {
    const members = new Map<string, AvatarStackUser[]>()
    for (const person of people ?? []) {
      if (person.revokedAt || !person.accessRoleId) continue
      const list = members.get(person.accessRoleId) ?? []
      list.push({
        id: person.id,
        name: person.name,
        src: person.avatarUrl ? apiAssetUrl(person.avatarUrl) : null,
      })
      members.set(person.accessRoleId, list)
    }
    return members
  }, [people])

  const visible = useMemo(() => {
    const matching = (roles ?? []).filter(
      (role) => !query || matchesSearch(`${roleName(role)} ${summarize(role)}`, query)
    )
    return [...matching].sort((a, b) =>
      sort === "people-desc"
        ? b.accountsCount - a.accountsCount || roleName(a).localeCompare(roleName(b), language)
        : roleName(a).localeCompare(roleName(b), language)
    )
  }, [language, query, roleName, roles, sort, summarize])

  async function remove(role: AccessRole) {
    const confirmed = await confirm({
      title: t("people.roles.delete.title", { name: role.name }),
      description: t("people.roles.delete.description", { count: role.accountsCount }),
      confirmLabel: t("people.roles.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteRole(role.id),
    })
    if (confirmed) {
      setPanel({ kind: "closed" })
      toast.success(t("people.roles.delete.done", { name: role.name }))
    }
  }

  return (
    <PageBody>
      <PeopleAreaNav />
      <PageHeader
        description={t("people.roles.description")}
        actions={
          <Button onClick={openNew} className="pointer-coarse:h-10">
            <Plus />
            {t("people.roles.create.action")}
          </Button>
        }
        mobilePlacement="inline"
      />

      {error && !roles ? (
        <ErrorState error={error} onRetry={reload} />
      ) : isLoading ? (
        <CardGridSkeleton cards={3} />
      ) : (roles?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="size-5" />}
          title={t("people.roles.empty.title")}
          description={t("people.roles.empty.description")}
          action={{ label: t("people.roles.create.action"), onClick: openNew }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <FilterBar
            search={{
              value: query,
              onChange: setQuery,
              debounce: 0,
              placeholder: t("people.roles.search"),
            }}
            onClear={() => setQuery("")}
            sort={
              <SortMenu
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name-asc", label: t("people.roles.sort.nameAsc") },
                  { value: "people-desc", label: t("people.roles.sort.peopleDesc") },
                ]}
              />
            }
          />

          {visible.length === 0 ? (
            <EmptyState
              title={t("people.roles.noResults.title")}
              description={t("people.roles.noResults.description")}
              action={{ label: t("people.common.clearSearch"), onClick: () => setQuery("") }}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((role) => (
                <li key={role.id}>
                  <EntityCard
                    title={roleName(role)}
                    badge={
                      role.default ? (
                        <StatusBadge tone="neutral" dot={false}>
                          {t("people.roles.defaultBadge")}
                        </StatusBadge>
                      ) : null
                    }
                    description={summarize(role)}
                    people={membersByRole.get(role.id) ?? []}
                    peopleLabel={
                      role.accountsCount === 0
                        ? t("people.roles.noMembers")
                        : t("people.roles.memberCount", { count: role.accountsCount })
                    }
                    onOpen={() => setPanel({ kind: "edit", id: role.id })}
                    actionsLabel={t("people.roles.actionsOf", { name: roleName(role) })}
                    actions={[
                      {
                        label: t("people.roles.actions.edit"),
                        icon: <Pencil />,
                        onSelect: () => setPanel({ kind: "edit", id: role.id }),
                      },
                      {
                        label: t("people.roles.delete.action"),
                        icon: <Trash2 />,
                        destructive: true,
                        separatorBefore: true,
                        hidden: role.default,
                        onSelect: () => void remove(role),
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {shownPanel ? (
        <AccessRolePanel
          key={panelKey}
          role={shownRole}
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) setPanel({ kind: "closed" })
          }}
          onDelete={(role) => void remove(role)}
        />
      ) : null}
    </PageBody>
  )
}
