import { useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { QrCode, Smartphone } from "lucide-react"
import { z } from "zod"

import { FormError, PhoneField, RadioField, useFormSubmit } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { reloadConnectors, storeConnector } from "@/hooks/connectors/use-connectors"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { apiPost } from "@/lib/api"
import { usesZapi } from "@/lib/connectors/channels"
import type { Connector, ConnectorCreated } from "@/lib/connectors/types"
import { isValidPhone } from "@/lib/format-phone"
import { ConnectFooter, useConnectStep } from "./connect-shell"
import { WhatsappLive, type ConnectMethod } from "./whatsapp-live"

type Provider = "aiva_api" | "zapi"

export type WhatsappPanelProps = {
  /** Reconectando. Sem isto, cria um canal novo com este provedor. */
  connector?: Connector
  provider?: Provider
  stepLabel?: string
  onBack?: () => void
}

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      method: z.enum(["qr", "code"]),
      phone: z.string().nullable(),
    })
    .superRefine((values, context) => {
      if (values.method === "code" && !isValidPhone(values.phone)) {
        context.addIssue({
          code: "custom",
          path: ["phone"],
          message: t("connectors.method.phoneInvalid"),
        })
      }
    })
}

type Started = {
  connector: Connector
  method: ConnectMethod
  activate: boolean
  phone: string | null
}

/**
 * Conectar um WhatsApp pelo celular: escolher como e acompanhar a leitura.
 *
 * No celular o padrão é o código de pareamento: não dá para ler com a câmera um QR code
 * que está na tela do próprio aparelho. A Z-API não tem esse caminho, porque nenhum fluxo
 * do back pede o código a ela: fica só o QR, e a tela avisa que precisa de outra tela.
 */
export function WhatsappPanel({ connector, provider = "aiva_api", stepLabel, onBack }: WhatsappPanelProps) {
  // Já está esperando: não há o que escolher, é só voltar para o código.
  const [started, setStarted] = useState<Started | null>(() =>
    connector?.status === "pending"
      ? { connector, method: "qr", activate: false, phone: null }
      : null
  )

  if (started) {
    return (
      <WhatsappLive
        connector={started.connector}
        method={started.method}
        activateOnStart={started.activate}
        phoneNumberPairing={started.phone}
      />
    )
  }

  return (
    <MethodStep
      connector={connector}
      provider={provider}
      stepLabel={stepLabel}
      onBack={onBack}
      onStarted={setStarted}
    />
  )
}

function MethodStep({
  connector,
  provider,
  stepLabel,
  onBack,
  onStarted,
}: {
  connector?: Connector
  provider: Provider
  stepLabel?: string
  onBack?: () => void
  onStarted: (started: Started) => void
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const zapi = connector ? usesZapi(connector) : provider === "zapi"
  const schema = useMemo(() => buildSchema(t), [t])

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: isMobile && !zapi ? "code" : "qr",
      phone: connector?.type === "whatsapp_web" ? connector.numberId : null,
    },
    mode: "onBlur",
  })
  const method = useWatch({ control: form.control, name: "method" })
  const { isSubmitting } = form.formState

  const submit = useFormSubmit(form, async (values) => {
    const phone = values.method === "code" ? values.phone : null

    if (connector) {
      onStarted({ connector, method: values.method, activate: true, phone })
      return
    }

    // Vem `201` mesmo se o provedor recusar: o canal fica criado, `failed`, e a tela
    // seguinte mostra o motivo. Tentar de novo ativa este mesmo canal, em vez de outro.
    const { connector: created } = await apiPost<ConnectorCreated>("/connectors", {
      connectorType: "whatsapp_web",
      providerApi: provider,
      ...(phone ? { phoneNumberPairing: phone } : {}),
    })
    storeConnector(created)
    void reloadConnectors()
    onStarted({ connector: created, method: values.method, activate: false, phone })
  })

  const { close } = useConnectStep(
    {
      title: t(connector ? "connectors.method.titleReconnect" : "connectors.method.title"),
      description: stepLabel,
    },
    { busy: isSubmitting }
  )

  return (
    <form id="whatsapp-method" onSubmit={submit} noValidate className="flex flex-col gap-4">
      {zapi ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-pretty text-muted-foreground">
          {t(isMobile ? "connectors.method.zapiMobile" : "connectors.method.zapi")}
        </p>
      ) : (
        <>
          <RadioField
            control={form.control}
            name="method"
            label={t("connectors.method.label")}
            variant="cards"
            options={[
              {
                value: "qr",
                icon: <QrCode />,
                label: t("connectors.method.qr"),
                description: t(isMobile ? "connectors.method.qrHintMobile" : "connectors.method.qrHint"),
              },
              {
                value: "code",
                icon: <Smartphone />,
                label: t("connectors.method.code"),
                description: t("connectors.method.codeHint"),
              },
            ]}
          />
          {method === "code" ? (
            <PhoneField
              control={form.control}
              name="phone"
              label={t("connectors.method.phone")}
              hint={t("connectors.method.phoneHint")}
            />
          ) : null}
        </>
      )}

      <p className="text-sm text-pretty text-muted-foreground">{t("connectors.method.need")}</p>
      <FormError form={form} />

      <ConnectFooter>
        <Button
          type="button"
          variant="outline"
          className="pointer-coarse:h-10"
          disabled={isSubmitting}
          onClick={onBack ?? close}
        >
          {onBack ? t("connectors.connect.back") : t("connectors.connect.cancel")}
        </Button>
        <Button
          type="submit"
          form="whatsapp-method"
          aria-busy={isSubmitting}
          className="pointer-coarse:h-10"
          disabled={isSubmitting}
        >
          {t(method === "code" && !zapi ? "connectors.method.submitCode" : "connectors.method.submitQr")}
        </Button>
      </ConnectFooter>
    </form>
  )
}
