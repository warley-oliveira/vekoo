import { useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"

import { CodeEditor, type CodeEditorInstance } from "@/components/code-editor"
import { Callout, CopyButton, SidePanel } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { TRIGGER_PARAMS_DEFINITION } from "@/lib/pipelines-admin/script-globals"
import { SCRIPT_REFERENCE, SCRIPT_SNIPPETS } from "@/lib/pipelines-admin/script-reference"
import { MAX_CODE_LENGTH } from "@/lib/pipelines-admin/trigger-catalog"
import { cn } from "@/lib/utils"

type CodeEditorPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onChange: (value: string) => void
  /** O nome do gatilho, no título. */
  title: string
}

/**
 * O editor do script, em tela larga: o `CodeEditor` da plataforma à esquerda, e à direita a referência
 * do que um gatilho enxerga. Fica num painel próprio, sobre o do gatilho, e carrega só quando alguém
 * abre: o Monaco pesa.
 */
export default function CodeEditorPanel({ open, onOpenChange, value, onChange, title }: CodeEditorPanelProps) {
  const { t } = useTranslation()
  const editorRef = useRef<CodeEditorInstance | null>(null)

  const onEditorMount = useCallback((editor: CodeEditorInstance) => {
    editorRef.current = editor
    editor.focus()
  }, [])

  function insert(text: string) {
    const editor = editorRef.current
    if (!editor) return
    const selection = editor.getSelection()
    if (selection) {
      editor.executeEdits("reference", [{ range: selection, text, forceMoveMarkers: true }])
    }
    editor.focus()
  }

  /**
   * Um exemplo é um script inteiro. Código ainda intocado dá lugar a ele; o que a pessoa já escreveu
   * fica, e o exemplo entra no fim, para ela aproveitar o que quiser.
   */
  function insertSnippet(code: string) {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return

    const current = model.getValue().trim()
    const untouched = !current || current === t("pipelinesAdmin.code.starter").trim()
    const range = untouched
      ? model.getFullModelRange()
      : {
          startLineNumber: model.getLineCount(),
          startColumn: model.getLineMaxColumn(model.getLineCount()),
          endLineNumber: model.getLineCount(),
          endColumn: model.getLineMaxColumn(model.getLineCount()),
        }
    editor.executeEdits("reference", [
      { range, text: untouched ? `${code}\n` : `\n\n${code}\n`, forceMoveMarkers: true },
    ])
    editor.focus()
  }

  const tooLong = value.length > MAX_CODE_LENGTH

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      className="data-[side=right]:sm:max-w-[min(76rem,100vw)]"
      title={t("pipelinesAdmin.code.panelTitle")}
      description={title}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs text-pretty text-muted-foreground">
            {t("pipelinesAdmin.code.footerHint")}
          </p>
          <Button type="button" className="shrink-0 pointer-coarse:h-10" onClick={() => onOpenChange(false)}>
            {t("pipelinesAdmin.code.done")}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-[20rem] min-w-0 flex-1 flex-col">
          <CodeEditor
            fill
            value={value}
            onChange={onChange}
            paramsDefinition={TRIGGER_PARAMS_DEFINITION}
            showReference={false}
            onEditorMount={onEditorMount}
            aria-label={t("pipelinesAdmin.code.panelTitle")}
            className="min-h-0 flex-1 rounded-none border-0"
          />
          {tooLong ? (
            <p role="alert" className="border-t px-4 py-2 text-xs text-destructive">
              {t("pipelinesAdmin.triggers.validation.codeTooLong")}
            </p>
          ) : null}
        </div>

        <CodeReference onInsert={insert} onInsertSnippet={insertSnippet} />
      </div>
    </SidePanel>
  )
}

function CodeReference({
  onInsert,
  onInsertSnippet,
}: {
  onInsert: (text: string) => void
  onInsertSnippet: (code: string) => void
}) {
  const { t } = useTranslation()

  return (
    <aside
      aria-label={t("pipelinesAdmin.code.referenceTitle")}
      className="flex max-h-[45dvh] shrink-0 flex-col gap-5 overflow-y-auto border-t p-4 lg:max-h-none lg:w-96 lg:border-t-0 lg:border-l"
    >
      <div className="space-y-1">
        <h3 className="font-heading text-sm font-medium">{t("pipelinesAdmin.code.referenceTitle")}</h3>
        <p className="text-xs text-pretty text-muted-foreground">{t("pipelinesAdmin.code.referenceIntro")}</p>
      </div>

      <Callout tone="neutral" title={t("pipelinesAdmin.code.rulesTitle")}>
        <ul className="list-disc space-y-0.5 pl-4 text-xs">
          <li>{t("pipelinesAdmin.code.rules.noRetry")}</li>
          <li>{t("pipelinesAdmin.code.rules.noChain")}</li>
          <li>{t("pipelinesAdmin.code.rules.noTimers")}</li>
          <li>{t("pipelinesAdmin.code.rules.names")}</li>
        </ul>
      </Callout>

      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">{t("pipelinesAdmin.code.snippetsTitle")}</h4>
        {SCRIPT_SNIPPETS.map((snippet) => (
          <div key={snippet.id} className="flex items-center gap-2 rounded-lg p-2 ring-1 ring-foreground/10">
            <p className="min-w-0 flex-1 text-xs text-pretty">{t(`pipelinesAdmin.code.snippets.${snippet.id}`)}</p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0 pointer-coarse:h-8"
              onClick={() => onInsertSnippet(snippet.code)}
            >
              {t("pipelinesAdmin.code.insert")}
            </Button>
          </div>
        ))}
      </section>

      {SCRIPT_REFERENCE.map((group) => (
        <section key={group.id} className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">
            {t(`pipelinesAdmin.code.reference.${group.id}.title`)}
          </h4>
          <ul className="flex flex-col">
            {group.items.map((item) => (
              <li key={item.id} className="group/item flex items-start gap-1 border-b py-1.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    title={t("pipelinesAdmin.code.insert")}
                    className={cn(
                      "block max-w-full truncate rounded text-left font-mono text-xs text-foreground outline-none",
                      "hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                    )}
                    onClick={() => onInsert(item.insert ?? item.code)}
                  >
                    {item.code}
                  </button>
                  <p className="text-xs text-pretty text-muted-foreground">
                    {t(`pipelinesAdmin.code.reference.${group.id}.${item.id}`)}
                  </p>
                </div>
                <CopyButton value={item.insert ?? item.code} className="shrink-0 opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  )
}
