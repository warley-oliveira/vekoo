import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Zap, ZapOff } from "lucide-react"

import { ChannelMark } from "@/components/connectors/channel-mark"
import { useConnectorTexts } from "@/components/connectors/connector-texts"
import { RelativeTime, StatusBadge, TagChip, UserAvatar } from "@/components/shared"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ContactLookups } from "@/hooks/contacts/use-contacts"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { apiAssetUrl } from "@/lib/api"
import { IDENTITY_COLUMN, customColumnId } from "@/lib/contacts/columns"
import { contactName, contactPhone, lastMessageText } from "@/lib/contacts/format"
import type { Contact, CustomField } from "@/lib/contacts/types"
import { formatDate, isValidDate, toDate } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { formatPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const MAX_VISIBLE_TAGS = 2

function NoValue({ children }: { children?: string }) {
  const { t } = useTranslation()
  return <span className="text-muted-foreground">{children ?? t("kit.noValue")}</span>
}

function ContactIdentity({ contact, canOpenChat }: { contact: Contact; canOpenChat: boolean }) {
  const { t } = useTranslation()
  const name = contactName(contact)
  const phone = contactPhone(contact)
  const label = name ?? t("contacts.noName")

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar
        name={name}
        src={contact.profilePictureUrl ? apiAssetUrl(contact.profilePictureUrl) : null}
      />
      <div className="min-w-0 flex-1 leading-tight">
        {canOpenChat ? (
          <Link
            to={`/chat/${contact.id}`}
            title={t("contacts.row.openChat")}
            className={cn(
              "block truncate text-sm font-medium outline-none hover:underline focus-visible:underline",
              !name && "text-muted-foreground"
            )}
          >
            {label}
          </Link>
        ) : (
          <p className={cn("truncate text-sm font-medium", !name && "text-muted-foreground")}>
            {label}
          </p>
        )}
        {phone ? (
          <p className="truncate text-xs font-normal text-muted-foreground tabular-nums">
            {formatPhone(phone)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function ContactConnector({ contact, lookups }: { contact: Contact; lookups: ContactLookups }) {
  const { t } = useTranslation()
  const texts = useConnectorTexts()
  const connector = contact.connectorId ? lookups.connectors.get(contact.connectorId) : undefined
  const name = connector ? texts.title(connector) : contact.connectorName

  if (!contact.connectorType) return <NoValue>{t("contacts.connector.removed")}</NoValue>

  return (
    <span
      className="flex min-w-0 items-center gap-2"
      title={connector ? texts.typeLabel(connector) : undefined}
    >
      <ChannelMark type={contact.connectorType} size="sm" className="max-md:hidden" />
      <span className="truncate md:max-w-32">{name}</span>
    </span>
  )
}

function ContactTags({ contact, lookups }: { contact: Contact; lookups: ContactLookups }) {
  const { t } = useTranslation()
  const tags = contact.tagIds.flatMap((id) => {
    const tag = lookups.tags.get(id)
    return tag ? [tag] : []
  })

  if (tags.length === 0) return <NoValue />

  const visible = tags.slice(0, MAX_VISIBLE_TAGS)
  const rest = tags.slice(MAX_VISIBLE_TAGS)

  return (
    // Em uma linha só na tabela: as linhas com a mesma altura são o que deixa comparar.
    <div className="flex min-w-0 flex-wrap items-center gap-1 md:flex-nowrap">
      {visible.map((tag) => (
        <TagChip key={tag.id} color={tag.color} className="max-w-28">
          {tag.name}
        </TagChip>
      ))}
      {rest.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                aria-label={t("contacts.row.moreTags", {
                  count: rest.length,
                  names: rest.map((tag) => tag.name).join(", "),
                })}
                className="rounded px-1 text-xs text-muted-foreground tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            }
          >
            {t("contacts.row.moreCount", { count: rest.length })}
          </TooltipTrigger>
          <TooltipContent>{rest.map((tag) => tag.name).join(", ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

function ContactAssignee({ contact, lookups }: { contact: Contact; lookups: ContactLookups }) {
  const { t } = useTranslation()

  if (!contact.assignedAccountId) return <NoValue>{t("contacts.assignee.none")}</NoValue>

  // Fora da lista: perdeu o acesso, mas a conversa segue no nome dela.
  const user = lookups.users.get(contact.assignedAccountId)
  if (!user) return <NoValue>{t("contacts.assignee.unknown")}</NoValue>

  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar name={user.name} size="sm" className="max-md:hidden" />
      <span className="truncate md:max-w-32">{user.name}</span>
    </span>
  )
}

function LastMessage({ contact }: { contact: Contact }) {
  const { t } = useTranslation()

  if (!contact.lastMessageAt) return <NoValue />

  const text =
    lastMessageText(contact) ??
    t(`contacts.lastMessage.types.${contact.lastMessageType ?? "other"}`, {
      defaultValue: t("contacts.lastMessage.types.other"),
    })

  return (
    <div className="min-w-0 leading-tight">
      <RelativeTime value={contact.lastMessageAt} className="text-sm" />
      <p title={text} className="truncate text-xs font-normal text-muted-foreground md:max-w-44">
        {text}
      </p>
    </div>
  )
}

function CustomValue({ contact, field }: { contact: Contact; field: CustomField }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const raw = contact.customAttributes[field.key]

  if (raw === undefined || raw === null || raw === "") {
    // Caixa de marcar que ninguém preencheu é "não", e não falta de dado.
    return field.valueType === "checkbox" ? (
      <NoValue>{t("contacts.custom.no")}</NoValue>
    ) : (
      <NoValue />
    )
  }

  switch (field.valueType) {
    case "checkbox":
      return raw === "true" ? t("contacts.custom.yes") : <NoValue>{t("contacts.custom.no")}</NoValue>
    case "number": {
      const number = Number(raw)
      return Number.isFinite(number) ? (
        <span className="tabular-nums">{formatNumber(number, language)}</span>
      ) : (
        raw
      )
    }
    case "date": {
      // Só a data, sem hora: lida como meia-noite em UTC, voltaria um dia no Brasil.
      const date = toDate(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw)
      return isValidDate(date) ? formatDate(date, language) : raw
    }
    default:
      return (
        <span title={raw} className="block max-w-48 truncate">
          {raw}
        </span>
      )
  }
}

export type UseContactColumnsArgs = {
  lookups: ContactLookups
  customFields: CustomField[] | undefined
  /** As escolhidas pela pessoa, sem contar nome e telefone. */
  visible: string[]
  canOpenChat: boolean
}

/**
 * As colunas da lista. O `DataTable` não sabe esconder coluna, então quem não foi escolhida não
 * entra. No celular entra, mas fora da lista empilhada: é de lá que sai o menu de ordem, e a
 * ordem não pode sumir só porque a coluna não está à vista.
 */
export function useContactColumns({
  lookups,
  customFields,
  visible,
  canOpenChat,
}: UseContactColumnsArgs) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isMobile = useIsMobile()

  return useMemo<ColumnDef<Contact, any>[]>(() => {
    const all: ColumnDef<Contact, any>[] = [
      {
        id: IDENTITY_COLUMN,
        accessorFn: (contact) => contactName(contact) ?? "",
        header: t("contacts.columns.contact"),
        meta: {
          mobile: "primary",
          className: "min-w-56",
          sortLabels: { asc: t("contacts.sort.nameAsc"), desc: t("contacts.sort.nameDesc") },
        },
        cell: ({ row }) => <ContactIdentity contact={row.original} canOpenChat={canOpenChat} />,
      },
      {
        id: "connector",
        accessorKey: "connectorName",
        header: t("contacts.columns.connector"),
        enableSorting: false,
        cell: ({ row }) => <ContactConnector contact={row.original} lookups={lookups} />,
      },
      {
        id: "status",
        accessorKey: "status",
        header: t("contacts.columns.status"),
        meta: {
          mobile: "secondary",
          className: "w-28",
          sortLabels: { asc: t("contacts.sort.statusAsc"), desc: t("contacts.sort.statusDesc") },
        },
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === "open" ? "success" : "neutral"}>
            {t(`contacts.status.${row.original.status}`)}
          </StatusBadge>
        ),
      },
      {
        id: "tags",
        accessorKey: "tagIds",
        header: t("contacts.columns.tags"),
        enableSorting: false,
        meta: { mobile: "secondary" },
        cell: ({ row }) => <ContactTags contact={row.original} lookups={lookups} />,
      },
      {
        id: "assignee",
        accessorKey: "assignedAccountId",
        header: t("contacts.columns.assignee"),
        enableSorting: false,
        cell: ({ row }) => <ContactAssignee contact={row.original} lookups={lookups} />,
      },
      {
        id: "team",
        accessorKey: "teamId",
        header: t("contacts.columns.team"),
        enableSorting: false,
        cell: ({ row }) => {
          const team = row.original.teamId ? lookups.teams.get(row.original.teamId) : undefined
          return team ? (
            <span className="block max-w-40 truncate">{team.name}</span>
          ) : (
            <NoValue>{t("contacts.team.none")}</NoValue>
          )
        },
      },
      {
        id: "last_message_at",
        accessorKey: "lastMessageAt",
        header: t("contacts.columns.lastMessage"),
        meta: {
          sortLabels: {
            asc: t("contacts.sort.lastMessageAsc"),
            desc: t("contacts.sort.lastMessageDesc"),
          },
        },
        cell: ({ row }) => <LastMessage contact={row.original} />,
      },
      {
        id: "session",
        accessorKey: "activeSession",
        header: t("contacts.columns.session"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.activeSession ? (
            <StatusBadge tone="info" title={t("contacts.session.insideHint")}>
              {t("contacts.session.inside")}
            </StatusBadge>
          ) : (
            <span title={t("contacts.session.outsideHint")} className="text-muted-foreground">
              {t("contacts.session.outside")}
            </span>
          ),
      },
      {
        id: "automation",
        accessorKey: "automationEnabled",
        header: t("contacts.columns.automation"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.automationEnabled ? (
            <span className="inline-flex items-center gap-1.5">
              <Zap aria-hidden className="size-3.5 text-muted-foreground" />
              {t("contacts.automation.on")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <ZapOff aria-hidden className="size-3.5" />
              {t("contacts.automation.off")}
            </span>
          ),
      },
      {
        id: "unread_messages",
        accessorKey: "unreadMessages",
        header: t("contacts.columns.unread"),
        meta: {
          align: "right",
          sortLabels: { asc: t("contacts.sort.unreadAsc"), desc: t("contacts.sort.unreadDesc") },
        },
        cell: ({ row }) => (
          <span
            className={cn(
              row.original.unreadMessages === 0 ? "text-muted-foreground" : "font-medium"
            )}
          >
            {formatNumber(row.original.unreadMessages, language)}
          </span>
        ),
      },
      {
        id: "created_at",
        accessorKey: "createdAt",
        header: t("contacts.columns.createdAt"),
        meta: {
          sortLabels: { asc: t("contacts.sort.createdAsc"), desc: t("contacts.sort.createdDesc") },
        },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatDate(row.original.createdAt, language)}</span>
        ),
      },
      {
        id: "notes",
        accessorKey: "notes",
        header: t("contacts.columns.notes"),
        enableSorting: false,
        meta: { className: "whitespace-normal min-w-56" },
        cell: ({ row }) =>
          row.original.notes ? (
            <span className="line-clamp-2 text-pretty">{row.original.notes}</span>
          ) : (
            <NoValue />
          ),
      },
      ...(customFields ?? []).map<ColumnDef<Contact, any>>((field) => ({
        id: customColumnId(field.key),
        accessorFn: (contact) => contact.customAttributes[field.key] ?? "",
        header: field.name,
        enableSorting: false,
        cell: ({ row }) => <CustomValue contact={row.original} field={field} />,
      })),
    ]

    const isVisible = (id: string | undefined) =>
      id === IDENTITY_COLUMN || (id !== undefined && visible.includes(id))

    if (!isMobile) return all.filter((column) => isVisible(column.id))

    return all.map((column) =>
      isVisible(column.id)
        ? column
        : { ...column, meta: { ...column.meta, mobile: "hidden" as const } }
    )
  }, [canOpenChat, customFields, isMobile, language, lookups, t, visible])
}
