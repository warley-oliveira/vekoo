import { memo, Suspense, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  CircleCheck,
  CircleDot,
  Tag,
  Tags,
  UserRoundCheck,
  X,
  Zap,
  ZapOff,
} from "lucide-react"
import { toast } from "sonner"

import { ActionsMenu, BulkActionsBar, useConfirm, type RowAction } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ApiError } from "@/lib/api"
import { applyBulkChange, type BulkChange } from "@/lib/chat-details/bulk"
import { useChatSelection } from "@/lib/chat-details/selection"
import type { BulkResult } from "@/lib/chat-details/types"
import { useListFilters } from "@/lib/chat/stores"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useChatVariant } from "../chat-variant"
import { BulkAssignDialog, BulkTagsDialog } from "./bulk-dialogs"

type OpenDialog = "addTags" | "removeTags" | "assign" | null

/**
 * A faixa de quem está escolhendo conversas: quantas, todas as carregadas, sair. As ações descem na
 * barra flutuante do kit, a mesma da tela de contatos. Mudar de recorte zera a escolha: conversa
 * marcada que saiu da vista é um jeito de agir sem querer.
 */
export const ListSelectionStrip = memo(function ListSelectionStrip() {
  const { t } = useTranslation()
  const language = useLanguage()
  const variant = useChatVariant()
  const confirm = useConfirm()
  const active = useChatSelection((state) => state.active)
  const count = useChatSelection((state) => state.ids.size)
  const loadedCount = useChatSelection((state) => state.loaded.length)
  const exit = useChatSelection((state) => state.exit)
  const clear = useChatSelection((state) => state.clear)
  const selectLoaded = useChatSelection((state) => state.selectLoaded)
  const [dialog, setDialog] = useState<OpenDialog>(null)

  const search = useListFilters((state) => state.search)
  const status = useListFilters((state) => state.status)
  const connectorId = useListFilters((state) => state.connectorId)
  const conditions = useListFilters((state) => state.conditions)

  useEffect(() => {
    if (useChatSelection.getState().active) clear()
  }, [clear, conditions, connectorId, search, status])

  // Esc sai, como na seleção de mensagens.
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[role='dialog']")) exit()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [active, exit])

  if (!active) return null

  const amount = { count, formatted: formatNumber(count, language) }
  const allChecked = loadedCount > 0 && count >= loadedCount

  const run = async (change: BulkChange): Promise<BulkResult> => {
    const ids = [...useChatSelection.getState().ids]
    const result = await applyBulkChange(ids, change)
    report(change, result, ids.length)
    exit()
    return result
  }

  const report = (change: BulkChange, result: BulkResult, total: number) => {
    if (result.updatedCount === 0) {
      toast.info(t("chatDetails.bulk.nothingChanged"), {
        description: t("chatDetails.bulk.nothingChangedHint"),
      })
      return
    }

    const updated = { count: result.updatedCount, formatted: formatNumber(result.updatedCount, language) }
    const skipped = total - result.updatedCount
    toast.success(t(`chatDetails.bulk.done.${doneKey(change)}`, updated), {
      description:
        skipped > 0
          ? t("chatDetails.bulk.someUnchanged", {
              count: skipped,
              formatted: formatNumber(skipped, language),
            })
          : undefined,
    })
  }

  /** Abrir e fechar, ligar e desligar: uma ação sem escolha, então a confirmação é a pergunta. */
  const confirmed = async (
    action: "close" | "reopen" | "automationOn" | "automationOff",
    change: BulkChange
  ) => {
    let result: BulkResult | null = null
    const ids = [...useChatSelection.getState().ids]

    const accepted = await confirm({
      title: t(`chatDetails.bulk.${action}.title`, amount),
      description: t(`chatDetails.bulk.${action}.hint`, amount),
      confirmLabel: t(`chatDetails.bulk.${action}.confirm`, amount),
      onConfirm: async () => {
        result = await applyBulkChange(ids, change)
      },
    })

    if (accepted && result) {
      report(change, result, ids.length)
      exit()
    }
  }

  const fail = (error: unknown) =>
    toast.error(
      error instanceof ApiError && error.serverMessage
        ? error.serverMessage
        : t("chatDetails.bulk.failed")
    )

  const primary: RowAction[] = [
    { label: t("chatDetails.bulk.actions.addTags"), icon: <Tag />, onSelect: () => setDialog("addTags") },
    { label: t("chatDetails.bulk.actions.assign"), icon: <UserRoundCheck />, onSelect: () => setDialog("assign") },
    {
      label: t("chatDetails.bulk.actions.close"),
      icon: <CircleCheck />,
      onSelect: () => void confirmed("close", { kind: "status", status: "closed" }).catch(fail),
    },
  ]

  const secondary: RowAction[] = [
    { label: t("chatDetails.bulk.actions.removeTags"), icon: <Tags />, onSelect: () => setDialog("removeTags") },
    {
      label: t("chatDetails.bulk.actions.reopen"),
      icon: <CircleDot />,
      separatorBefore: true,
      onSelect: () => void confirmed("reopen", { kind: "status", status: "open" }).catch(fail),
    },
    {
      label: t("chatDetails.bulk.actions.automationOn"),
      icon: <Zap />,
      separatorBefore: true,
      onSelect: () => void confirmed("automationOn", { kind: "automation", enabled: true }).catch(fail),
    },
    {
      label: t("chatDetails.bulk.actions.automationOff"),
      icon: <ZapOff />,
      onSelect: () => void confirmed("automationOff", { kind: "automation", enabled: false }).catch(fail),
    },
  ]

  return (
    <>
      {variant ? (
        <Suspense fallback={null}>
          <variant.SelectionChrome
            count={count}
            loadedCount={loadedCount}
            primary={primary}
            secondary={secondary}
            onExit={exit}
            onClear={clear}
            onSelectLoaded={selectLoaded}
          />
        </Suspense>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[0.8125rem]">
            <label className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 pl-2.5 pointer-coarse:min-h-10">
              <Checkbox
                checked={allChecked}
                disabled={loadedCount === 0}
                onCheckedChange={(checked) => (checked ? selectLoaded() : clear())}
              />
              <span className="truncate">
                {count > 0
                  ? t("chatDetails.bulk.selected", amount)
                  : t("chatDetails.bulk.selectLoaded", {
                      count: loadedCount,
                      formatted: formatNumber(loadedCount, language),
                    })}
              </span>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 pointer-coarse:h-10"
              onClick={exit}
            >
              <X />
              {t("chatDetails.bulk.exit")}
            </Button>
          </div>

          <BulkActionsBar count={count} onClear={clear}>
            {primary.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant="ghost"
                size="sm"
                onClick={action.onSelect}
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
            <ActionsMenu label={t("chatDetails.bulk.actions.more")} actions={secondary} />
          </BulkActionsBar>
        </>
      )}

      {dialog === "addTags" || dialog === "removeTags" ? (
        <BulkTagsDialog
          mode={dialog === "addTags" ? "add" : "remove"}
          count={count}
          run={run}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "assign" ? (
        <BulkAssignDialog count={count} run={run} onClose={() => setDialog(null)} />
      ) : null}
    </>
  )
})

function doneKey(change: BulkChange): string {
  switch (change.kind) {
    case "addTags":
      return "addTags"
    case "removeTags":
      return "removeTags"
    case "assign":
      return change.accountId ? "assign" : "unassign"
    case "status":
      return change.status === "closed" ? "close" : "reopen"
    case "automation":
      return change.enabled ? "automationOn" : "automationOff"
  }
}
