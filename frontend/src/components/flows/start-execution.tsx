import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Play } from "lucide-react"
import { toast } from "sonner"

import { ResponsiveDialog, SearchableSelect, type LoadOptions } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { lookupChats } from "@/hooks/flows/use-flow-references"
import { startFlowInChat } from "@/hooks/flows/use-flows"
import { ApiError } from "@/lib/api"
import { formatPhone } from "@/lib/format-phone"

// O gatilho manual: começa o fluxo numa conversa escolhida. A API só aceita fluxo publicado, e ignora o pedido se já
// houver uma execução viva dele nessa conversa.

export function StartExecutionDialog({
  flowId,
  flowName,
  open,
  onOpenChange,
}: {
  flowId: string
  flowName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [chatId, setChatId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const search: LoadOptions = async (query, signal) => {
    const chats = await lookupChats(query, signal)
    return chats.map((chat) => ({
      value: chat.id,
      label: chat.displayName || chat.userName || formatPhone(chat.externalId),
      description: formatPhone(chat.externalId),
    }))
  }

  const start = async () => {
    if (!chatId) return
    setBusy(true)
    try {
      await startFlowInChat(flowId, chatId)
      toast.success(t("flows.start.done", { name: flowName }))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("flows.start.failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("flows.start.title", { name: flowName })}
      description={t("flows.start.description")}
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("flows.start.cancel")}
          </Button>
          <Button type="button" disabled={!chatId || busy} onClick={() => void start()}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            {t("flows.start.action")}
          </Button>
        </>
      }
    >
      <div className="pt-1 pb-2">
        <SearchableSelect
          aria-label={t("flows.start.pick")}
          value={chatId}
          loadOptions={search}
          placeholder={t("flows.start.pick")}
          emptyLabel={t("flows.start.empty")}
          onChange={(value) => setChatId(value)}
        />
      </div>
    </ResponsiveDialog>
  )
}

export function StartExecutionButton({ flowId, flowName }: { flowId: string; flowName: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Play />
        {t("flows.start.action")}
      </Button>
      <StartExecutionDialog flowId={flowId} flowName={flowName} open={open} onOpenChange={setOpen} />
    </>
  )
}
