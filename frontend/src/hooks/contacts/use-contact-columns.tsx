import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"

import {
  ContactAssignee,
  ContactAutomation,
  ContactConnector,
  ContactIdentity,
  ContactNotes,
  ContactSession,
  ContactStatus,
  ContactTags,
  ContactTeam,
  CreatedAt,
  CustomValue,
  LastMessage,
  UnreadCount,
} from "@/components/contacts/contact-cells"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { IDENTITY_COLUMN, customColumnId } from "@/lib/contacts/columns"
import { contactName } from "@/lib/contacts/format"
import type { Contact, CustomField } from "@/lib/contacts/types"
import type { ContactLookups } from "./use-contacts"

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
  const isMobile = useIsMobile()

  return useMemo<ColumnDef<Contact, any>[]>(() => {
    const all: ColumnDef<Contact, any>[] = [
      {
        id: IDENTITY_COLUMN,
        accessorFn: (contact) => contactName(contact) ?? "",
        header: t("contacts.columns.contact"),
        meta: {
          mobile: "primary",
          className: "min-w-52",
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
        cell: ({ row }) => <ContactStatus contact={row.original} />,
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
        cell: ({ row }) => <ContactTeam contact={row.original} lookups={lookups} />,
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
        cell: ({ row }) => <ContactSession contact={row.original} />,
      },
      {
        id: "automation",
        accessorKey: "automationEnabled",
        header: t("contacts.columns.automation"),
        enableSorting: false,
        cell: ({ row }) => <ContactAutomation contact={row.original} />,
      },
      {
        id: "unread_messages",
        accessorKey: "unreadMessages",
        header: t("contacts.columns.unread"),
        meta: {
          align: "right",
          sortLabels: { asc: t("contacts.sort.unreadAsc"), desc: t("contacts.sort.unreadDesc") },
        },
        cell: ({ row }) => <UnreadCount contact={row.original} />,
      },
      {
        id: "created_at",
        accessorKey: "createdAt",
        header: t("contacts.columns.createdAt"),
        meta: {
          sortLabels: { asc: t("contacts.sort.createdAsc"), desc: t("contacts.sort.createdDesc") },
        },
        cell: ({ row }) => <CreatedAt contact={row.original} />,
      },
      {
        id: "notes",
        accessorKey: "notes",
        header: t("contacts.columns.notes"),
        enableSorting: false,
        meta: { className: "whitespace-normal min-w-56" },
        cell: ({ row }) => <ContactNotes contact={row.original} />,
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
  }, [canOpenChat, customFields, isMobile, lookups, t, visible])
}
