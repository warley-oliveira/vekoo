import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Trash2, UserRoundX } from "lucide-react"
import { toast } from "@/lib/campaigns-wizard/notify"

import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  SearchInput,
  ResponsiveDialog,
  TablePagination,
  UserAvatar,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useRecipientSummary } from "@/hooks/campaigns-wizard/use-campaign-options"
import { useApi } from "@/hooks/use-api"
import { apiDelete } from "@/lib/api"
import type { RecipientsResponse, RemoveResult } from "@/lib/campaigns-wizard/types"
import { formatNumber } from "@/lib/format-number"
import { formatPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"

const PER_PAGE = 25

/** Conferir quem vai receber, procurar alguém e tirar quem não devia estar ali. */
export default function RecipientsPanel({
  campaignId,
  onClose,
}: {
  campaignId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const { reload: reloadSummary } = useRecipientSummary(campaignId)

  const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) })
  if (query.trim()) params.set("q", query.trim())

  const { data, error, isLoading, isValidating, mutate } = useApi<RecipientsResponse>(
    `/campaigns/${campaignId}/recipients?${params}`,
    { keepPreviousData: true, revalidateOnFocus: false }
  )

  const total = data?.meta.total ?? 0

  function close() {
    setOpen(false)
    onClose()
  }

  async function removeOne(id: string, name: string) {
    const confirmed = await confirm({
      title: t("campaignsWizard.recipients.removeOneTitle", { name }),
      description: t("campaignsWizard.recipients.removeOneHint"),
      confirmLabel: t("campaignsWizard.audience.remove"),
      destructive: true,
      onConfirm: async () => {
        await apiDelete<RemoveResult>(`/campaigns/${campaignId}/recipients/${id}`)
        await Promise.all([mutate(), reloadSummary()])
      },
    })
    if (confirmed) toast.success(t("campaignsWizard.recipients.removedOne", { name }))
  }

  async function removeAll() {
    const confirmed = await confirm({
      title: t("campaignsWizard.recipients.removeAllTitle"),
      description: t("campaignsWizard.recipients.removeAllHint", {
        count: total,
        formatted: formatNumber(total, language),
      }),
      confirmLabel: t("campaignsWizard.recipients.removeAll"),
      destructive: true,
      onConfirm: async () => {
        await apiDelete<RemoveResult>(`/campaigns/${campaignId}/recipients`)
        await Promise.all([mutate(), reloadSummary()])
      },
    })
    if (confirmed) {
      toast.success(t("campaignsWizard.audience.removed"))
      close()
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      size="lg"
      title={t("campaignsWizard.recipients.title")}
      description={t("campaignsWizard.recipients.description")}
      footer={
        <>
          {total > 0 && !query.trim() ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive sm:mr-auto pointer-coarse:h-10"
              onClick={() => void removeAll()}
            >
              <Trash2 />
              {t("campaignsWizard.recipients.removeAll")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={close}>
            {t("campaignsWizard.actions.close")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SearchInput
          value={query}
          onChange={(next) => {
            setQuery(next)
            setPage(1)
          }}
          loading={isValidating}
          shortcut={false}
          placeholder={t("campaignsWizard.recipients.search")}
        />

        {isLoading && !data ? (
          <ListSkeleton rows={8} avatar />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void mutate()} className="border-0 p-4" />
        ) : data && data.recipients.length > 0 ? (
          <>
            <ul className="divide-y rounded-lg border">
              {data.recipients.map((recipient) => (
                <li key={recipient.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                  <UserAvatar name={recipient.contactName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{recipient.contactName}</span>
                    <span className="block truncate text-xs text-muted-foreground tabular-nums">
                      {formatPhone(recipient.phoneNumber)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground pointer-coarse:size-10"
                    aria-label={t("campaignsWizard.recipients.removeOne", { name: recipient.contactName })}
                    onClick={() => void removeOne(recipient.id, recipient.contactName)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <TablePagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              perPage={data.meta.perPage}
              onPageChange={setPage}
            />
          </>
        ) : (
          <EmptyState
            icon={<UserRoundX className="size-5" />}
            title={
              query.trim()
                ? t("campaignsWizard.recipients.noResults")
                : t("campaignsWizard.recipients.empty")
            }
            className="border-0 p-6"
          />
        )}
      </div>
    </ResponsiveDialog>
  )
}
