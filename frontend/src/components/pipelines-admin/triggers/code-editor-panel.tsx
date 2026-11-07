import { useRef, useState } from "react"
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react"
// Monaco do próprio pacote, e não do CDN padrão da biblioteca, que a CSP de produção bloqueia.
import "@/components/code-editor/monaco-setup"
import { useTranslation } from "react-i18next"
import { AlignLeft, CircleAlert, Loader2, WrapText } from "lucide-react"

import { Callout, CopyButton, SidePanel } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SCRIPT_GLOBALS } from "@/lib/pipelines-admin/script-globals"
import { SCRIPT_REFERENCE, SCRIPT_SNIPPETS } from "@/lib/pipelines-admin/script-reference"
import { MAX_CODE_LENGTH } from "@/lib/pipelines-admin/trigger-catalog"
import { cn } from "@/lib/utils"

type EditorInstance = Parameters<OnMount>[0]

type Problem = { line: number; message: string }

const ERROR_SEVERITY = 8

// O corpo do script roda dentro de `async function onMessage(params)`: `return` e `await` valem no
// topo, e o editor não pode reclamar deles.
const IGNORED_DIAGNOSTICS = [1108, 1375, 1378, 7044, 80001, 80005]

const configureLanguage: BeforeMount = (monaco) => {
  // A API de TypeScript existe em execução, em `monaco.typescript`; a tipagem do pacote não a declara.
  const typescript = (monaco as unknown as { typescript: MonacoTypescript }).typescript
  const defaults = typescript.javascriptDefaults

  defaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: IGNORED_DIAGNOSTICS,
  })
  defaults.setCompilerOptions({
    target: typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: true,
    strict: false,
    noEmit: true,
    lib: ["es2020"],
  })
  defaults.setExtraLibs([{ content: SCRIPT_GLOBALS, filePath: "ts:vekoo-script.d.ts" }])
}

type MonacoTypescript = {
  ScriptTarget: { ES2020: number }
  javascriptDefaults: {
    setDiagnosticsOptions: (options: Record<string, unknown>) => void
    setCompilerOptions: (options: Record<string, unknown>) => void
    setExtraLibs: (libs: { content: string; filePath?: string }[]) => void
  }
}

type CodeEditorPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onChange: (value: string) => void
  /** O nome do gatilho, no título. */
  title: string
}

/**
 * O editor do script, em tela larga: código à esquerda, referência da API à direita. Fica num
 * painel próprio, sobre o do gatilho, e carrega só quando alguém abre: o Monaco pesa.
 */
export default function CodeEditorPanel({ open, onOpenChange, value, onChange, title }: CodeEditorPanelProps) {
  const { t } = useTranslation()
  const editorRef = useRef<EditorInstance | null>(null)
  const [wrap, setWrap] = useState(true)
  const [problems, setProblems] = useState<Problem[]>([])

  const onMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.focus()
  }

  function insert(text: string) {
    const editor = editorRef.current
    if (!editor) return
    const selection = editor.getSelection()
    if (selection) {
      editor.executeEdits("reference", [{ range: selection, text, forceMoveMarkers: true }])
    }
    editor.focus()
  }

  function goToLine(line: number) {
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
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

  const format = () => void editorRef.current?.getAction("editor.action.formatDocument")?.run()
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
      headerActions={
        <div className="mr-8 flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("pipelinesAdmin.code.format")}
                  onClick={format}
                />
              }
            >
              <AlignLeft />
            </TooltipTrigger>
            <TooltipContent>{t("pipelinesAdmin.code.format")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant={wrap ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-pressed={wrap}
                  aria-label={t("pipelinesAdmin.code.wrap")}
                  onClick={() => setWrap((current) => !current)}
                />
              }
            >
              <WrapText />
            </TooltipTrigger>
            <TooltipContent>{t("pipelinesAdmin.code.wrap")}</TooltipContent>
          </Tooltip>
        </div>
      }
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
          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              defaultLanguage="javascript"
              value={value}
              onChange={(next) => onChange(next ?? "")}
              beforeMount={configureLanguage}
              onMount={onMount}
              onValidate={(markers) =>
                setProblems(
                  markers
                    .filter((marker) => marker.severity >= ERROR_SEVERITY)
                    .map((marker) => ({ line: marker.startLineNumber, message: marker.message }))
                )
              }
              loading={
                <div className="flex h-full w-full flex-col gap-2 p-4" aria-label={t("pipelinesAdmin.code.loading")}>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                    {t("pipelinesAdmin.code.loading")}
                  </span>
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-3/5" />
                </div>
              }
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: wrap ? "on" : "off",
                scrollBeyondLastLine: false,
                tabSize: 2,
                automaticLayout: true,
                fixedOverflowWidgets: true,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
          {tooLong ? (
            <p role="alert" className="border-t px-4 py-2 text-xs text-destructive">
              {t("pipelinesAdmin.triggers.validation.codeTooLong")}
            </p>
          ) : null}
          {problems.length > 0 ? (
            <div className="max-h-28 overflow-y-auto border-t px-2 py-1.5">
              <p className="px-2 pb-1 text-xs font-medium text-status-danger">
                {t("pipelinesAdmin.code.problems", { count: problems.length })}
              </p>
              <ul>
                {problems.map((problem, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      className="flex w-full gap-2 rounded px-2 py-1 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => goToLine(problem.line)}
                    >
                      <CircleAlert aria-hidden className="mt-0.5 size-3 shrink-0 text-status-danger" />
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {t("pipelinesAdmin.code.line", { line: problem.line })}
                      </span>
                      <span className="min-w-0">{problem.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
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
