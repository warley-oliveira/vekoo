import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Loader2, SearchX, Users } from "lucide-react"
import { toast } from "@/lib/campaigns-wizard/notify"
import { mutate as globalMutate } from "swr"

import {
  Callout,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  ListSkeleton,
  ResponsiveDialog,
  StatusBadge,
  TablePagination,
  TagChip,
  UserAvatar,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { recipientSummaryKey } from "@/hooks/campaigns-wizard/use-campaign-options"
import { useDraft } from "@/hooks/campaigns-wizard/use-draft"
import { useContactFilterOptions, useContacts } from "@/hooks/contacts/use-contacts"
import { useCan } from "@/hooks/use-can"
import { ApiError, apiAssetUrl, apiPost } from "@/lib/api"
import type { ImportResult } from "@/lib/campaigns-wizard/types"
import { IMPORTABLE_CONNECTORS } from "@/lib/contacts/format"
import type { Contact, ContactStatus } from "@/lib/contacts/types"
import { formatNumber } from "@/lib/format-number"
import { formatPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const PER_PAGE = 25

type Selection = { all: boolean; ids: Set<string> }

function ContactRow({
  contact,
  selected,
  locked,
  onToggle,
  tagOf,
}: {
  contact: Contact
  selected: boolean
  locked: boolean
  onToggle: (id: string) => void
  tagOf: (id: string) => { name: string; color: string } | undefined
}) {
  const { t } = useTranslation()
  const name = contact.displayName || contact.userName || t("campaignsWizard.contacts.noName")
  const phone = contact.phoneNumber || contact.externalId
  const tags = contact.tagIds.slice(0, 2).map(tagOf).filter((tag) => tag !== undefined)

  return (
    <li>
      <label
        className={cn(
          "flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50",
          selected && "bg-primary/5",
          locked && "cursor-default hover:bg-transparent"
        )}
      >
        <Checkbox
          checked={selected}
          disabled={locked}
          onCheckedChange={() => onToggle(contact.id)}
          aria-label={t("campaignsWizard.contacts.select", { name })}
        />
        <UserAvatar
          name={name}
          src={contact.profilePictureUrl ? apiAssetUrl(contact.profilePictureUrl) : undefined}
          size="sm"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">
            {phone ? formatPhone(phone) : t("campaignsWizard.contacts.noPhone")}
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          {tags.map((tag) => (
            <TagChip key={tag.name} color={tag.color}>
              {tag.name}
            </TagChip>
          ))}
        </span>
        <StatusBadge tone={contact.status === "open" ? "success" : "neutral"} className="shrink-0">
          {t(`campaignsWizard.contacts.status.${contact.status}`)}
        </StatusBadge>
      </label>
    </li>
  )
}

/**
 * A base de contatos: buscar, filtrar por etiqueta, canal e situação, e marcar um a um ou todos os que
 * aparecem. Só quem tem telefone está na lista: Instagram, Messenger e o site não recebem campanha.
 */
export default function ContactsPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { ensureDraft } = useDraft()
  const canSee = useCan("contacts")
  const { options, lookups, error: optionsError, isLoading: optionsLoading, reload } =
    useContactFilterOptions(canSee)

  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState("")
  const [tagIds, setTagIds] = useState<string[]>([])
  const [connectorIds, setConnectorIds] = useState<string[]>([])
  const [status, setStatus] = useState<ContactStatus[]>([])
  const [page, setPage] = useState(1)
  const [selection, setSelection] = useState<Selection>({ all: false, ids: new Set() })
  const [adding, setAdding] = useState(false)

  const phoneConnectors = useMemo(
    () => (options?.connectors ?? []).filter((item) => IMPORTABLE_CONNECTORS.includes(item.type)),
    [options?.connectors]
  )

  /** Sem canal escolhido, todos os que têm telefone: a lista e o "todos" contam a mesma gente. */
  const filters = useMemo(() => {
    const connectors = connectorIds.length > 0 ? connectorIds : phoneConnectors.map((item) => item.id)
    return {
      ...(query.trim() ? { q: query.trim() } : {}),
      ...(tagIds.length > 0 ? { tagIds } : {}),
      connectorIds: connectors,
      ...(status.length === 1 ? { status: status[0] } : {}),
    }
  }, [connectorIds, phoneConnectors, query, status, tagIds])

  const path = useMemo(() => {
    if (!options) return null

    const params = new URLSearchParams({
      page: String(page),
      perPage: String(PER_PAGE),
      sortBy: "last_message_at",
      sortDir: "desc",
    })
    if (filters.q) params.set("q", filters.q)
    if (filters.status) params.set("status", filters.status)
    filters.tagIds?.forEach((id) => params.append("tagIds[]", id))
    filters.connectorIds.forEach((id) => params.append("connectorIds[]", id))
    return `/contacts?${params}`
  }, [filters, options, page])

  const { data, error, isLoading, isValidating, mutate } = useContacts(canSee && phoneConnectors.length > 0 ? (path ?? "") : "")

  const total = data?.meta.total ?? 0
  const count = selection.all ? total : selection.ids.size
  const hasFilter = Boolean(query.trim()) || tagIds.length > 0 || connectorIds.length > 0 || status.length > 0

  const resetPage = useCallback(<T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(1)
  }, [])

  const toggle = useCallback((id: string) => {
    setSelection((current) => {
      const ids = new Set(current.ids)
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      return { all: false, ids }
    })
  }, [])

  const tagOf = useCallback((id: string) => lookups.tags.get(id), [lookups.tags])

  function clearFilters() {
    setQuery("")
    setTagIds([])
    setConnectorIds([])
    setStatus([])
    setPage(1)
  }

  const dirty = count > 0

  async function close() {
    if (dirty && !adding) {
      const leave = await confirm({
        title: t("campaignsWizard.contacts.discardTitle"),
        description: t("campaignsWizard.contacts.discardHint"),
        confirmLabel: t("campaignsWizard.contacts.discard"),
        cancelLabel: t("campaignsWizard.contacts.keep"),
        destructive: true,
      })
      if (!leave) return
    }
    setOpen(false)
    onClose()
  }

  async function add() {
    setAdding(true)
    try {
      const id = await ensureDraft()
      const result = await apiPost<ImportResult>(
        `/campaigns/${id}/import-contacts`,
        selection.all ? { selectAll: true, filters } : { contactIds: [...selection.ids] }
      )
      await globalMutate(recipientSummaryKey(id))

      if (result.importedCount === 0 && result.skippedCount > 0) {
        toast.info(t("campaignsWizard.contacts.allThere", { count: result.skippedCount }))
      } else {
        toast.success(
          t("campaignsWizard.contacts.added", {
            count: result.importedCount,
            formatted: formatNumber(result.importedCount, language),
          }),
          result.skippedCount > 0
            ? {
                description: t("campaignsWizard.contacts.addedSkipped", {
                  count: result.skippedCount,
                  formatted: formatNumber(result.skippedCount, language),
                }),
              }
            : undefined
        )
      }
      setOpen(false)
      onClose()
    } catch (failure) {
      toast.error(
        failure instanceof ApiError && failure.code === "tooManyContacts"
          ? t("campaignsWizard.contacts.tooMany", {
              max: formatNumber(Number(failure.details?.max ?? 50_000), language),
            })
          : t("campaignsWizard.contacts.addFailed")
      )
    } finally {
      setAdding(false)
    }
  }

  const statusOptions = useMemo(
    () => [
      { value: "open", label: t("campaignsWizard.contacts.status.open") },
      { value: "closed", label: t("campaignsWizard.contacts.status.closed") },
    ],
    [t]
  )
  const tagOptions = useMemo(
    () => (options?.tags ?? []).map((tag) => ({ value: tag.id, label: tag.name })),
    [options?.tags]
  )
  const connectorOptions = useMemo(
    () =>
      phoneConnectors.map((item) => {
        // Dois canais podem ter o mesmo nome: o número é o que os separa.
        const number = "numberFormatted" in item ? item.numberFormatted : null
        return { value: item.id, label: number ? `${item.name} · ${number}` : item.name }
      }),
    [phoneConnectors]
  )

  const rows = data?.contacts ?? []

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void close()
      }}
      size="xl"
      fixedHeight
      title={t("campaignsWizard.contacts.title")}
      description={t("campaignsWizard.contacts.description")}
      disablePointerDismissal={dirty}
      footer={
        canSee ? (
          <>
            <p className="min-w-0 flex-1 self-center text-sm text-muted-foreground" aria-live="polite">
              {t("campaignsWizard.contacts.selected", {
                count,
                formatted: formatNumber(count, language),
              })}
            </p>
            <Button
              type="button"
              disabled={count === 0 || adding}
              className="pointer-coarse:h-10"
              onClick={() => void add()}
            >
              {adding ? <Loader2 className="animate-spin" /> : null}
              {t("campaignsWizard.contacts.add", {
                count,
                formatted: formatNumber(count, language),
              })}
            </Button>
          </>
        ) : undefined
      }
    >
      {!canSee ? (
        <Callout tone="neutral" title={t("campaignsWizard.contacts.noPermissionTitle")}>
          {t("campaignsWizard.contacts.noPermissionHint")}
        </Callout>
      ) : optionsLoading ? (
        <ListSkeleton rows={8} avatar />
      ) : optionsError ? (
        <ErrorState error={optionsError} onRetry={() => void reload()} className="border-0 p-4" />
      ) : phoneConnectors.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title={t("campaignsWizard.contacts.noChannelsTitle")}
          description={t("campaignsWizard.contacts.noChannelsHint")}
          className="border-0 p-6"
        />
      ) : (
        <div className="flex flex-col gap-3">
          <FilterBar
            search={{
              value: query,
              onChange: resetPage(setQuery),
              loading: isValidating,
              shortcut: false,
              placeholder: t("campaignsWizard.contacts.search"),
            }}
            activeCount={(tagIds.length ? 1 : 0) + (connectorIds.length ? 1 : 0) + (status.length ? 1 : 0)}
            onClear={clearFilters}
            filters={
              <>
                <FacetedFilter
                  title={t("campaignsWizard.contacts.tags")}
                  options={tagOptions}
                  value={tagIds}
                  onChange={resetPage(setTagIds)}
                />
                {connectorOptions.length > 1 ? (
                  <FacetedFilter
                    title={t("campaignsWizard.contacts.channel")}
                    options={connectorOptions}
                    value={connectorIds}
                    onChange={resetPage(setConnectorIds)}
                  />
                ) : null}
                <FacetedFilter
                  title={t("campaignsWizard.contacts.situation")}
                  options={statusOptions}
                  value={status}
                  onChange={resetPage((value: string[]) => setStatus(value.slice(-1) as ContactStatus[]))}
                />
              </>
            }
          />

          {isLoading && !data ? (
            <ListSkeleton rows={8} avatar />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void mutate()} className="border-0 p-4" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={hasFilter ? <SearchX className="size-5" /> : <Users className="size-5" />}
              title={hasFilter ? t("campaignsWizard.contacts.noResults") : t("campaignsWizard.contacts.empty")}
              description={hasFilter ? undefined : t("campaignsWizard.contacts.emptyHint")}
              action={hasFilter ? { label: t("campaignsWizard.contacts.clear"), onClick: clearFilters } : undefined}
              className="border-0 p-6"
            />
          ) : (
            <>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <Checkbox
                  checked={selection.all}
                  indeterminate={!selection.all && selection.ids.size > 0}
                  onCheckedChange={(checked) =>
                    setSelection({ all: Boolean(checked), ids: new Set() })
                  }
                  aria-label={t("campaignsWizard.contacts.selectAll", {
                    formatted: formatNumber(total, language),
                  })}
                />
                <span className="font-medium">
                  {t("campaignsWizard.contacts.selectAll", {
                    formatted: formatNumber(total, language),
                  })}
                </span>
              </label>

              <ul className="divide-y rounded-lg border">
                {rows.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    selected={selection.all || selection.ids.has(contact.id)}
                    locked={selection.all}
                    onToggle={toggle}
                    tagOf={tagOf}
                  />
                ))}
              </ul>

              {data ? (
                <TablePagination
                  page={data.meta.page}
                  totalPages={data.meta.totalPages}
                  total={data.meta.total}
                  perPage={data.meta.perPage}
                  onPageChange={setPage}
                />
              ) : null}

              {selection.all ? (
                <p className="text-xs text-pretty text-muted-foreground">
                  {t("campaignsWizard.contacts.allHint")}
                </p>
              ) : null}
            </>
          )}

          <p className="text-xs text-pretty text-muted-foreground">
            {t("campaignsWizard.contacts.footnote")}{" "}
            <Link to="/contacts" className="underline underline-offset-2" target="_blank" rel="noreferrer">
              {t("campaignsWizard.contacts.openContacts")}
            </Link>
          </p>
        </div>
      )}
    </ResponsiveDialog>
  )
}
