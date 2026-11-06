import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import {
  Download,
  FolderOpen,
  LayoutGrid,
  List,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { AttachmentPanel } from "@/components/content/attachment-panel"
import { AttachmentThumb } from "@/components/content/attachment-thumb"
import {
  AttachmentGridSkeleton,
  AttachmentListSkeleton,
} from "@/components/content/content-skeletons"
import {
  ActionsMenu,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FileDropzone,
  FilterBar,
  PageBody,
  PageHeader,
  RelativeTime,
  SectionCard,
  SegmentedControl,
  SortMenu,
  TablePagination,
  useConfirm,
  type DropzoneFile,
  type RowAction,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  useAttachment,
  useAttachmentMutations,
  useAttachments,
} from "@/hooks/content/use-attachments"
import { usePanelParam } from "@/hooks/content/use-panel-param"
import { useQuickReplies } from "@/hooks/content/use-quick-replies"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { apiAssetUrl, apiUpload } from "@/lib/api"
import { nameFromFileName } from "@/lib/content/attachment-file"
import { quickRepliesCiting } from "@/lib/content/quick-reply-content"
import {
  ATTACHMENT_KINDS,
  type Attachment,
  type AttachmentKind,
  type AttachmentSortField,
} from "@/lib/content/types"
import { downloadFile, formatFileSize, getFileExtension } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

type SortKey = `${AttachmentSortField}-${"asc" | "desc"}`
type ViewMode = "grid" | "list"

const MAX_FILE_BYTES = 100 * 1024 * 1024
const PER_PAGE_OPTIONS = [12, 24, 48, 96]
const DEFAULT_PER_PAGE = 24
const VIEW_KEY = "vekoo.content.attachments.view"

function parseSort(sort: SortKey) {
  const [sortBy, sortOrder] = sort.split("-") as [AttachmentSortField, "asc" | "desc"]
  return { sortBy, sortOrder }
}

export default function AttachmentsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const confirm = useConfirm()
  const { deleteAttachment, revalidate } = useAttachmentMutations()
  const { quickReplies } = useQuickReplies()

  /* ---------- filtros: tudo no servidor, porque a biblioteca é paginada ---------- */

  const [query, setQuery] = useState("")
  const [kinds, setKinds] = useState<AttachmentKind[]>([])
  const [sort, setSort] = useState<SortKey>("created_at-desc")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE)
  const [view, setView] = useLocalStorage<ViewMode>(VIEW_KEY, "grid")

  const { attachments, meta, error, isLoading, isValidating, reload } = useAttachments({
    page,
    perPage,
    search: query,
    kinds,
    ...parseSort(sort),
  })

  const isFiltered = Boolean(query) || kinds.length > 0
  const clearFilters = () => {
    setQuery("")
    setKinds([])
    setPage(1)
  }

  // Excluiu o último da última página: volta para a que ainda existe.
  useEffect(() => {
    if (meta && meta.totalPages > 0 && page > meta.totalPages) setPage(meta.totalPages)
  }, [meta, page])

  /* ---------- painel ---------- */

  const panel = usePanelParam("attachment")
  const fromList = attachments?.find((item) => item.id === panel.selectedId) ?? null
  const [removingId, setRemovingId] = useState<string | null>(null)
  // Aberto por link, ou fora da página atual: busca o próprio registro. O que acabou de ser
  // excluído não: a lista pode chegar sem ele antes de o endereço mudar, e daria 404 à toa.
  const direct = useAttachment(
    panel.selectedId && !fromList && panel.selectedId !== removingId ? panel.selectedId : null
  )
  const selected = fromList ?? direct.attachment
  const panelOpen = Boolean(panel.selectedId && selected)
  const panelKey = useOpenCount(panelOpen)
  const shownAttachment = useRetained(selected)

  // Link para um anexo que não existe mais: a tela segue, sem painel nenhum.
  useEffect(() => {
    if (panel.selectedId && direct.error) panel.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct.error, panel.selectedId])

  /* ---------- enviar ---------- */

  const [showUpload, setShowUpload] = useState(false)
  const [uploads, setUploads] = useState<DropzoneFile[]>([])
  const uploadsRef = useRef(uploads)
  const finishedInBatch = useRef(0)

  const uploading = uploads.some((item) => item.status === "uploading")
  const leaveGuard = useUnsavedChanges(uploading)

  const uploadConfig = useMemo(
    () => ({
      // O envio leva o nome sem a extensão: é assim que a pessoa quer ver na biblioteca.
      send: (file: File, options: { onProgress: (fraction: number) => void; signal: AbortSignal }) => {
        const body = new FormData()
        body.append("file", file)
        body.append("name", nameFromFileName(file.name))
        return apiUpload("/attachments", body, options)
      },
      onSuccess: (_response: unknown, item: DropzoneFile) => {
        if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl)
        void revalidate()

        finishedInBatch.current += 1
        const stillGoing = uploadsRef.current.some((other) => other.status === "uploading")
        if (stillGoing) return

        toast.success(t("content.attachments.upload.done", { count: finishedInBatch.current }))
        finishedInBatch.current = 0
        // Terminou limpo: o que a pessoa quer ver agora são os arquivos na lista.
        if (uploadsRef.current.length === 0) setShowUpload(false)
      },
    }),
    [revalidate, t]
  )

  /* ---------- ações ---------- */

  function usedBy(attachment: Attachment) {
    return quickReplies ? quickRepliesCiting(quickReplies, attachment.id) : []
  }

  async function remove(attachment: Attachment) {
    const citing = usedBy(attachment)
    const confirmed = await confirm({
      title: t("content.attachments.delete.title", { name: attachment.name }),
      description:
        citing.length > 0
          ? t("content.attachments.delete.descriptionUsed", {
              count: citing.length,
              names: new Intl.ListFormat(language, { type: "conjunction" }).format(
                citing.map((reply) => reply.name)
              ),
            })
          : t("content.attachments.delete.description"),
      confirmLabel: t("content.attachments.delete.confirm"),
      destructive: true,
      onConfirm: async () => {
        setRemovingId(attachment.id)
        try {
          await deleteAttachment(attachment.id)
          panel.close()
        } catch (cause) {
          setRemovingId(null)
          throw cause
        }
      },
    })
    if (confirmed) toast.success(t("content.attachments.delete.done", { name: attachment.name }))
  }

  function actionsFor(attachment: Attachment): RowAction[] {
    const file = attachment.file
    return [
      {
        label: t("content.attachments.actions.open"),
        icon: <Pencil />,
        onSelect: () => panel.open(attachment.id),
      },
      {
        label: t("content.attachments.actions.download"),
        icon: <Download />,
        hidden: !file,
        onSelect: () => {
          if (file) void downloadFile(apiAssetUrl(file.url), { fileName: file.filename })
        },
      },
      {
        label: t("content.attachments.delete.action"),
        icon: <Trash2 />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => void remove(attachment),
      },
    ]
  }

  const describe = (attachment: Attachment) =>
    attachment.file
      ? [
          getFileExtension(attachment.file.filename),
          formatFileSize(attachment.file.byteSize, language),
        ]
          .filter(Boolean)
          .join(" · ")
      : t("content.attachments.noFile")

  const openUpload = () => setShowUpload(true)
  const items = attachments ?? []
  const firstLoad = isLoading && !attachments
  const libraryEmpty = !isFiltered && meta?.total === 0

  return (
    <PageBody>
      <PageHeader
        description={t("content.attachments.description")}
        actions={
          <Button onClick={openUpload} className="pointer-coarse:h-10">
            <Upload />
            {t("content.attachments.upload.action")}
          </Button>
        }
        mobileActions={
          <Button
            onClick={openUpload}
            aria-label={t("content.attachments.upload.action")}
            className="pointer-coarse:h-10"
          >
            <Upload />
            {t("content.attachments.upload.mobileAction")}
          </Button>
        }
        mobilePlacement="inline"
      />

      <AnimatePresence initial={false}>
        {showUpload || uploads.length > 0 ? (
          <motion.section
            key="upload"
            {...preset.slideUp}
            aria-label={t("content.attachments.upload.title")}
            className="relative rounded-xl p-3 ring-1 ring-foreground/10"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{t("content.attachments.upload.title")}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={uploading}
                aria-label={t("content.attachments.upload.close")}
                onClick={() => {
                  setShowUpload(false)
                  setUploads([])
                }}
              >
                <X />
              </Button>
            </div>
            <FileDropzone
              value={uploads}
              // O que terminou sai daqui e aparece na lista logo abaixo, sem duas cópias à vista.
              onChange={(next) => {
                const pending = next.filter((item) => item.status !== "done")
                uploadsRef.current = pending
                setUploads(pending)
              }}
              maxSize={MAX_FILE_BYTES}
              upload={uploadConfig}
            />
          </motion.section>
        ) : null}
      </AnimatePresence>

      {error && !attachments ? (
        <ErrorState error={error} onRetry={reload} />
      ) : libraryEmpty && !isLoading ? (
        <EmptyState
          icon={<FolderOpen className="size-5" />}
          title={t("content.attachments.empty.title")}
          description={t("content.attachments.empty.description")}
          action={{ label: t("content.attachments.upload.action"), onClick: openUpload }}
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
              loading: isValidating && Boolean(query),
              placeholder: t("content.attachments.search"),
            }}
            activeCount={kinds.length}
            onClear={clearFilters}
            resultLabel={meta ? t("content.attachments.count", { count: meta.total }) : undefined}
            filters={
              <FacetedFilter
                title={t("content.attachments.filters.kind")}
                options={ATTACHMENT_KINDS.map((kind) => ({
                  value: kind,
                  label: t(`content.attachments.kinds.${kind}`),
                }))}
                value={kinds}
                onChange={(value) => {
                  setKinds(value as AttachmentKind[])
                  setPage(1)
                }}
              />
            }
            sort={
              <SortMenu
                value={sort}
                onChange={(value) => {
                  setSort(value)
                  setPage(1)
                }}
                options={[
                  { value: "created_at-desc" as SortKey, label: t("content.attachments.sort.newest") },
                  { value: "created_at-asc" as SortKey, label: t("content.attachments.sort.oldest") },
                  { value: "name-asc" as SortKey, label: t("content.attachments.sort.nameAsc") },
                  { value: "name-desc" as SortKey, label: t("content.attachments.sort.nameDesc") },
                  { value: "updated_at-desc" as SortKey, label: t("content.attachments.sort.updated") },
                ]}
              />
            }
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("content.common.refresh")}
                  onClick={reload}
                  // No celular não cabe na linha, e a lista já se atualiza ao voltar para o app.
                  className="hidden text-muted-foreground md:inline-flex"
                >
                  <RefreshCw className={cn(isValidating && "animate-spin")} />
                </Button>
                <SegmentedControl
                  aria-label={t("content.attachments.view.label")}
                  value={view}
                  onChange={setView}
                  options={[
                    {
                      value: "grid",
                      label: <LayoutGrid className="size-4" />,
                      "aria-label": t("content.attachments.view.grid"),
                    },
                    {
                      value: "list",
                      label: <List className="size-4" />,
                      "aria-label": t("content.attachments.view.list"),
                    },
                  ]}
                />
              </>
            }
          />

          {firstLoad ? (
            view === "grid" ? (
              <AttachmentGridSkeleton />
            ) : (
              <AttachmentListSkeleton />
            )
          ) : items.length === 0 ? (
            <EmptyState
              title={t("content.attachments.noResults.title")}
              description={t("content.attachments.noResults.description")}
              action={{ label: t("content.common.clearFilters"), onClick: clearFilters }}
            />
          ) : view === "grid" ? (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              <AnimatePresence initial={false}>
                {items.map((attachment) => (
                  <motion.li key={attachment.id} {...preset.listItem} className="min-w-0">
                    <AttachmentCard
                      attachment={attachment}
                      meta={describe(attachment)}
                      onOpen={() => panel.open(attachment.id)}
                      actions={actionsFor(attachment)}
                      actionsLabel={t("content.attachments.actionsOf", { name: attachment.name })}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <SectionCard contentClassName="px-1.5 md:px-2">
              <ul className="flex flex-col divide-y">
                <AnimatePresence initial={false}>
                  {items.map((attachment) => (
                    <motion.li key={attachment.id} {...preset.listItem} className="min-w-0">
                      <AttachmentRow
                        attachment={attachment}
                        meta={describe(attachment)}
                        onOpen={() => panel.open(attachment.id)}
                        actions={actionsFor(attachment)}
                        actionsLabel={t("content.attachments.actionsOf", { name: attachment.name })}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </SectionCard>
          )}

          {meta && meta.total > 0 ? (
            <TablePagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              perPage={meta.perPage}
              perPageOptions={PER_PAGE_OPTIONS}
              onPageChange={setPage}
              onPerPageChange={(next) => {
                setPerPage(next)
                setPage(1)
              }}
            />
          ) : null}
        </div>
      )}

      {shownAttachment ? (
        <AttachmentPanel
          key={panelKey}
          attachment={shownAttachment}
          usedBy={quickReplies ? quickRepliesCiting(quickReplies, shownAttachment.id) : undefined}
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) panel.close()
          }}
          onDelete={(attachment) => void remove(attachment)}
        />
      ) : null}

      <ConfirmDialog
        open={leaveGuard.blocked}
        onOpenChange={(open) => {
          if (!open) leaveGuard.reset()
        }}
        onConfirmed={leaveGuard.proceed}
        destructive
        title={t("content.attachments.upload.leaveTitle")}
        description={t("content.attachments.upload.leaveDescription")}
        confirmLabel={t("content.attachments.upload.leaveConfirm")}
        cancelLabel={t("content.attachments.upload.leaveCancel")}
      />
    </PageBody>
  )
}

type AttachmentItemProps = {
  attachment: Attachment
  meta: string
  onOpen: () => void
  actions: RowAction[]
  actionsLabel: string
}

function AttachmentCard({ attachment, meta, onOpen, actions, actionsLabel }: AttachmentItemProps) {
  const { t } = useTranslation()

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-xl ring-1 ring-foreground/10 transition-colors hover:bg-muted/40">
      {/* Absoluta: em altura percentual, a imagem esticaria a caixa até a proporção dela. */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <span className="absolute inset-0">
          <AttachmentThumb file={attachment.file} iconClassName="size-7" />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-start gap-1 p-3 pr-1.5">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="min-w-0 text-sm leading-snug font-medium">
            <button
              type="button"
              onClick={onOpen}
              title={attachment.name}
              className="line-clamp-2 w-full rounded text-left wrap-anywhere outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {attachment.name}
            </button>
          </h2>
          <p className="line-clamp-2 text-xs text-pretty text-muted-foreground">
            {attachment.description || t("content.attachments.noDescription")}
          </p>
          <p className="truncate text-xs text-muted-foreground tabular-nums">{meta}</p>
        </div>
        <ActionsMenu
          actions={actions}
          label={actionsLabel}
          className="relative z-10 -mt-1 shrink-0"
        />
      </div>
    </article>
  )
}

function AttachmentRow({ attachment, meta, onOpen, actions, actionsLabel }: AttachmentItemProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-1 rounded-lg transition-colors hover:bg-muted/50">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
          <AttachmentThumb file={attachment.file} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{attachment.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {attachment.description || t("content.attachments.noDescription")}
          </span>
        </span>
        <span className="hidden w-48 shrink-0 truncate text-xs text-muted-foreground lg:block">
          {attachment.file?.filename}
        </span>
        <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground tabular-nums sm:block">
          {meta}
        </span>
      </button>
      <RelativeTime
        value={attachment.createdAt}
        className="hidden w-28 shrink-0 text-xs text-muted-foreground md:block"
      />
      <ActionsMenu actions={actions} label={actionsLabel} className="mr-0.5 shrink-0" />
    </div>
  )
}
