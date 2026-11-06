import { Suspense, lazy, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import {
  CircleCheck,
  CircleDot,
  Copy,
  MessageCircle,
  Tag,
  Tags,
  Upload,
  Download,
  UserRoundCheck,
  Users,
  Zap,
  ZapOff,
} from "lucide-react"
import { toast } from "sonner"

import { ActiveFilterChips } from "@/components/contacts/active-filter-chips"
import { ColumnPicker } from "@/components/contacts/column-picker"
import { ContactAssignDialog } from "@/components/contacts/contact-assign-dialog"
import { ContactBulkBar, type BulkAction } from "@/components/contacts/contact-bulk-bar"
import { useContactColumns } from "@/components/contacts/contact-columns"
import { ContactExportDialog } from "@/components/contacts/contact-export-dialog"
import { ContactFilterBar } from "@/components/contacts/contact-filter-bar"
import { ContactTagsDialog, type TagsMode } from "@/components/contacts/contact-tags-dialog"
import { ContactTasksBand } from "@/components/contacts/contact-tasks-band"
import { SelectionBanner } from "@/components/contacts/selection-banner"
import type { ContactImportPanelProps, ImportView } from "@/components/contacts/import/contact-import-panel"
import {
  DataTable,
  PageBody,
  PageHeader,
  type RowAction,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useContactMutations, type BulkScope } from "@/hooks/contacts/use-contact-mutations"
import { useContactSelection } from "@/hooks/contacts/use-contact-selection"
import { useImportFinished } from "@/hooks/contacts/use-contact-imports"
import {
  reloadContacts,
  useContactCustomFields,
  useContactFilterOptions,
  useContacts,
} from "@/hooks/contacts/use-contacts"
import { useContactsExport } from "@/hooks/contacts/use-contacts-export"
import { useContactsQuery } from "@/hooks/contacts/use-contacts-query"
import { useCan } from "@/hooks/use-can"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { COLUMNS_STORAGE_KEY, DEFAULT_COLUMNS } from "@/lib/contacts/columns"
import {
  EMPTY_FILTERS,
  PER_PAGE_OPTIONS,
  hasAnyFilter,
  type ContactSelectionTarget,
  type SortColumn,
} from "@/lib/contacts/filters"
import { contactName, contactPhone } from "@/lib/contacts/format"
import type { Contact } from "@/lib/contacts/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

const ContactImportPanel = lazy(() => import("@/components/contacts/import/contact-import-panel"))

const NO_CONTACTS: Contact[] = []

type DialogState =
  | {
      kind: "tags"
      mode: TagsMode
      scope: BulkScope
      /** Remover de um contato só: não há por que oferecer o que ele não tem. */
      onlyTagIds?: string[]
    }
  | { kind: "assign"; scope: BulkScope }
  | null

function LazyImportPanel(props: ContactImportPanelProps) {
  return (
    <Suspense fallback={null}>
      <ContactImportPanel {...props} />
    </Suspense>
  )
}

export default function ContactsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const canOpenChat = useCan("chat")

  const query = useContactsQuery()
  const { filters, sort, setFilters, setSort, setPage, setPerPage, setParam, searchParams } = query
  const { data, error, isLoading, isValidating, mutate } = useContacts(query.path)
  const { options, lookups } = useContactFilterOptions()
  const customFields = useContactCustomFields()

  const rows = data?.contacts ?? NO_CONTACTS
  const meta = data?.meta
  const total = meta?.total ?? 0
  // Com `keepPreviousData`, o SWR diz `isLoading` a cada troca de página, mesmo com linhas para
  // mostrar. O esqueleto é só para quando não há nada: o resto esmaece.
  const firstLoad = isLoading && !data

  const selection = useContactSelection(rows, total, filters)
  const tracker = useContactsExport()
  const { setStatus, setAutomation } = useContactMutations()

  const [visibleColumns, setVisibleColumns] = useLocalStorage<string[]>(
    COLUMNS_STORAGE_KEY,
    DEFAULT_COLUMNS
  )
  const columns = useContactColumns({ lookups, customFields, visible: visibleColumns, canOpenChat })

  /* ---------- painéis: o endereço diz o que está aberto ---------- */

  const importParam = searchParams.get("import")
  const importView: ImportView | null =
    importParam === "history" ? "history" : importParam === "new" ? "new" : null
  const openImport = (view: ImportView) => setParam("import", view)

  // Chegou a abrir uma vez: daí em diante o painel fica montado, para a animação de saída.
  const [importRequested, setImportRequested] = useState(importView !== null)
  if (importView !== null && !importRequested) setImportRequested(true)

  const [exportOpen, setExportOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)

  const importGroups = useImportFinished((group) => {
    void reloadContacts()
    // Com o painel aberto, é ele que conta como terminou.
    if (importView !== null) return
    if (group.status === "failed") {
      toast.error(t("contacts.import.finished.failed"))
    } else {
      toast.success(
        t("contacts.import.finished.done", {
          count: group.imported,
          formatted: formatNumber(group.imported, language),
        })
      )
    }
  })
  const runningImport = importGroups.find((group) => group.status === "running")

  /* ---------- página que sumiu ---------- */

  // Lote e filtro podem encolher a lista: a página em que a pessoa estava deixou de existir.
  useEffect(() => {
    if (!meta || isValidating) return
    if (meta.page > 1 && meta.total > 0 && meta.page > meta.totalPages) {
      setPage(meta.totalPages, { replace: true })
    } else if (meta.page > 1 && meta.total === 0) {
      setPage(1, { replace: true })
    }
  }, [isValidating, meta, setPage])

  /* ---------- seleção e lote ---------- */

  const hasSelection = selection.count > 0
  const scope: BulkScope = {
    target: selection.target,
    count: selection.count,
    onDone: selection.clear,
  }

  // Exportar leva a seleção, se houver; sem ela, o filtro inteiro.
  const exportTarget: ContactSelectionTarget = hasSelection
    ? selection.target
    : { kind: "all", filters, excluded: [] }
  const exportCount = hasSelection ? selection.count : total

  function runBulk(action: BulkAction) {
    switch (action) {
      case "addTags":
        return setDialog({ kind: "tags", mode: "add", scope })
      case "removeTags":
        return setDialog({ kind: "tags", mode: "remove", scope })
      case "assign":
        return setDialog({ kind: "assign", scope })
      case "reopen":
        return void setStatus("open", scope)
      case "close":
        return void setStatus("closed", scope)
      case "automationOn":
        return void setAutomation(true, scope)
      case "automationOff":
        return void setAutomation(false, scope)
      case "export":
        return setExportOpen(true)
    }
  }

  /* ---------- linha ---------- */

  const rowActions = (contact: Contact): RowAction[] => {
    const name = contactName(contact) ?? t("contacts.noName")
    const phone = contactPhone(contact)
    const rowScope: BulkScope = {
      target: { kind: "ids", ids: [contact.id] },
      count: 1,
      name,
      single: true,
    }

    return [
      {
        label: t("contacts.row.openChat"),
        icon: <MessageCircle />,
        hidden: !canOpenChat,
        onSelect: () => navigate(`/chat/${contact.id}`),
      },
      {
        label: t("contacts.row.copyPhone"),
        icon: <Copy />,
        hidden: !phone,
        onSelect: () => {
          if (!phone) return
          void navigator.clipboard
            .writeText(phone)
            .then(() => toast.success(t("contacts.row.phoneCopied")))
            .catch(() => toast.error(t("contacts.row.copyFailed")))
        },
      },
      {
        label: t("contacts.bulk.actions.addTags"),
        icon: <Tag />,
        separatorBefore: true,
        onSelect: () => setDialog({ kind: "tags", mode: "add", scope: rowScope }),
      },
      {
        label: t("contacts.bulk.actions.removeTags"),
        icon: <Tags />,
        hidden: contact.tagIds.length === 0,
        onSelect: () =>
          setDialog({ kind: "tags", mode: "remove", scope: rowScope, onlyTagIds: contact.tagIds }),
      },
      {
        label: t("contacts.bulk.actions.assign"),
        icon: <UserRoundCheck />,
        onSelect: () => setDialog({ kind: "assign", scope: rowScope }),
      },
      contact.status === "open"
        ? {
            label: t("contacts.bulk.actions.close"),
            icon: <CircleCheck />,
            separatorBefore: true,
            onSelect: () => void setStatus("closed", rowScope),
          }
        : {
            label: t("contacts.bulk.actions.reopen"),
            icon: <CircleDot />,
            separatorBefore: true,
            onSelect: () => void setStatus("open", rowScope),
          },
      contact.automationEnabled
        ? {
            label: t("contacts.bulk.actions.automationOff"),
            icon: <ZapOff />,
            onSelect: () => void setAutomation(false, rowScope),
          }
        : {
            label: t("contacts.bulk.actions.automationOn"),
            icon: <Zap />,
            onSelect: () => void setAutomation(true, rowScope),
          },
    ]
  }

  /* ---------- ordem ---------- */

  const sorting = useMemo(() => [{ id: sort.column, desc: sort.desc }], [sort.column, sort.desc])

  const resultLabel =
    meta && !error
      ? total === 0
        ? t("contacts.countNone")
        : t("contacts.count", { count: total, formatted: formatNumber(total, language) })
      : null

  const columnPicker = (
    <ColumnPicker
      visible={visibleColumns}
      onChange={setVisibleColumns}
      customFields={customFields}
    />
  )

  return (
    // Com a barra de lote flutuando, o fim da página sobe para ela não cobrir a paginação.
    <PageBody variant="wide" className={hasSelection ? "pb-24" : undefined}>
      <PageHeader
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={!hasSelection && total === 0}
              className="pointer-coarse:h-10"
              onClick={() => setExportOpen(true)}
            >
              <Download />
              {t("contacts.export.action")}
            </Button>
            <Button
              type="button"
              className="pointer-coarse:h-10"
              onClick={() => openImport("new")}
            >
              <Upload />
              {t("contacts.import.action")}
            </Button>
          </>
        }
      />

      <div className="flex min-w-0 flex-col gap-3">
        <ContactFilterBar
          filters={filters}
          onChange={setFilters}
          options={options}
          customFields={customFields}
          isSearching={isValidating && Boolean(filters.q)}
          resultLabel={isMobile ? resultLabel : undefined}
          actions={isMobile ? columnPicker : undefined}
        />

        {/* No desktop, a linha de filtros já vai até a borda: a contagem e as colunas descem para
            junto dos filtros aplicados. */}
        <div className="flex flex-wrap items-center gap-2">
          <ActiveFilterChips
            filters={filters}
            lookups={lookups}
            customFields={customFields}
            onChange={setFilters}
          />
          {isMobile ? null : (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {resultLabel ? (
                <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {resultLabel}
                </span>
              ) : null}
              {columnPicker}
            </div>
          )}
        </div>

        <ContactTasksBand
          tracker={tracker}
          exportOpen={exportOpen}
          onOpenExport={() => setExportOpen(true)}
          importOpen={importView !== null}
          runningImport={runningImport}
          onOpenImports={() => openImport("history")}
        />

        <SelectionBanner selection={selection} pageSize={rows.length} total={total} />

        <DataTable
          aria-label={t("contacts.tableLabel")}
          columns={columns}
          data={rows}
          meta={meta}
          isLoading={firstLoad}
          isFetching={isValidating && !firstLoad}
          error={error}
          onRetry={() => void mutate()}
          onPageChange={setPage}
          onPerPageChange={setPerPage}
          perPageOptions={PER_PAGE_OPTIONS}
          sorting={sorting}
          onSortingChange={(next) => {
            const first = next[0]
            // A tabela alterna em três tempos, e o terceiro tira a ordem: a lista sempre tem uma.
            setSort(
              first
                ? { column: first.id as SortColumn, desc: first.desc }
                : { column: sort.column, desc: !sort.desc }
            )
          }}
          isFiltered={hasAnyFilter(filters)}
          onClearFilters={() => setFilters(EMPTY_FILTERS)}
          selectable
          rowSelection={selection.rowSelection}
          onRowSelectionChange={selection.onRowSelectionChange}
          rowActions={rowActions}
          onRowClick={canOpenChat ? (contact) => navigate(`/chat/${contact.id}`) : undefined}
          empty={{
            icon: <Users className="size-5" />,
            title: t("contacts.empty.title"),
            description: t("contacts.empty.description"),
            action: { label: t("contacts.import.action"), onClick: () => openImport("new") },
          }}
        />
      </div>

      <ContactBulkBar count={selection.count} onClear={selection.clear} onAction={runBulk} />

      {dialog?.kind === "tags" ? (
        <ContactTagsDialog
          mode={dialog.mode}
          scope={dialog.scope}
          tags={(options?.tags ?? []).filter(
            (tag) => !dialog.onlyTagIds || dialog.onlyTagIds.includes(tag.id)
          )}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "assign" ? (
        <ContactAssignDialog
          scope={dialog.scope}
          users={options?.users ?? []}
          onClose={() => setDialog(null)}
        />
      ) : null}

      <ContactExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        tracker={tracker}
        target={exportTarget}
        count={exportCount}
        fromSelection={hasSelection}
      />

      {importRequested ? (
        <LazyImportPanel
          view={importView}
          onViewChange={(view) => setParam("import", view)}
          onViewContacts={(connectorId) => {
            setFilters({ connectors: [connectorId] })
            void reloadContacts()
          }}
        />
      ) : null}
    </PageBody>
  )
}
