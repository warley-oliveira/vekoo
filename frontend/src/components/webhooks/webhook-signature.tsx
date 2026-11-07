import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronRight, KeyRound, RefreshCw, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

import { Callout, CopyButton, RelativeTime, ResponsiveDialog, SegmentedControl, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useWebhookMutations } from "@/hooks/webhooks/use-webhooks"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { webhookAddress } from "@/lib/webhooks/send-test"
import { signedCurlExample, signedNodeExample } from "@/lib/webhooks/snippets"
import type { Webhook } from "@/lib/webhooks/types"

import { CodeSnippet } from "./code-snippet"

// A assinatura vale na hora, como todo interruptor desta tela. A chave só aparece inteira no instante em que nasce: a API
// não a devolve de novo, e quem perder resta renovar. Fora dali, só a dica, para reconhecer.

export function WebhookSignature({ webhook }: { webhook: Webhook }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { enableSignature, rotateSigningSecret, disableSignature } = useWebhookMutations()
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [showHow, setShowHow] = useState(false)

  const failed = (error: unknown) => toast.error(error instanceof ApiError ? error.message : t("webhooks.common.actionFailed"))

  const turnOn = async () => {
    setBusy(true)
    try {
      const result = await enableSignature(webhook.id)
      if (result.signingSecret) setSecret(result.signingSecret)
      else toast.success(t("webhooks.signature.turnedOnSameKey"))
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    const confirmed = await confirm({
      title: t("webhooks.signature.disableTitle"),
      description: t("webhooks.signature.disableDescription"),
      confirmLabel: t("webhooks.signature.disableAction"),
      destructive: true,
      onConfirm: () => disableSignature(webhook.id),
    })
    if (confirmed) toast.success(t("webhooks.signature.turnedOff"))
  }

  const rotate = async () => {
    let rotated: string | null = null
    const confirmed = await confirm({
      title: t("webhooks.signature.rotateTitle"),
      description: t("webhooks.signature.rotateDescription"),
      confirmLabel: t("webhooks.signature.rotateAction"),
      destructive: true,
      onConfirm: async () => {
        rotated = (await rotateSigningSecret(webhook.id)).signingSecret
      },
    })
    if (confirmed && rotated) setSecret(rotated)
  }

  const secretVariable = t("webhooks.signature.secretVariable")
  const address = webhookAddress(webhook.url)

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-center justify-between gap-4 pointer-coarse:min-h-10">
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm font-medium">{t("webhooks.signature.switch")}</span>
          <span className="block text-xs text-pretty text-muted-foreground">
            {t(webhook.signatureEnabled ? "webhooks.signature.switchOn" : "webhooks.signature.switchOff")}
          </span>
        </span>
        <Switch
          checked={webhook.signatureEnabled}
          disabled={busy}
          onCheckedChange={(checked) => void (checked ? turnOn() : turnOff())}
        />
      </label>

      {webhook.signatureEnabled ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-muted/60 px-3 py-2">
            <div className="min-w-0 space-y-0.5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3" aria-hidden />
                {t("webhooks.signature.activeKey")}
              </p>
              <code className="block font-mono text-sm break-all">{webhook.signingSecretHint ?? t("webhooks.signature.noKey")}</code>
              {webhook.signingSecretGeneratedAt ? (
                <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {t("webhooks.signature.generated")} <RelativeTime value={webhook.signingSecretGeneratedAt} />
                </p>
              ) : null}
            </div>
            <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-10" onClick={() => void rotate()}>
              <RefreshCw />
              {t("webhooks.signature.rotate")}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              aria-expanded={showHow}
              onClick={() => setShowHow((current) => !current)}
              className="flex items-center gap-1.5 self-start rounded text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
            >
              <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", showHow && "rotate-90")} aria-hidden />
              {t("webhooks.signature.how")}
            </button>
            {showHow ? <HowToSign address={address} secretVariable={secretVariable} /> : null}
          </div>
        </>
      ) : null}

      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  )
}

function HowToSign({ address, secretVariable }: { address: string; secretVariable: string }) {
  const { t } = useTranslation()
  const [language, setLanguage] = useState<"curl" | "node">("curl")
  const sample = t("webhooks.signature.sampleBody")

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm text-pretty text-muted-foreground">{t("webhooks.signature.howDescription")}</p>
      <SegmentedControl
        aria-label={t("webhooks.signature.languageLabel")}
        value={language}
        onChange={setLanguage}
        options={[
          { value: "curl", label: "curl" },
          { value: "node", label: "Node.js" },
        ]}
      />
      <CodeSnippet
        label={t("webhooks.signature.copyExample")}
        code={language === "curl" ? signedCurlExample(address, sample, secretVariable) : signedNodeExample(address, secretVariable)}
      />
    </div>
  )
}

function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <ResponsiveDialog
      open={Boolean(secret)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      disablePointerDismissal
      title={t("webhooks.signature.secretTitle")}
      description={t("webhooks.signature.secretDescription")}
      footer={
        <Button type="button" className="pointer-coarse:h-10" onClick={onClose}>
          {t("webhooks.signature.secretDone")}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Callout tone="warning" icon={<ShieldAlert />}>
          {t("webhooks.signature.secretWarning")}
        </Callout>
        <div className="flex items-start gap-1 rounded-lg bg-muted p-3">
          <code className="min-w-0 flex-1 font-mono text-xs break-all">{secret}</code>
          <CopyButton value={secret ?? ""} aria-label={t("webhooks.signature.secretCopy")} className="-my-1 shrink-0 pointer-coarse:size-10" />
        </div>
      </div>
    </ResponsiveDialog>
  )
}
