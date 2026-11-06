import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Trans, useTranslation } from "react-i18next"
import { AlertTriangle, Braces, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ContentExcerpt } from "@/components/content/content-excerpt"
import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  ListSkeleton,
  PageBody,
  PageHeader,
  RelativeTime,
  SectionCard,
  SortMenu,
  StatusBadge,
  TablePagination,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAttachmentLibrary } from "@/hooks/content/use-attachments"
import { useCustomFields } from "@/hooks/content/use-custom-fields"
import { usePanelParam } from "@/hooks/content/use-panel-param"
import { useQuickReplies, useQuickReplyMutations } from "@/hooks/content/use-quick-replies"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { buildExcerptContext } from "@/lib/content/excerpt-context"
import { citedAttachmentIds, usedVariableKeys } from "@/lib/content/quick-reply-content"
import type { QuickReply } from "@/lib/content/types"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch } from "@/lib/search-text"

// O editor pesa, e a lista não precisa dele até alguém abrir o painel.
const QuickReplyPanel = lazy(() => import("@/components/content/quick-reply-panel"))

type SortOrder = "name-asc" | "name-desc" | "recent" | "oldest"
type ContentFilter = "attachment" | "variable" | "broken"

const PAGE_SIZE = 25

export default function QuickRepliesPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const confirm = useConfirm()
  const { quickReplies, error, isLoading, reload } = useQuickReplies()
  const library = useAttachmentLibrary()
  const fields = useCustomFields()
  const { deleteQuickReply } = useQuickReplyMutations()

  /* ---------- painel ---------- */

  const panel = usePanelParam("reply")
  const selected = quickReplies?.find((reply) => reply.id === panel.selectedId) ?? null
  const panelOpen = panel.creating || Boolean(selected)
  const panelKey = useOpenCount(panelOpen)
  const shownReply = useRetained(selected)
  const shownCreating = useRetained(panel.creating ? ("new" as const) : selected ? ("edit" as const) : null)

  // Link para uma mensagem que não existe mais: a tela segue, sem painel nenhum.
  useEffect(() => {
    if (panel.selectedId && quickReplies && !selected) panel.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.selectedId, quickReplies, selected])

  /* ---------- filtros ---------- */

  const [query, setQuery] = useState("")
  const [contents, setContents] = useState<string[]>([])
  const [sort, setSort] = useState<SortOrder>("name-asc")
  const [page, setPage] = useState(1)

  const clearFilters = () => {
    setQuery("")
    setContents([])
    setPage(1)
  }

  const attachmentIds = useMemo(
    () => (library.attachments ? new Set(library.attachments.map((item) => item.id)) : null),
    [library.attachments]
  )

  const traitsOf = useMemo(() => {
    return (reply: QuickReply): ContentFilter[] => {
      const cited = citedAttachmentIds(reply.content)
      const traits: ContentFilter[] = []
      if (cited.length > 0) traits.push("attachment")
      if (usedVariableKeys(reply.content).length > 0) traits.push("variable")
      if (attachmentIds && cited.some((id) => !attachmentIds.has(id))) traits.push("broken")
      return traits
    }
  }, [attachmentIds])

  const counts = useMemo(() => {
    const tally: Record<ContentFilter, number> = { attachment: 0, variable: 0, broken: 0 }
    for (const reply of quickReplies ?? []) {
      for (const trait of traitsOf(reply)) tally[trait] += 1
    }
    return tally
  }, [quickReplies, traitsOf])

  const visible = useMemo(() => {
    const matching = (quickReplies ?? []).filter((reply) => {
      if (contents.length > 0 && !traitsOf(reply).some((trait) => contents.includes(trait))) {
        return false
      }
      return (
        !query ||
        matchesSearch(
          [reply.name, reply.trigger, reply.content.replace(/attachment_id_[\w-]+/g, "")].join(" "),
          query
        )
      )
    })
    return [...matching].sort((a, b) => {
      switch (sort) {
        case "recent":
          return b.updatedAt - a.updatedAt
        case "oldest":
          return a.createdAt - b.createdAt
        case "name-desc":
          return b.name.localeCompare(a.name, language)
        default:
          return a.name.localeCompare(b.name, language)
      }
    })
  }, [contents, language, query, quickReplies, sort, traitsOf])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const isFiltered = Boolean(query) || contents.length > 0

  const others = useMemo(
    () => (quickReplies ?? []).filter((reply) => reply.id !== shownReply?.id || panel.creating),
    [panel.creating, quickReplies, shownReply?.id]
  )

  const excerptContext = useMemo(
    () => buildExcerptContext(library.attachments, fields.customFields, t),
    [fields.customFields, library.attachments, t]
  )

  /* ---------- ações ---------- */

  async function remove(reply: QuickReply) {
    const confirmed = await confirm({
      title: t("content.quickReplies.delete.title", { name: reply.name }),
      description: t("content.quickReplies.delete.description", { trigger: reply.trigger }),
      confirmLabel: t("content.quickReplies.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteQuickReply(reply.id),
    })
    if (confirmed) {
      panel.close()
      toast.success(t("content.quickReplies.delete.done", { name: reply.name }))
    }
  }

  const filterOptions = [
    {
      value: "attachment",
      label: t("content.quickReplies.filters.attachment"),
      count: counts.attachment,
    },
    { value: "variable", label: t("content.quickReplies.filters.variable"), count: counts.variable },
    ...(counts.broken > 0
      ? [{ value: "broken", label: t("content.quickReplies.filters.broken"), count: counts.broken }]
      : []),
  ]

  return (
    <PageBody>
      <PageHeader
        description={
          <Trans
            i18nKey="content.quickReplies.description"
            components={{
              kbd: (
                <kbd className="rounded border bg-muted px-1 py-px font-mono text-xs text-foreground" />
              ),
            }}
          />
        }
        actions={
          <Button onClick={panel.openNew} className="pointer-coarse:h-10">
            <Plus />
            {t("content.quickReplies.create.action")}
          </Button>
        }
        mobileActions={
          <Button
            onClick={panel.openNew}
            aria-label={t("content.quickReplies.create.action")}
            className="pointer-coarse:h-10"
          >
            <Plus />
            {t("content.quickReplies.create.mobileAction")}
          </Button>
        }
        mobilePlacement="inline"
      />

      {error && !quickReplies ? (
        <ErrorState error={error} onRetry={reload} />
      ) : isLoading && !quickReplies ? (
        <SectionCard contentClassName="px-4">
          <ListSkeleton rows={6} />
        </SectionCard>
      ) : (quickReplies?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<MessageSquareText className="size-5" />}
          title={t("content.quickReplies.empty.title")}
          description={t("content.quickReplies.empty.description")}
          action={{ label: t("content.quickReplies.create.action"), onClick: panel.openNew }}
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
              placeholder: t("content.quickReplies.search"),
            }}
            activeCount={contents.length}
            onClear={clearFilters}
            resultLabel={t("content.quickReplies.count", { count: visible.length })}
            filters={
              <FacetedFilter
                title={t("content.quickReplies.filters.title")}
                options={filterOptions}
                value={contents}
                onChange={(value) => {
                  setContents(value)
                  setPage(1)
                }}
              />
            }
            sort={
              <SortMenu
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name-asc", label: t("content.quickReplies.sort.nameAsc") },
                  { value: "name-desc", label: t("content.quickReplies.sort.nameDesc") },
                  { value: "recent", label: t("content.quickReplies.sort.recent") },
                  { value: "oldest", label: t("content.quickReplies.sort.oldest") },
                ]}
              />
            }
          />

          {visible.length === 0 ? (
            <EmptyState
              title={t("content.quickReplies.noResults.title")}
              description={t("content.quickReplies.noResults.description")}
              action={
                isFiltered
                  ? { label: t("content.common.clearFilters"), onClick: clearFilters }
                  : undefined
              }
            />
          ) : (
            <SectionCard contentClassName="px-1.5 md:px-2">
              <ul className="flex flex-col divide-y">
                <AnimatePresence initial={false}>
                  {pageItems.map((reply) => {
                    const traits = traitsOf(reply)
                    return (
                      <motion.li key={reply.id} {...preset.listItem} className="min-w-0">
                        <div className="flex items-start gap-1 rounded-lg transition-colors hover:bg-muted/50">
                          <button
                            type="button"
                            onClick={() => panel.open(reply.id)}
                            className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg px-2 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:flex-row md:gap-4"
                          >
                            <code className="w-fit max-w-full shrink-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground md:mt-0.5 md:w-36">
                              /{reply.trigger}
                            </code>
                            <span className="min-w-0 flex-1 space-y-0.5">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-medium">{reply.name}</span>
                                {traits.includes("broken") ? (
                                  <StatusBadge tone="danger" dot={false} icon={<AlertTriangle />}>
                                    {t("content.quickReplies.brokenBadge")}
                                  </StatusBadge>
                                ) : traits.includes("variable") ? (
                                  <Braces
                                    aria-label={t("content.quickReplies.hasVariables")}
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                  />
                                ) : null}
                              </span>
                              <span className="line-clamp-2 text-sm text-pretty text-muted-foreground">
                                <ContentExcerpt content={reply.content} context={excerptContext} />
                              </span>
                            </span>
                          </button>
                          <RelativeTime
                            value={reply.updatedAt}
                            className="mt-3 hidden shrink-0 text-xs text-muted-foreground md:block"
                          />
                          <ActionsMenu
                            className="mt-1.5 mr-0.5 shrink-0"
                            label={t("content.quickReplies.actionsOf", { name: reply.name })}
                            actions={[
                              {
                                label: t("content.quickReplies.edit.action"),
                                icon: <Pencil />,
                                onSelect: () => panel.open(reply.id),
                              },
                              {
                                label: t("content.quickReplies.delete.action"),
                                icon: <Trash2 />,
                                destructive: true,
                                separatorBefore: true,
                                onSelect: () => void remove(reply),
                              },
                            ]}
                          />
                        </div>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            </SectionCard>
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

      {shownCreating ? (
        <Suspense fallback={null}>
          <QuickReplyPanel
            key={panelKey}
            reply={shownCreating === "edit" ? shownReply : null}
            others={others}
            open={panelOpen}
            onOpenChange={(open) => {
              if (!open) panel.close()
            }}
            onDelete={(reply) => void remove(reply)}
          />
        </Suspense>
      ) : null}
    </PageBody>
  )
}
