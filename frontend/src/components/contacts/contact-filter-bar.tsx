import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { useConnectorTexts } from "@/components/connectors/connector-texts"
import {
  DateRangePicker,
  FacetedFilter,
  FilterBar,
  FilterPopover,
  useFilterLayout,
  type FacetOption,
} from "@/components/shared"
import { Switch } from "@/components/ui/switch"
import { useSession } from "@/lib/auth"
import {
  ASSIGNEE_ME,
  ASSIGNEE_NONE,
  EMPTY_FILTERS,
  TEAM_NONE,
  countActiveFilters,
  type AutomationValue,
  type ContactFilters,
} from "@/lib/contacts/filters"
import type {
  ContactFilterOptions,
  ContactStatus,
  CustomField,
} from "@/lib/contacts/types"
import { endOfDay, startOfDay, toDateInputValue } from "@/lib/date-format"
import { CustomFieldFilters } from "./custom-field-filters"
import { TagDot } from "./tag-dot"

export type ContactFilterBarProps = {
  filters: ContactFilters
  onChange: (patch: Partial<ContactFilters>, options?: { replace?: boolean }) => void
  options: ContactFilterOptions | undefined
  customFields: CustomField[] | undefined
  isSearching: boolean
  /** "128 contatos". */
  resultLabel?: ReactNode
  /** Escolher colunas. */
  actions?: ReactNode
}

/**
 * O que é menos usado: em linha fica atrás de um botão, para não encher a tela; empilhado no
 * celular, onde já está tudo num painel só, aparece direto.
 */
function MoreFilters({
  label,
  activeCount,
  onClear,
  children,
}: {
  label: string
  activeCount: number
  onClear: () => void
  children: ReactNode
}) {
  const layout = useFilterLayout()
  if (layout === "stacked") return <>{children}</>

  return (
    <FilterPopover label={label} activeCount={activeCount} onClear={onClear}>
      {children}
    </FilterPopover>
  )
}

export function ContactFilterBar({
  filters,
  onChange,
  options,
  customFields,
  isSearching,
  resultLabel,
  actions,
}: ContactFilterBarProps) {
  const { t } = useTranslation()
  const texts = useConnectorTexts()
  const { account } = useSession()

  const connectorOptions = useMemo<FacetOption[]>(() => {
    const connectors = options?.connectors ?? []
    const titles = connectors.map((connector) => texts.title(connector))

    return connectors.map((connector, index) => ({
      value: connector.id,
      // O mesmo número pode estar em dois canais: é o tipo que separa um do outro.
      label:
        titles.indexOf(titles[index]) === titles.lastIndexOf(titles[index])
          ? titles[index]
          : t("contacts.filters.connectorWithType", {
              name: titles[index],
              type: texts.typeLabel(connector),
            }),
    }))
    // `texts` nasce a cada render, mas só muda com o idioma, que muda `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.connectors, t])

  const tagOptions = useMemo<FacetOption[]>(
    () =>
      (options?.tags ?? []).map((tag) => ({
        value: tag.id,
        label: tag.name,
        icon: <TagDot color={tag.color} />,
      })),
    [options?.tags]
  )

  const teamOptions = useMemo<FacetOption[]>(
    () => [
      ...(options?.teams ?? []).map((team) => ({ value: team.id, label: team.name })),
      { value: TEAM_NONE, label: t("contacts.team.none") },
    ],
    [options?.teams, t]
  )

  const assigneeOptions = useMemo<FacetOption[]>(
    () => [
      { value: ASSIGNEE_ME, label: t("contacts.filters.assignedToMe") },
      { value: ASSIGNEE_NONE, label: t("contacts.assignee.none") },
      // "Comigo" já é a própria pessoa. Só aparece pelo nome num link que veio de um colega.
      ...(options?.users ?? [])
        .filter((user) => user.id !== account.id || filters.assignees.includes(user.id))
        .map((user) => ({ value: user.id, label: user.name })),
    ],
    [account.id, filters.assignees, options?.users, t]
  )

  const statusOptions = useMemo<FacetOption[]>(
    () => [
      { value: "open", label: t("contacts.status.open") },
      { value: "closed", label: t("contacts.status.closed") },
    ],
    [t]
  )

  const automationOptions = useMemo<FacetOption[]>(
    () => [
      { value: "on", label: t("contacts.automation.on") },
      { value: "off", label: t("contacts.automation.off") },
    ],
    [t]
  )

  const moreCount =
    (filters.session ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    new Set(filters.fields.map((filter) => filter.key)).size

  return (
    <FilterBar
      search={{
        value: filters.q,
        onChange: (q) => onChange({ q }, { replace: true }),
        placeholder: t("contacts.filters.search"),
        loading: isSearching,
      }}
      activeCount={countActiveFilters(filters)}
      onClear={() => onChange(EMPTY_FILTERS)}
      resultLabel={resultLabel}
      actions={actions}
      filters={
        <>
          <FacetedFilter
            title={t("contacts.filters.connector")}
            options={connectorOptions}
            value={filters.connectors}
            onChange={(connectors) => onChange({ connectors })}
          />
          <FacetedFilter
            title={t("contacts.filters.tag")}
            options={tagOptions}
            value={filters.tags}
            onChange={(tags) => onChange({ tags })}
          />
          <FacetedFilter
            title={t("contacts.filters.team")}
            options={teamOptions}
            value={filters.teams}
            onChange={(teams) => onChange({ teams })}
          />
          <FacetedFilter
            title={t("contacts.filters.assignee")}
            options={assigneeOptions}
            value={filters.assignees}
            onChange={(assignees) => onChange({ assignees })}
          />
          <FacetedFilter
            title={t("contacts.filters.status")}
            options={statusOptions}
            value={filters.status}
            onChange={(status) => onChange({ status: status as ContactStatus[] })}
          />
          <FacetedFilter
            title={t("contacts.filters.automation")}
            options={automationOptions}
            value={filters.automation}
            onChange={(automation) => onChange({ automation: automation as AutomationValue[] })}
          />
          <MoreFilters
            label={t("contacts.filters.more")}
            activeCount={moreCount}
            onClear={() => onChange({ session: false, from: null, to: null, fields: [] })}
          >
            <label className="flex cursor-pointer items-center justify-between gap-3 pointer-coarse:min-h-10">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t("contacts.filters.session")}</span>
                <span className="block text-xs text-pretty text-muted-foreground">
                  {t("contacts.filters.sessionHint")}
                </span>
              </span>
              <Switch
                checked={filters.session}
                onCheckedChange={(session) => onChange({ session })}
              />
            </label>
            <DateRangePicker
              label={t("contacts.filters.createdAt")}
              value={
                filters.from
                  ? {
                      from: startOfDay(`${filters.from}T12:00:00`),
                      to: endOfDay(`${filters.to ?? filters.from}T12:00:00`),
                    }
                  : null
              }
              onChange={(range) =>
                onChange({
                  from: range ? toDateInputValue(range.from) : null,
                  to: range ? toDateInputValue(range.to) : null,
                })
              }
            />
            {customFields && customFields.length > 0 ? (
              <CustomFieldFilters
                fields={customFields}
                value={filters.fields}
                onChange={(fields) => onChange({ fields })}
              />
            ) : null}
          </MoreFilters>
        </>
      }
    />
  )
}
