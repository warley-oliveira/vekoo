import { memo, useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { CheckCircle2, ExternalLink, Mail, Pencil, Phone, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import {
  CopyButton,
  RelativeTime,
  ResponsiveDialog,
  StatusBadge,
  UserAvatar,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { useChatFields } from "@/hooks/chat-details/use-chat-fields"
import { apiAssetUrl } from "@/lib/api"
import { updateChat } from "@/lib/chat/actions"
import { channelKey, contactHandle, isPhoneChannel } from "@/lib/chat/channel"
import { chatDisplayName } from "@/lib/chat/chat-store"
import { formatPhone, onlyDigits } from "@/lib/format-phone"
import { ChannelIcon } from "../channel-icon"
import { EditableName, type EditableNameHandle } from "../thread/editable-name"

const FIELDS = [
  "id",
  "displayName",
  "userName",
  "externalId",
  "phoneNumber",
  "audienceUserName",
  "audienceType",
  "abbreviatedName",
  "profilePictureUrl",
  "connectorId",
  "status",
  "activeSession",
  "sessionStartAt",
  "customAttributes",
  "partial",
] as const

const DAY_MS = 24 * 60 * 60 * 1000

/** Só estes canais travam fora da janela de 24 horas. No WhatsApp do celular ela não muda nada. */
const SESSION_CHANNELS = new Set(["whatsapp_cloud", "instagram", "messenger"])

/** Dados que o visitante do site deixou no chat. */
function VisitorData({ phone, email }: { phone: string | null; email: string | null }) {
  if (!phone && !email) return null

  return (
    <dl className="mt-2 space-y-1 text-[0.8125rem]">
      {phone ? (
        <div className="flex items-center gap-1.5">
          <dt>
            <Phone aria-hidden className="size-3.5 text-muted-foreground" />
          </dt>
          <dd className="min-w-0 truncate">{formatPhone(phone)}</dd>
          <CopyButton value={phone} size="icon-xs" className="shrink-0" />
        </div>
      ) : null}
      {email ? (
        <div className="flex items-center gap-1.5">
          <dt>
            <Mail aria-hidden className="size-3.5 text-muted-foreground" />
          </dt>
          <dd className="min-w-0 truncate">{email}</dd>
          <CopyButton value={email} size="icon-xs" className="shrink-0" />
        </div>
      ) : null}
    </dl>
  )
}

/**
 * Quem está do outro lado: nome, como falar, por qual canal, e o que está valendo agora. É a parte que
 * a pessoa lê toda vez, então cabe sem rolar nada e sem precisar abrir nada.
 */
export const ContactHero = memo(function ContactHero({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const chat = useChatFields(chatId, FIELDS)
  const { byId: connectors } = useChatConnectors()
  const nameField = useRef<EditableNameHandle>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const closed = chat?.status === "closed"

  const toggleStatus = useCallback(() => {
    const next = closed ? "open" : "closed"
    updateChat(chatId, { status: next })
      .then(() =>
        toast.success(next === "closed" ? t("chat.status.closedDone") : t("chat.status.openedDone"))
      )
      .catch(() => toast.error(t("chat.status.failed")))
  }, [chatId, closed, t])

  if (!chat) return null

  const connector = chat.connectorId ? connectors.get(chat.connectorId) : undefined
  const channel = channelKey(connector, chat.audienceType)
  const name = chatDisplayName(chat, {
    visitor: t("chat.contact.visitor"),
    contact: t("chat.contact.fallback"),
  })
  const handle = contactHandle(chat, channel)
  const picture = chat.profilePictureUrl ? apiAssetUrl(chat.profilePictureUrl) : null
  const phone = (chat.phoneNumber ?? chat.externalId ?? "").split("@")[0]
  const showsPhone = isPhoneChannel(channel) || (channel === "other" && Boolean(handle))
  const visitorPhone = chat.customAttributes?.phone
  const visitorEmail = chat.customAttributes?.email
  const closesAt = chat.sessionStartAt ? chat.sessionStartAt + DAY_MS : null

  return (
    <div className="px-4 pt-4 pb-3">
      <div className="flex items-start gap-3">
        {picture ? (
          <button
            type="button"
            aria-label={t("chatDetails.hero.openPhoto", { name })}
            className="shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => setPreviewOpen(true)}
          >
            <UserAvatar name={name} src={picture} className="size-14 text-base" />
          </button>
        ) : (
          <UserAvatar name={name} colorSeed={chat.externalId} className="size-14 shrink-0 text-base" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-0.5">
            {chat.partial ? (
              <h3 className="truncate font-heading text-base font-semibold tracking-tight">{name}</h3>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <EditableName ref={nameField} chat={chat} name={name} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden shrink-0 text-muted-foreground pointer-coarse:inline-flex pointer-coarse:size-10"
                  aria-label={t("chat.header.rename")}
                  onClick={() => nameField.current?.edit()}
                >
                  <Pencil />
                </Button>
              </>
            )}
          </div>

          {handle ? (
            <div className="flex min-w-0 items-center gap-0.5 text-[0.8125rem] text-muted-foreground">
              <span className="truncate tabular-nums">{handle}</span>
              {showsPhone ? (
                <CopyButton
                  value={onlyDigits(phone)}
                  size="icon-xs"
                  aria-label={t("chatDetails.hero.copyPhone")}
                  className="shrink-0"
                />
              ) : null}
            </div>
          ) : channel === "web" ? (
            <div className="flex min-w-0 items-center gap-0.5 text-[0.8125rem] text-muted-foreground">
              <span className="truncate">{t("chat.contact.visitor")}</span>
              <CopyButton
                value={chat.externalId}
                size="icon-xs"
                aria-label={t("chatDetails.hero.copyVisitor")}
                className="shrink-0"
              />
            </div>
          ) : null}

          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <ChannelIcon channel={channel} className="size-3 shrink-0" />
            <span className="truncate">{connector?.name ?? t(`chat.channel.${channel}`)}</span>
          </p>

          {channel === "web" ? (
            <VisitorData
              phone={typeof visitorPhone === "string" ? visitorPhone : null}
              email={typeof visitorEmail === "string" ? visitorEmail : null}
            />
          ) : null}
        </div>
      </div>

      {chat.partial ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={closed ? "neutral" : "success"}>
            {t(closed ? "chatDetails.hero.closed" : "chatDetails.hero.open")}
          </StatusBadge>

          {SESSION_CHANNELS.has(channel) ? (
            chat.activeSession && closesAt ? (
              <StatusBadge tone="neutral" dot={false} title={t("chatDetails.hero.sessionHint")}>
                {t("chatDetails.hero.sessionOpen")} <RelativeTime value={closesAt} />
              </StatusBadge>
            ) : (
              <StatusBadge tone="warning" title={t("chatDetails.hero.sessionHint")}>
                {t("chatDetails.hero.sessionExpired")}
              </StatusBadge>
            )
          ) : null}

          <span className="ml-auto flex items-center gap-1">
            {isPhoneChannel(channel) ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground pointer-coarse:h-10"
                nativeButton={false}
                render={
                  <a
                    href={`https://wa.me/${onlyDigits(phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("chatDetails.hero.openWhatsapp")}
                  />
                }
              >
                <ExternalLink />
                {t("chatDetails.hero.whatsapp")}
              </Button>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground pointer-coarse:h-10"
              onClick={toggleStatus}
            >
              {closed ? <RotateCcw /> : <CheckCircle2 />}
              {closed ? t("chat.status.open") : t("chat.status.close")}
            </Button>
          </span>
        </div>
      )}

      {picture ? (
        <ResponsiveDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={name}
          description={handle ?? undefined}
          size="sm"
        >
          <img
            src={picture}
            alt={t("chatDetails.hero.photoOf", { name })}
            className="mx-auto aspect-square w-full max-w-xs rounded-lg object-cover"
          />
        </ResponsiveDialog>
      ) : null}
    </div>
  )
})
