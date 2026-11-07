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
import type { Connector, ConnectorCreated } from "@/lib/connectors/types"
import { isValidPhone } from "@/lib/format-phone"
import { ConnectFooter } from "./connect-shell"
import { useConnectStep } from "./connect-step"
import { WhatsappLive, type ConnectMethod } from "./whatsapp-live"

export type WhatsappPanelProps = {
  /** Reconectando. Sem isto, cria um canal novo. */
  connector?: Connector
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
 * que está na tela do próprio aparelho.
 */
export function WhatsappPanel({ connector, stepLabel, onBack }: WhatsappPanelProps) {
  // Já está esperando: não há o que escolher, é só voltar para o código.
  const [started, setStarted] = useState<Started | null>(() =>
    connector?.status === "pending"
      ? { connector, method: "qr", activate: false, phone: null }
      : null
  )

  // Quem voltou daqui para digitar um código já disse o que quer: a escolha abre nele.
  const [startedCode, setStartedCode] = useState(false)

  if (started) {
    return (
      <WhatsappLive
        connector={started.connector}
        method={started.method}
        activateOnStart={started.activate}
        phoneNumberPairing={started.phone}
        onChooseCode={() => {
          setStartedCode(true)
          setStarted(null)
        }}
      />
    )
  }

  return (
    <MethodStep
      connector={connector}
      stepLabel={stepLabel}
      onBack={onBack}
      preferCode={startedCode}
      onStarted={setStarted}
    />
  )
}

function MethodStep({
  connector,
  stepLabel,
  onBack,
  preferCode,
  onStarted,
}: {
  connector?: Connector
  stepLabel?: string
  onBack?: () => void
  preferCode: boolean
  onStarted: (started: Started) => void
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const schema = useMemo(() => buildSchema(t), [t])

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: isMobile || preferCode ? "code" : "qr",
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
    // `aiva_api` é o plano padrão da tela de escolha da origem: o back-end cria sobre a Evolution.
    const { connector: created } = await apiPost<ConnectorCreated>("/connectors", {
      connectorType: "whatsapp_web",
      providerApi: "aiva_api",
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
          {t(method === "code" ? "connectors.method.submitCode" : "connectors.method.submitQr")}
        </Button>
      </ConnectFooter>
    </form>
  )
}
