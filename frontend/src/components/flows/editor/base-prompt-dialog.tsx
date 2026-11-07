import { useState } from "react"
import { useTranslation } from "react-i18next"

import { ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

import { useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"

// As instruções que valem para todos os blocos de IA do fluxo: perfil, tom de voz, regras. O modelo rápido não
// herda. Edita uma cópia: "Aplicar" leva ao fluxo, e o salvamento automático cuida do resto.

export function BasePromptDialog() {
  const open = useEditorUi((state) => state.dialog === "basePrompt")
  const setDialog = useEditorUi((state) => state.setDialog)
  return open ? <Body onClose={() => setDialog(null)} /> : null
}

function Body({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const api = useEditorApi()
  const [draft, setDraft] = useState(() => api.getState().basePrompt)
  const initial = api.getState().basePrompt
  const inheriting = api
    .getState()
    .nodes.filter((node) => ["ai_assistant", "ai_parameter_extractor"].includes(node.type ?? "") && node.data.model_size !== "fast").length

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={t("flows.basePrompt.title")}
      description={t("flows.basePrompt.description", { count: inheriting })}
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("flows.basePrompt.cancel")}
          </Button>
          <Button
            type="button"
            disabled={draft === initial}
            onClick={() => {
              api.getState().setBasePrompt(draft)
              onClose()
            }}
          >
            {t("flows.basePrompt.apply")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5 pt-1">
        <Textarea
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          rows={14}
          value={draft}
          aria-label={t("flows.basePrompt.title")}
          placeholder={t("flows.basePrompt.placeholder")}
          onChange={(event) => setDraft(event.target.value)}
        />
        <p className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("flows.basePrompt.fastHint")}</span>
          <span className="shrink-0 tabular-nums">{t("flows.basePrompt.chars", { count: draft.length, value: formatNumber(draft.length, language) })}</span>
        </p>
      </div>
    </ResponsiveDialog>
  )
}
