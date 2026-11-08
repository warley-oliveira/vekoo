import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { Link, useNavigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  FormActions,
  PhoneField,
  ResponsiveDialog,
  SelectField,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCan } from "@/hooks/use-can"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { createChat } from "@/lib/chat/actions"
import { connectorNumber } from "@/lib/chat/channel"
import { isValidPhone } from "@/lib/format-phone"

type Values = {
  connectorId: string | null
  phoneNumberId: string | null
  externalId: string | null
  userName: string | null
}

/** Só WhatsApp começa conversa pelo número: Instagram, Messenger e widget só respondem. */
const PHONE_TYPES = new Set(["whatsapp_web", "whatsapp_cloud"])

/**
 * Falar com alguém que ainda não escreveu. Se a conversa com esse número já existe nesse canal, a API
 * a devolve (e sobe na lista), e é ela que abre: a busca entende o número com ou sem o nono dígito.
 */
export default function NewChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canManage = useCan("core_settings")
  const { connectors } = useChatConnectors()

  const available = useMemo(
    () =>
      connectors.filter(
        (connector) => connector.status === "active" && PHONE_TYPES.has(connector.type)
      ),
    [connectors]
  )

  const schema = useMemo(
    () =>
      z.object({
        connectorId: z
          .string()
          .nullable()
          .refine(Boolean, t("chat.newChat.connectorRequired")),
        phoneNumberId: z.string().nullable(),
        externalId: z
          .string()
          .nullable()
          .refine((value) => isValidPhone(value), t("chat.newChat.phoneInvalid")),
        userName: z.string().trim().nullable(),
      }),
    [t]
  )

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      connectorId: available.length === 1 ? available[0].id : null,
      phoneNumberId: null,
      externalId: null,
      userName: null,
    },
    mode: "onBlur",
  })

  const close = () => {
    onOpenChange(false)
    form.reset()
  }

  const connectorId = form.watch("connectorId")
  const connector = available.find((item) => item.id === connectorId)
  const phoneNumbers =
    connector?.type === "whatsapp_cloud" ? (connector.phoneNumberList ?? []) : []

  const submit = useFormSubmit(form, async (values) => {
    const chat = await createChat({
      connectorId: values.connectorId as string,
      externalId: values.externalId as string,
      userName: values.userName || undefined,
      phoneNumberId: values.phoneNumberId || undefined,
    })
    toast.success(t("chat.newChat.created"))
    close()
    navigate(`/chat/${chat.id}`)
  })

  const options = available.map((item) => ({
    value: item.id,
    label: [item.name, connectorNumber(item)].filter(Boolean).join(" · "),
  }))

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t("chat.newChat.title")}
      description={t("chat.newChat.description")}
      onSubmit={available.length > 0 ? submit : undefined}
      footer={
        available.length > 0 ? (
          <FormActions form={form} submitLabel={t("chat.newChat.submit")} onCancel={close} />
        ) : (
          <Button type="button" variant="ghost" onClick={close}>
            {t("chat.newChat.close")}
          </Button>
        )
      }
    >
      {available.length === 0 ? (
        <Callout
          tone="warning"
          icon={<TriangleAlert className="size-4" />}
          title={t("chat.newChat.noChannelTitle")}
          action={
            canManage ? (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link to="/settings/integrations" onClick={close} />}
              >
                {t("chat.newChat.openChannels")}
              </Button>
            ) : undefined
          }
        >
          {t("chat.newChat.noChannel")}
        </Callout>
      ) : (
        <div className="flex flex-col gap-4">
          <SelectField
            control={form.control}
            name="connectorId"
            label={t("chat.newChat.connector")}
            options={options}
          />
          {phoneNumbers.length > 1 ? (
            <SelectField
              control={form.control}
              name="phoneNumberId"
              label={t("chat.newChat.number")}
              optional
              clearLabel={t("chat.newChat.defaultNumber")}
              options={phoneNumbers.map((phone) => ({
                value: phone.id,
                label: [phone.verifiedName, phone.displayPhoneNumber].filter(Boolean).join(" · "),
              }))}
            />
          ) : null}
          <PhoneField
            control={form.control}
            name="externalId"
            label={t("chat.newChat.phone")}
          />
          <TextField
            control={form.control}
            name="userName"
            label={t("chat.newChat.name")}
            optional
          />
        </div>
      )}
    </ResponsiveDialog>
  )
}
