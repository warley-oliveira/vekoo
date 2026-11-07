import { forwardRef, memo, useCallback, useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Copy, MessageCircle, MessageCircleReply, Users } from "lucide-react"
import { toast } from "sonner"

import {
  DataTable,
  FacetedFilter,
  FilterBar,
  StatusBadge,
  type RowAction,
} from "@/components/shared"
import { useCampaignRecipients, RECIPIENT_PER_PAGE_OPTIONS } from "@/hooks/campaigns/use-campaign-recipients"
import { useCan } from "@/hooks/use-can"
import { formatShortDateTime } from "@/lib/campaigns/format"
import { RECIPIENT_TONES } from "@/lib/campaigns/status"
import { RECIPIENT_STATUSES, type Recipient } from "@/lib/campaigns/types"
import { formatFullDateTime } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { formatPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"

const KNOWN_FAILURES = new Set([
  "whatsappError",
  "numberNotFound",
  "noPhoneNumber",
  "mediaUnsupported",
  "mediaUnavailable",
  "templateUnavailable",
  "interrupted",
])

/** O motivo da falha em linguagem de gente, e o que o canal disse, quando disse algo a mais. */
function FailureReason({ recipient }: { recipient: Recipient }) {
  const { t } = useTranslation()
  const code = recipient.errorCode

  if (!code || !KNOWN_FAILURES.has(code)) {
    return recipient.errorMessage ? (
      <p className="text-xs text-pretty text-muted-foreground">{recipient.errorMessage}</p>
    ) : null
  }

  // O código já diz tudo; só `whatsappError` pode trazer um motivo próprio do canal.
  const channelSaid =
    code === "whatsappError" && recipient.errorMessage && recipient.errorMessage !== t("campaigns.failure.serverDefault")
      ? recipient.errorMessage
      : null

  return (
    <p className="text-xs text-pretty text-muted-foreground">
      {t(`campaigns.failure.${code}`)}
      {channelSaid ? ` ${t("campaigns.failure.channelSaid", { reason: channelSaid })}` : null}
    </p>
  )
}

function StepTime({ value }: { value: number | null | undefined }) {
  const { t } = useTranslation()
  const language = useLanguage()

  if (!value) return <span className="text-muted-foreground">{t("kit.noValue")}</span>
  return (
    <time
      dateTime={new Date(value).toISOString()}
      title={formatFullDateTime(value, language)}
      className="tabular-nums"
    >
      {formatShortDateTime(value, language)}
    </time>
  )
}

/** A hora mais recente, para o celular: lá não cabem quatro colunas de data. */
function latestStep(recipient: Recipient): number | null {
  return recipient.repliedAt ?? recipient.readAt ?? recipient.deliveredAt ?? recipient.sentAt
}

type RecipientsSectionProps = {
  campaignId: string
  /** Sem contatos ainda, um rascunho pode ir adicionar. */
  emptyAction?: { label: string; onClick: () => void }
}

/**
 * Quem recebe. Aqui a tabela é a forma certa: comparar quando saiu, chegou e foi lida, pessoa por
 * pessoa, é o trabalho. A fusão ao vivo é feita no cache, e a tabela só vê a página que está aberta.
 */
export const RecipientsSection = memo(
  forwardRef<HTMLElement, RecipientsSectionProps>(function RecipientsSection(
    { campaignId, emptyAction },
    ref
  ) {
    const { t } = useTranslation()
    const language = useLanguage()
    const navigate = useNavigate()
    const canOpenChat = useCan("chat")

    const { data, error, isLoading, mutate, filters, setQuery, setStatuses, setPage, setPerPage, clear } =
      useCampaignRecipients(campaignId)

    const statusOptions = useMemo(
      () => [
        ...RECIPIENT_STATUSES.map((status) => ({
          value: status as string,
          label: t(`campaigns.recipientStatus.${status}`),
        })),
        { value: "replied", label: t("campaigns.recipientStatus.replied") },
      ],
      [t]
    )

    const columns = useMemo<ColumnDef<Recipient, unknown>[]>(
      () => [
        {
          id: "contact",
          header: t("campaigns.recipients.columns.contact"),
          meta: { mobile: "primary", className: "whitespace-normal min-w-44" },
          cell: ({ row }) => (
            <div className="min-w-0">
              <p className="truncate font-medium">
                {row.original.contactName || t("campaigns.recipients.noName")}
              </p>
              <p className="text-xs font-normal text-muted-foreground tabular-nums">
                {formatPhone(row.original.phoneNumber)}
              </p>
            </div>
          ),
        },
        {
          id: "status",
          header: t("campaigns.recipients.columns.status"),
          meta: { mobile: "secondary", className: "whitespace-normal min-w-60" },
          cell: ({ row }) => (
            <div className="flex min-w-0 flex-col items-start gap-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={RECIPIENT_TONES[row.original.status]}>
                  {t(`campaigns.recipientStatus.${row.original.status}`)}
                </StatusBadge>
                {row.original.repliedAt ? (
                  <StatusBadge tone="accent" icon={<MessageCircleReply />}>
                    {t("campaigns.recipientStatus.replied")}
                  </StatusBadge>
                ) : null}
              </div>
              {row.original.status === "failed" ? <FailureReason recipient={row.original} /> : null}
              {row.original.status === "skipped" ? (
                <p className="text-xs text-pretty text-muted-foreground">
                  {t("campaigns.recipients.skippedHint")}
                </p>
              ) : null}
            </div>
          ),
        },
        {
          id: "sentAt",
          header: t("campaigns.recipients.columns.sentAt"),
          meta: { mobile: "hidden", className: "w-28" },
          cell: ({ row }) => <StepTime value={row.original.sentAt} />,
        },
        {
          id: "deliveredAt",
          header: t("campaigns.recipients.columns.deliveredAt"),
          meta: { mobile: "hidden", className: "w-28" },
          cell: ({ row }) => <StepTime value={row.original.deliveredAt} />,
        },
        {
          id: "readAt",
          header: t("campaigns.recipients.columns.readAt"),
          meta: { mobile: "hidden", className: "w-28" },
          cell: ({ row }) => <StepTime value={row.original.readAt} />,
        },
        {
          id: "latest",
          header: t("campaigns.recipients.columns.latest"),
          meta: { className: "md:hidden" },
          cell: ({ row }) => <StepTime value={latestStep(row.original)} />,
        },
      ],
      [t]
    )

    // Estável: a tabela refaz a coluna de ações quando esta função muda, e um menu aberto fecharia.
    const rowActions = useCallback(
      (recipient: Recipient): RowAction[] => [
        {
          label: t("campaigns.recipients.openChat"),
          icon: <MessageCircle />,
          hidden: !canOpenChat || !recipient.chatId,
          onSelect: () => navigate(`/chat/${recipient.chatId}`),
        },
        {
          label: t("campaigns.recipients.copyPhone"),
          icon: <Copy />,
          onSelect: () => {
            navigator.clipboard.writeText(recipient.phoneNumber).then(
              () => toast.success(t("campaigns.recipients.phoneCopied")),
              () => toast.error(t("campaigns.recipients.copyFailed"))
            )
          },
        },
      ],
      [canOpenChat, navigate, t]
    )

    const meta = data?.meta
    const total = meta?.total ?? 0
    const firstLoad = isLoading && !data

    return (
      <section ref={ref} aria-labelledby="campaign-recipients" className="flex min-w-0 scroll-mt-24 flex-col gap-3">
        <h2 id="campaign-recipients" className="font-heading text-base font-semibold tracking-tight">
          {t("campaigns.recipients.title")}
        </h2>

        <FilterBar
          search={{
            value: filters.q,
            onChange: setQuery,
            placeholder: t("campaigns.recipients.search"),
            className: "md:w-64",
          }}
          activeCount={filters.statuses.length > 0 ? 1 : 0}
          onClear={clear}
          resultLabel={
            total > 0
              ? t("campaigns.recipients.count", { count: total, formatted: formatNumber(total, language) })
              : undefined
          }
          filters={
            <FacetedFilter
              title={t("campaigns.recipients.columns.status")}
              options={statusOptions}
              value={filters.statuses}
              onChange={setStatuses}
            />
          }
        />

        <DataTable
          aria-label={t("campaigns.recipients.title")}
          columns={columns}
          data={data?.recipients ?? []}
          meta={meta}
          isLoading={firstLoad}
          // Só ao trocar de página ou de filtro: a revalidação ao vivo não esmaece a tabela.
          isFetching={isLoading && !firstLoad}
          error={error}
          onRetry={() => void mutate()}
          onPageChange={setPage}
          onPerPageChange={setPerPage}
          perPageOptions={RECIPIENT_PER_PAGE_OPTIONS}
          isFiltered={Boolean(filters.q || filters.statuses.length)}
          onClearFilters={clear}
          rowActions={rowActions}
          onRowClick={
            canOpenChat
              ? (recipient) => {
                  if (recipient.chatId) navigate(`/chat/${recipient.chatId}`)
                }
              : undefined
          }
          rowClassName={(recipient) => (recipient.chatId ? undefined : "cursor-default")}
          empty={{
            icon: <Users className="size-5" />,
            title: t("campaigns.recipients.empty.title"),
            description: t("campaigns.recipients.empty.description"),
            action: emptyAction,
          }}
        />
      </section>
    )
  })
)
