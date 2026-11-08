import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Zap, ZapOff } from "lucide-react"

import { ChannelMark } from "@/components/connectors/channel-mark"
import { useConnectorTexts } from "@/components/connectors/connector-texts"
import { RelativeTime, StatusBadge, TagChip, UserAvatar } from "@/components/shared"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ContactLookups } from "@/hooks/contacts/use-contacts"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useMediaQuery } from "@/hooks/use-media-query"
import { apiAssetUrl } from "@/lib/api"
import { contactName, contactPhone, lastMessageText } from "@/lib/contacts/format"
import type { Contact, CustomField } from "@/lib/contacts/types"
import { formatDate, isValidDate, toDate } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { formatPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// As células da lista de contatos. Quem as organiza em colunas é `useContactColumns`.

// O que aparece só com folga, do mais útil para o menos: abaixo disso as colunas padrão não cabem, e
// a tabela rolaria de lado, levando junto o menu de cada linha. No celular também fica de fora.
const TWO_TAGS_QUERY = "(min-width: 1360px)"
const PREVIEW_CLASS = "hidden min-[1440px]:block"
const AVATAR_CLASS = "hidden min-[1440px]:flex"
const CHANNEL_MARK_CLASS = "hidden min-[1500px]:inline-flex"

type CellProps = { contact: Contact; lookups: ContactLookups }

export function NoValue({ children, className }: { children?: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={cn("text-muted-foreground", className)}>{children ?? t("kit.noValue")}</span>
  )
}

export function ContactIdentity({
  contact,
  canOpenChat,
}: {
  contact: Contact
  canOpenChat: boolean
}) {
  const { t } = useTranslation()
  const name = contactName(contact)
  const phone = contactPhone(contact)
  const label = name ?? t("contacts.noName")

  return (
    <div className="flex min-w-0 items-center gap-2.5 md:max-w-72">
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

export function ContactConnector({ contact, lookups }: CellProps) {
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
      <ChannelMark type={contact.connectorType} size="sm" className={CHANNEL_MARK_CLASS} />
      <span className="truncate md:max-w-32">{name}</span>
    </span>
  )
}

export function ContactStatus({ contact }: { contact: Contact }) {
  const { t } = useTranslation()
  return (
    <StatusBadge tone={contact.status === "open" ? "success" : "neutral"}>
      {t(`contacts.status.${contact.status}`)}
    </StatusBadge>
  )
}

export function ContactTags({ contact, lookups }: CellProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const fitsTwoTags = useMediaQuery(TWO_TAGS_QUERY)
  const tags = contact.tagIds.flatMap((id) => {
    const tag = lookups.tags.get(id)
    return tag ? [tag] : []
  })

  // No celular a linha de apoio já fala por si: um traço solto ali só faria ruído.
  if (tags.length === 0) return <NoValue className="max-md:hidden" />

  // Quantas etiquetas cabem: no celular a linha tem a largura toda, e na tabela depende da tela.
  const shown = isMobile || fitsTwoTags ? 2 : 1
  const visible = tags.slice(0, shown)
  const rest = tags.slice(shown)

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

export function ContactAssignee({ contact, lookups }: CellProps) {
  const { t } = useTranslation()

  if (!contact.assignedAccountId) return <NoValue>{t("contacts.assignee.none")}</NoValue>

  const user = lookups.users.get(contact.assignedAccountId)
  if (!user) {
    // Lista vazia: as opções ainda não chegaram. Com a lista, é quem perdeu o acesso, mas segue
    // com a conversa no nome.
    return lookups.users.size === 0 ? <NoValue /> : <NoValue>{t("contacts.assignee.unknown")}</NoValue>
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar name={user.name} size="sm" className={AVATAR_CLASS} />
      <span className="truncate md:max-w-32">{user.name}</span>
    </span>
  )
}

export function ContactTeam({ contact, lookups }: CellProps) {
  const { t } = useTranslation()

  if (!contact.teamId) return <NoValue>{t("contacts.team.none")}</NoValue>

  const team = lookups.teams.get(contact.teamId)
  return team ? <span className="block truncate md:max-w-40">{team.name}</span> : <NoValue />
}

export function LastMessage({ contact }: { contact: Contact }) {
  const { t } = useTranslation()

  if (!contact.lastMessageAt) return <NoValue />

  // Texto sem conteúdo é contato importado, que ainda não trocou mensagem nenhuma.
  const type = contact.lastMessageType
  const text =
    lastMessageText(contact) ??
    (type && type !== "text"
      ? t(`contacts.lastMessage.types.${type}`, {
          defaultValue: t("contacts.lastMessage.types.other"),
        })
      : null)

  return (
    <div className="min-w-0 leading-tight">
      <RelativeTime value={contact.lastMessageAt} className="text-sm" />
      {text ? (
        <p
          title={text}
          className={cn("max-w-40 truncate text-xs font-normal text-muted-foreground", PREVIEW_CLASS)}
        >
          {text}
        </p>
      ) : null}
    </div>
  )
}

export function ContactSession({ contact }: { contact: Contact }) {
  const { t } = useTranslation()

  return contact.activeSession ? (
    <StatusBadge tone="info" title={t("contacts.session.insideHint")}>
      {t("contacts.session.inside")}
    </StatusBadge>
  ) : (
    <span title={t("contacts.session.outsideHint")} className="text-muted-foreground">
      {t("contacts.session.outside")}
    </span>
  )
}

export function ContactAutomation({ contact }: { contact: Contact }) {
  const { t } = useTranslation()

  return contact.automationEnabled ? (
    <span className="inline-flex items-center gap-1.5">
      <Zap aria-hidden className="size-3.5 text-muted-foreground" />
      {t("contacts.automation.on")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <ZapOff aria-hidden className="size-3.5" />
      {t("contacts.automation.off")}
    </span>
  )
}

export function UnreadCount({ contact }: { contact: Contact }) {
  const language = useLanguage()

  return (
    <span className={cn(contact.unreadMessages === 0 ? "text-muted-foreground" : "font-medium")}>
      {formatNumber(contact.unreadMessages, language)}
    </span>
  )
}

export function CreatedAt({ contact }: { contact: Contact }) {
  const language = useLanguage()
  return <span className="tabular-nums">{formatDate(contact.createdAt, language)}</span>
}

export function ContactNotes({ contact }: { contact: Contact }) {
  return contact.notes ? (
    <span className="line-clamp-2 text-pretty">{contact.notes}</span>
  ) : (
    <NoValue />
  )
}

export function CustomValue({ contact, field }: { contact: Contact; field: CustomField }) {
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
        <span title={raw} className="block truncate md:max-w-48">
          {raw}
        </span>
      )
  }
}
