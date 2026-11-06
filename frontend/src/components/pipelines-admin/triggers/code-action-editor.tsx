import { lazy, Suspense, useState } from "react"
import { useController, useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Code2, Info, Monitor } from "lucide-react"

import { Callout, SelectInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useTriggerContext } from "@/hooks/pipelines-admin/use-trigger-context"
import {
  DEFAULT_CODE_TIMEOUT_MS,
  MAX_CODE_TIMEOUT_MS,
} from "@/lib/pipelines-admin/trigger-catalog"
import type { TriggerDraft } from "@/lib/pipelines-admin/trigger-form"

const CodeEditorPanel = lazy(() => import("./code-editor-panel"))

const TIMEOUT_CHOICES_MS = [5_000, DEFAULT_CODE_TIMEOUT_MS, 30_000, MAX_CODE_TIMEOUT_MS]
const PREVIEW_LINES = 8

/**
 * A ação de rodar código. Só quem tem a permissão `flows` chega aqui: é o que a API exige, porque o
 * script roda como a organização inteira. No celular, dá para ler; escrever pede uma tela maior.
 */
export function CodeActionEditor({ index }: { index: number }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { canUseCode } = useTriggerContext()
  const { control } = useFormContext<TriggerDraft>()
  const name = useWatch({ control, name: "name" })

  const { field: codeField, fieldState } = useController({ control, name: `actions.${index}.code` })
  const { field: timeoutField } = useController({ control, name: `actions.${index}.timeoutMs` })

  const [open, setOpen] = useState(false)
  // O chunk do Monaco só vem depois do primeiro clique.
  const [mounted, setMounted] = useState(false)

  const code = codeField.value ?? ""
  const preview = code.split("\n").slice(0, PREVIEW_LINES).join("\n")
  const lines = code ? code.split("\n").length : 0

  if (!canUseCode) {
    return (
      <Callout tone="neutral" icon={<Info />}>
        {t("pipelinesAdmin.code.noPermission")}
      </Callout>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          "overflow-hidden rounded-lg ring-1 " +
          (fieldState.error ? "ring-destructive" : "ring-foreground/10")
        }
      >
        {code ? (
          <pre className="max-h-44 overflow-hidden bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            <code>{preview}</code>
          </pre>
        ) : (
          <p className="bg-muted/40 p-3 text-sm text-muted-foreground">{t("pipelinesAdmin.code.emptyPreview")}</p>
        )}
        {isMobile ? (
          <p className="flex items-start gap-2 border-t p-3 text-xs text-pretty text-muted-foreground">
            <Monitor aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t("pipelinesAdmin.code.useLargerScreen")}
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2 border-t bg-card p-2">
            <span className="px-1 text-xs text-muted-foreground tabular-nums">
              {t("pipelinesAdmin.code.linesCount", { count: lines })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMounted(true)
                setOpen(true)
              }}
            >
              <Code2 />
              {t("pipelinesAdmin.code.openEditor")}
            </Button>
          </div>
        )}
      </div>
      {fieldState.error?.message ? (
        <p role="alert" className="text-xs text-destructive">
          {fieldState.error.message}
        </p>
      ) : null}

      <div className="flex max-w-xs flex-col gap-1.5">
        <span className="text-sm font-medium">{t("pipelinesAdmin.code.timeout")}</span>
        <SelectInput
          aria-label={t("pipelinesAdmin.code.timeout")}
          value={String(timeoutField.value ?? DEFAULT_CODE_TIMEOUT_MS)}
          options={TIMEOUT_CHOICES_MS.map((ms) => ({
            value: String(ms),
            label: t("pipelinesAdmin.code.seconds", { count: ms / 1000 }),
          }))}
          onChange={(value) => timeoutField.onChange(value ? Number(value) : null)}
        />
      </div>

      <Callout tone="neutral" icon={<Info />}>
        <span className="text-xs">{t("pipelinesAdmin.code.twoExecutions")}</span>
      </Callout>

      {mounted ? (
        <Suspense fallback={null}>
          <CodeEditorPanel
            open={open}
            onOpenChange={setOpen}
            value={code}
            onChange={codeField.onChange}
            title={name?.trim() || t("pipelinesAdmin.triggers.actions.run_code.label")}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
