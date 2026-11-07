import { useEffect, useMemo } from "react"
import { useFormContext, useFormState, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Radio as RadioIcon, Smartphone } from "lucide-react"

import { Callout, ErrorState, ListSkeleton, StatusBadge, UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useCampaignChannels } from "@/hooks/campaigns-wizard/use-campaign-options"
import { useCan } from "@/hooks/use-can"
import { apiAssetUrl } from "@/lib/api"
import { connectorLabel, wabaNumbers } from "@/lib/campaigns-wizard/channels"
import type { WizardValues } from "@/lib/campaigns-wizard/form"
import { formatPhone } from "@/lib/format-phone"
import { cn } from "@/lib/utils"

const QUALITY_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  GREEN: "success",
  YELLOW: "warning",
  RED: "danger",
}

function NumberRow({
  checked,
  onToggle,
  title,
  subtitle,
  picture,
  badge,
  type = "checkbox",
  value,
}: {
  checked: boolean
  onToggle?: () => void
  title: string
  subtitle?: string | null
  picture?: string | null
  badge?: React.ReactNode
  type?: "checkbox" | "radio"
  value?: string
}) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        checked && "border-primary bg-primary/5"
      )}
    >
      {type === "radio" ? (
        <RadioGroupItem value={value ?? ""} />
      ) : (
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={title} />
      )}
      <UserAvatar name={title} src={picture ? apiAssetUrl(picture) : undefined} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle ? (
          <span className="block truncate text-xs text-muted-foreground tabular-nums">{subtitle}</span>
        ) : null}
      </span>
      {badge}
    </label>
  )
}

function FieldError({ name }: { name: keyof WizardValues }) {
  const { errors } = useFormState<WizardValues>({ name })
  const message = errors[name]?.message
  if (!message) return null

  return (
    <p role="alert" className="text-sm text-destructive">
      {String(message)}
    </p>
  )
}

/**
 * De onde sai. Fica junto da mensagem porque é ele que decide o que dá para escrever: o WhatsApp
 * conectado aceita texto livre e arquivo, a conta oficial só modelo aprovado. Com um número só e um modo
 * só, a escolha já vem feita, e a tela não pergunta o que não precisa.
 */
export function ChannelPicker() {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<WizardValues>()
  const channels = useCampaignChannels()
  const canConfigure = useCan("core_settings")

  const mode = useWatch({ control, name: "campaignMode" })
  const connectorIds = useWatch({ control, name: "connectorIds" })
  const wabaConnectorId = useWatch({ control, name: "wabaConnectorId" })
  const phoneNumberIds = useWatch({ control, name: "phoneNumberIds" })

  const web = useMemo(() => channels.web.filter((item) => item.active), [channels.web])
  const waba = useMemo(() => channels.waba.filter((item) => item.active), [channels.waba])
  const hasBoth = web.length > 0 && waba.length > 0
  const isLoaded = !channels.isLoading && !channels.error

  const staleWeb = useMemo(
    () => channels.web.filter((item) => !item.active && connectorIds.includes(item.id)),
    [channels.web, connectorIds]
  )
  const selectedWaba = useMemo(
    () => waba.find((item) => item.id === wabaConnectorId) ?? null,
    [waba, wabaConnectorId]
  )
  const numbers = useMemo(() => (selectedWaba ? wabaNumbers(selectedWaba) : []), [selectedWaba])

  // Campanha antiga pode apontar para a conta oficial no modo texto, que a tela não oferece: fora da janela
  // de 24 horas a WABA só aceita modelo, e os destinatários falhariam um a um.
  useEffect(() => {
    if (!isLoaded || connectorIds.length === 0) return

    const known = connectorIds.filter((id) => channels.web.some((item) => item.id === id))
    if (known.length !== connectorIds.length) setValue("connectorIds", known)
  }, [channels.web, connectorIds, isLoaded, setValue])

  // O modo que existe, quando só existe um.
  useEffect(() => {
    if (!isLoaded) return
    if (mode === "text" && web.length === 0 && waba.length > 0) setValue("campaignMode", "template")
    if (mode === "template" && waba.length === 0 && web.length > 0) setValue("campaignMode", "text")
  }, [isLoaded, mode, setValue, waba.length, web.length])

  // Com uma opção só, ela já está escolhida.
  useEffect(() => {
    if (!isLoaded || mode !== "text" || connectorIds.length > 0) return
    if (web.length === 1) setValue("connectorIds", [web[0].id])
  }, [connectorIds.length, isLoaded, mode, setValue, web])

  useEffect(() => {
    if (!isLoaded || mode !== "template" || wabaConnectorId) return
    if (waba.length === 1) setValue("wabaConnectorId", waba[0].id)
  }, [isLoaded, mode, setValue, waba, wabaConnectorId])

  // O primeiro número da conta oficial, como na origem.
  useEffect(() => {
    if (mode !== "template" || !selectedWaba || phoneNumberIds.length > 0) return
    const first = wabaNumbers(selectedWaba)[0]
    if (first) setValue("phoneNumberIds", [first.id])
  }, [mode, phoneNumberIds.length, selectedWaba, setValue])

  function toggleConnector(id: string) {
    setValue(
      "connectorIds",
      connectorIds.includes(id) ? connectorIds.filter((item) => item !== id) : [...connectorIds, id],
      { shouldDirty: true, shouldValidate: true }
    )
  }

  function togglePhone(id: string) {
    setValue(
      "phoneNumberIds",
      phoneNumberIds.includes(id) ? phoneNumberIds.filter((item) => item !== id) : [...phoneNumberIds, id],
      { shouldDirty: true, shouldValidate: true }
    )
  }

  function changeMode(next: string) {
    setValue("campaignMode", next as WizardValues["campaignMode"], { shouldDirty: true })
  }

  if (channels.isLoading) return <ListSkeleton rows={2} />
  if (channels.error) {
    return <ErrorState error={channels.error} onRetry={channels.reload} className="border-0 p-4" />
  }

  if (web.length === 0 && waba.length === 0) {
    return (
      <Callout
        tone="warning"
        icon={<Smartphone />}
        title={t("campaignsWizard.channel.noneTitle")}
        action={
          canConfigure ? (
            <Button
              variant="outline"
              size="sm"
              className="pointer-coarse:h-10"
              nativeButton={false}
              render={<Link to="/settings/integrations" />}
            >
              {t("campaignsWizard.channel.connect")}
            </Button>
          ) : undefined
        }
      >
        {canConfigure ? t("campaignsWizard.channel.noneHint") : t("campaignsWizard.channel.noneHintMember")}
      </Callout>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("campaignsWizard.channel.title")}</h3>

      {hasBoth ? (
        <RadioGroup
          value={mode}
          onValueChange={(value) => changeMode(String(value))}
          aria-label={t("campaignsWizard.channel.modeLabel")}
          className="grid gap-2 sm:grid-cols-2"
        >
          {(["text", "template"] as const).map((option) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                mode === option && "border-primary bg-primary/5"
              )}
            >
              <RadioGroupItem value={option} className="mt-px" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(`campaignsWizard.channel.modes.${option}.title`)}</span>
                <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">
                  {t(`campaignsWizard.channel.modes.${option}.description`)}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      ) : null}

      {mode === "text" ? (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {web.map((connector) => (
              <NumberRow
                key={connector.id}
                checked={connectorIds.includes(connector.id)}
                onToggle={() => toggleConnector(connector.id)}
                title={connectorLabel(connector)}
                subtitle={connector.numberFormatted}
                picture={connector.profilePictureUrl}
              />
            ))}
            {staleWeb.map((connector) => (
              <NumberRow
                key={connector.id}
                checked
                onToggle={() => toggleConnector(connector.id)}
                title={connectorLabel(connector)}
                subtitle={connector.numberFormatted}
                picture={connector.profilePictureUrl}
                badge={<StatusBadge tone="danger">{t("campaignsWizard.channel.disconnected")}</StatusBadge>}
              />
            ))}
          </div>
          {web.length > 1 ? (
            <p className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.channel.manyHint")}</p>
          ) : null}
          <FieldError name="connectorIds" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {waba.length > 1 ? (
            <RadioGroup
              value={wabaConnectorId}
              onValueChange={(value) => {
                setValue("wabaConnectorId", String(value), { shouldDirty: true, shouldValidate: true })
                setValue("phoneNumberIds", [], { shouldDirty: true })
                setValue("templateIds", [], { shouldDirty: true })
                setValue("templateParams", {}, { shouldDirty: true })
              }}
              aria-label={t("campaignsWizard.channel.wabaLabel")}
              className="grid gap-2 sm:grid-cols-2"
            >
              {waba.map((connector) => (
                <NumberRow
                  key={connector.id}
                  type="radio"
                  value={connector.id}
                  checked={wabaConnectorId === connector.id}
                  title={connectorLabel(connector)}
                  subtitle={connector.displayPhoneNumber}
                />
              ))}
            </RadioGroup>
          ) : null}
          <FieldError name="wabaConnectorId" />

          {selectedWaba ? (
            numbers.length === 0 ? (
              <Callout tone="warning" icon={<RadioIcon />}>
                {t("campaignsWizard.channel.noNumbers")}
              </Callout>
            ) : (
              <div className="flex flex-col gap-2">
                {numbers.length > 1 || waba.length > 1 ? (
                  <p className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.channel.numbersHint")}</p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {numbers.map((number) => (
                    <NumberRow
                      key={number.id}
                      checked={phoneNumberIds.includes(number.id)}
                      onToggle={() => togglePhone(number.id)}
                      title={number.verifiedName || formatPhone(number.displayPhoneNumber)}
                      subtitle={number.displayPhoneNumber}
                      badge={
                        number.qualityRating ? (
                          <StatusBadge tone={QUALITY_TONE[number.qualityRating] ?? "neutral"}>
                            {t(`campaignsWizard.channel.quality.${number.qualityRating}`, {
                              defaultValue: number.qualityRating,
                            })}
                          </StatusBadge>
                        ) : null
                      }
                    />
                  ))}
                </div>
                <FieldError name="phoneNumberIds" />
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  )
}
