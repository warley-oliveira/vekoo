import { useState } from "react"
import { useTranslation } from "react-i18next"
import { mutate as globalMutate } from "swr"
import { Link } from "react-router"
import { CheckCircle2, CircleAlert, Loader2, Send } from "lucide-react"

import { Callout, SegmentedControl, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { sampleBody } from "@/lib/webhooks/fields"
import { sendTestRequest, webhookAddress, type TestDelivery } from "@/lib/webhooks/send-test"
import { curlExample, signedCurlExample } from "@/lib/webhooks/snippets"
import type { Webhook } from "@/lib/webhooks/types"

import { CodeSnippet } from "./code-snippet"

// Testar é mandar uma requisição de verdade: daqui, para quem não tem terminal, ou pelo `curl`, para quem prefere ver o
// comando. Em teste, nada roda e os campos aparecem na tela. Ativo, roda tudo de verdade, e por isso pergunta antes.

const MAX_BODY_BYTES = 1024 * 1024

export function WebhookTest({ webhook, onSent }: { webhook: Webhook; onSent: () => void }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [mode, setMode] = useState<"here" | "terminal">("here")
  const [body, setBody] = useState(() =>
    sampleBody(webhook.receivedPayload, {
      nome: t("webhooks.test.sampleName"),
      telefone: t("webhooks.test.samplePhone"),
      pedido: t("webhooks.test.sampleOrder"),
    })
  )
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<TestDelivery | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)

  const secretVariable = t("webhooks.signature.secretVariable")
  const address = webhookAddress(webhook.url)

  const send = async () => {
    try {
      JSON.parse(body)
    } catch {
      setJsonError(t("webhooks.test.invalidJson"))
      return
    }
    if (new Blob([body]).size > MAX_BODY_BYTES) {
      setJsonError(t("webhooks.test.tooLarge"))
      return
    }
    setJsonError(null)

    if (webhook.status === "active") {
      const confirmed = await confirm({
        title: t("webhooks.test.confirmTitle"),
        description: t("webhooks.test.confirmDescription"),
        confirmLabel: t("webhooks.test.confirmAction"),
      })
      if (!confirmed) return
    }

    setSending(true)
    setResult(null)
    const delivery = await sendTestRequest(webhook.url, body)
    setResult(delivery)
    setSending(false)
    // O registro entra pela fila: um instante depois já dá para ver.
    window.setTimeout(() => {
      onSent()
      void globalMutate((key) => typeof key === "string" && key.startsWith("/webhook-logs"))
    }, 1200)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("webhooks.test.title")}</h3>
        <SegmentedControl
          aria-label={t("webhooks.test.modeLabel")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "here", label: t("webhooks.test.modeHere") },
            { value: "terminal", label: t("webhooks.test.modeTerminal") },
          ]}
        />
      </div>

      <p className="text-xs text-pretty text-muted-foreground">{t(`webhooks.test.hint.${webhook.status}`)}</p>

      {webhook.signatureEnabled ? (
        <Callout tone="neutral" title={t("webhooks.test.signedTitle")}>
          {t(mode === "here" ? "webhooks.test.signedHere" : "webhooks.test.signedTerminal")}
        </Callout>
      ) : null}

      {mode === "here" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Textarea
              aria-label={t("webhooks.test.bodyLabel")}
              aria-invalid={Boolean(jsonError)}
              rows={6}
              value={body}
              spellCheck={false}
              className="font-mono md:text-[13px]"
              onChange={(event) => {
                setBody(event.target.value)
                setJsonError(null)
              }}
            />
            {jsonError ? (
              <p role="alert" className="text-xs text-destructive">
                {jsonError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" disabled={sending} className="pointer-coarse:h-10" onClick={() => void send()}>
              {sending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />}
              {t("webhooks.test.send")}
            </Button>
            {result ? <DeliveryResult result={result} webhookId={webhook.id} /> : null}
          </div>
        </>
      ) : (
        <CodeSnippet
          label={t("webhooks.test.copyCommand")}
          code={webhook.signatureEnabled ? signedCurlExample(address, body, secretVariable) : curlExample(address, body)}
        />
      )}
    </div>
  )
}

function DeliveryResult({ result, webhookId }: { result: TestDelivery; webhookId: string }) {
  const { t } = useTranslation()
  return (
    <p role="status" className={cn("flex min-w-0 items-start gap-1.5 text-sm", result.ok ? "text-status-success" : "text-status-danger")}>
      {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span className="min-w-0">
        {result.ok
          ? t("webhooks.test.delivered")
          : result.status === 0
            ? t("webhooks.test.unreachable")
            : t("webhooks.test.refused", { status: result.status, message: result.message ?? "" })}{" "}
        <Link to={`/settings/webhooks/logs?webhook=${webhookId}`} className="underline underline-offset-2">
          {t("webhooks.test.seeLog")}
        </Link>
      </span>
    </p>
  )
}
