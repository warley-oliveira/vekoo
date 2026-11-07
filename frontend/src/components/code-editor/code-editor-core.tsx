import { useCallback, useEffect, useRef, useState } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import { useTranslation } from "react-i18next"
import {
  AlignLeft,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  TriangleAlert,
  WrapText,
} from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"

import { ApiReference } from "./api-reference"
import { monaco } from "./monaco-setup"
import { RunOutput } from "./run-output"
import { scriptDefinitions } from "./script-definitions"
import { credentialsDeclaration, paramsDeclaration, WRAPPER_LINES_BEFORE, wrapForValidation } from "./script-types"
import type { CodeEditorProps } from "./types"
import "./code-editor.css"

type Marker = {
  severity: number
  message: string
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  code: string
}

const ERROR_SEVERITY = 8
const WARNING_SEVERITY = 4

// Avisos de TypeScript que não fazem sentido em JavaScript solto.
const IGNORED_DIAGNOSTICS = new Set(["7006", "7008", "7010", "7016", "7017", "7022", "7023", "7034", "7053"])

/* oxlint-disable typescript/no-explicit-any -- a API de linguagens do Monaco não tem tipo público nesta entrada */
const tsApi = () => (monaco as any).typescript

let compilerConfigured = false

function configureCompiler() {
  if (compilerConfigured) return
  compilerConfigured = true
  const ts = tsApi()
  // A validação é nossa, numa cópia embrulhada em função: `return` e `await` no topo são válidos no motor.
  ts.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
  ts.javascriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    module: ts.ModuleKind.CommonJS,
    noEmit: true,
    allowJs: true,
    checkJs: true,
    strict: false,
    noImplicitAny: false,
    strictNullChecks: false,
    noUnusedLocals: false,
    noUnusedParameters: false,
    noImplicitThis: false,
    noStrictGenericChecks: true,
  })
}

let quickFixCallback: ((name: string) => void) | null = null
let quickFixRegistered = false

function registerQuickFix(createLabel: (name: string) => string) {
  if (quickFixRegistered) return
  quickFixRegistered = true
  const commandId = "vekoo.addParameter"
  monaco.editor.registerCommand(commandId, (_accessor: unknown, name: string) => quickFixCallback?.(name))
  monaco.languages.registerCodeActionProvider("javascript", {
    provideCodeActions: (_model, _range, context) => {
      const actions = context.markers.flatMap((marker) => {
        const code = String(marker.code)
        if ((code !== "2339" && code !== "2551") || !marker.message.includes("type 'Params'")) return []
        const name = /Property '([^']+)' does not exist/.exec(marker.message)?.[1]
        if (!name) return []
        const title = createLabel(name)
        return [
          {
            title,
            kind: "quickfix",
            diagnostics: [marker],
            isPreferred: true,
            command: { id: commandId, title, arguments: [name] },
          },
        ]
      })
      return { actions, dispose: () => undefined }
    },
  })
}

export default function CodeEditorCore({
  value,
  onChange,
  language = "javascript",
  height = 360,
  readOnly = false,
  parameters,
  credentialFields,
  onAddParameter,
  onRun,
  running,
  result,
  showReference,
  "aria-label": ariaLabel,
  className,
}: CodeEditorProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const decorations = useRef<string[]>([])
  const validateRef = useRef<(() => void) | null>(null)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [wrap, setWrap] = useState<"on" | "off">("on")
  const [maximized, setMaximized] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(() => (showReference ?? language === "javascript") && !isMobile)

  const isScript = language === "javascript"
  const canReference = showReference ?? isScript
  const errors = markers.filter((marker) => marker.severity === ERROR_SEVERITY).length
  const warnings = markers.filter((marker) => marker.severity === WARNING_SEVERITY).length

  // O callback mora num módulo porque o comando do Monaco é global. Quem está montado é quem responde.
  useEffect(() => {
    quickFixCallback = onAddParameter ?? null
    return () => {
      quickFixCallback = null
    }
  }, [onAddParameter])

  // Parâmetros mudaram: o autocompletar e a validação precisam ver os novos.
  const paramsKey = JSON.stringify(parameters ?? [])
  const credentialsKey = JSON.stringify(credentialFields ?? [])
  useEffect(() => {
    if (!isScript) return
    const ts = tsApi()
    ts.javascriptDefaults.setExtraLibs([
      {
        content: scriptDefinitions(
          paramsDeclaration(JSON.parse(paramsKey)),
          credentialsDeclaration(JSON.parse(credentialsKey))
        ),
        filePath: "ts:script-globals.d.ts",
      },
    ])
    validateRef.current?.()
  }, [credentialsKey, isScript, paramsKey])

  const handleMount = useCallback<OnMount>(
    (editor) => {
      editorRef.current = editor
      if (!isScript) return

      configureCompiler()
      registerQuickFix((name) => t("flows.codeEditor.createParameter", { name }))

      const model = editor.getModel()
      if (!model) return

      const uri = monaco.Uri.parse(`inmemory://validation-${model.id}.js`)
      monaco.editor.getModel(uri)?.dispose()
      const shadow = monaco.editor.createModel("", "javascript", uri)

      const validate = async () => {
        if (model.isDisposed() || shadow.isDisposed()) return
        shadow.setValue(wrapForValidation(model.getValue()))
        try {
          const getWorker = await tsApi().getJavaScriptWorker()
          const worker = await getWorker(uri)
          const [syntax, semantic] = await Promise.all([
            worker.getSyntacticDiagnostics(uri.toString()),
            worker.getSemanticDiagnostics(uri.toString()),
          ])
          if (model.isDisposed() || shadow.isDisposed()) return

          const next: Marker[] = [...syntax, ...semantic]
            .filter((diagnostic: any) => !IGNORED_DIAGNOSTICS.has(String(diagnostic.code)))
            .filter((diagnostic: any) => {
              const text = typeof diagnostic.messageText === "string" ? diagnostic.messageText : diagnostic.messageText?.messageText
              return !String(text ?? "").includes("type 'typeof globalThis'")
            })
            .map((diagnostic: any) => {
              const start = shadow.getPositionAt(diagnostic.start ?? 0)
              const end = shadow.getPositionAt((diagnostic.start ?? 0) + (diagnostic.length ?? 0))
              const startLine = start.lineNumber - WRAPPER_LINES_BEFORE
              const endLine = end.lineNumber - WRAPPER_LINES_BEFORE
              // O fecho do invólucro não existe para quem escreve: `catalog.` no fim e chave sem fechar acusam
              // lá, e o erro é da última linha. Descartar daria "Sem problemas" num código que nem compila.
              const lastLine = model.getLineCount()
              const lastColumn = model.getLineMaxColumn(lastLine)
              return {
                severity: diagnostic.category === 1 ? ERROR_SEVERITY : WARNING_SEVERITY,
                message:
                  typeof diagnostic.messageText === "string"
                    ? diagnostic.messageText
                    : (diagnostic.messageText?.messageText ?? ""),
                startLineNumber: Math.min(startLine, lastLine),
                startColumn: startLine > lastLine ? lastColumn : start.column,
                endLineNumber: Math.min(endLine, lastLine),
                endColumn: endLine > lastLine ? lastColumn : end.column,
                code: String(diagnostic.code),
              }
            })
            .filter((marker) => marker.startLineNumber >= 1)

          monaco.editor.setModelMarkers(model, "script-validation", next)
          setMarkers(next)
        } catch {
          // O worker ainda subindo: a próxima alteração valida de novo.
        }
      }

      validateRef.current = () => void validate()
      const first = window.setTimeout(() => void validate(), 200)
      let timer: number | undefined
      const subscription = model.onDidChangeContent(() => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => void validate(), 300)
      })
      model.onWillDispose(() => {
        window.clearTimeout(first)
        window.clearTimeout(timer)
        subscription.dispose()
        shadow.dispose()
        validateRef.current = null
      })
    },
    [isScript, t]
  )

  useEffect(() => {
    if (maximized) window.setTimeout(() => editorRef.current?.focus(), 80)
    if (!maximized) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMaximized(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [maximized])

  const insertAtCursor = (text: string) => {
    const editor = editorRef.current
    if (!editor || readOnly) return
    const selection = editor.getSelection()
    if (selection) editor.executeEdits("api-reference", [{ range: selection, text, forceMoveMarkers: true }])
    editor.focus()
  }

  const goTo = (marker: Marker) => {
    const editor = editorRef.current
    if (!editor) return
    editor.setPosition({ lineNumber: marker.startLineNumber, column: marker.startColumn })
    editor.revealLineInCenter(marker.startLineNumber)
    editor.focus()
  }

  const highlightLine = (line: number | null) => {
    const editor = editorRef.current
    if (!editor) return
    decorations.current = editor.deltaDecorations(
      decorations.current,
      line
        ? [
            {
              range: new monaco.Range(line, 1, line, 1),
              options: { isWholeLine: true, className: "code-editor-called-line" },
            },
          ]
        : []
    )
    if (line) editor.revealLineInCenterIfOutsideViewport(line)
  }

  const showingOutput = Boolean(running || result)

  return (
    <div
      data-maximized={maximized}
      className={cn(
        "code-editor flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card",
        maximized && "fixed inset-0 z-[70] rounded-none border-0",
        className
      )}
    >
      <div role="toolbar" aria-label={t("flows.codeEditor.toolbar")} className="flex shrink-0 items-center gap-1 border-b bg-muted/40 px-1.5 py-1">
        {isScript ? (
          <ProblemsChip errors={errors} warnings={warnings} markers={markers} onPick={goTo} />
        ) : null}
        <span className="flex-1" />
        {!readOnly ? (
          <IconButton
            label={t("flows.codeEditor.format")}
            onClick={() => void editorRef.current?.getAction("editor.action.formatDocument")?.run()}
          >
            <AlignLeft />
          </IconButton>
        ) : null}
        <IconButton
          label={wrap === "on" ? t("flows.codeEditor.wrapOn") : t("flows.codeEditor.wrapOff")}
          pressed={wrap === "on"}
          onClick={() => setWrap(wrap === "on" ? "off" : "on")}
        >
          <WrapText />
        </IconButton>
        {canReference ? (
          <IconButton
            label={t("flows.codeEditor.referenceToggle")}
            pressed={referenceOpen}
            onClick={() => setReferenceOpen((current) => !current)}
          >
            <BookOpen />
          </IconButton>
        ) : null}
        <IconButton
          label={maximized ? t("flows.codeEditor.restore") : t("flows.codeEditor.maximize")}
          onClick={() => setMaximized((current) => !current)}
        >
          {maximized ? <Minimize2 /> : <Maximize2 />}
        </IconButton>
        {onRun ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={running}
            onClick={onRun}
            aria-label={t("flows.codeEditor.run")}
            title={t("flows.codeEditor.run")}
            className="ml-1 h-7"
          >
            {running ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Play />}
            <span className="max-sm:hidden">{t("flows.codeEditor.run")}</span>
          </Button>
        ) : null}
      </div>

      <div
        className={cn("flex min-h-0", maximized ? "flex-1" : "shrink-0", isMobile && "flex-col")}
        style={maximized ? undefined : { height }}
      >
        <div className="min-h-0 min-w-0 flex-1">
          <Editor
            language={language}
            value={value}
            onChange={(next) => onChange(next ?? "")}
            onMount={handleMount}
            theme="vs"
            loading={<Skeleton className="size-full rounded-none" />}
            options={{
              ariaLabel,
              readOnly,
              wordWrap: wrap,
              minimap: { enabled: maximized },
              fontSize: 13,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              lineNumbersMinChars: 3,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
              padding: { top: 10, bottom: 10 },
              renderWhitespace: "selection",
              bracketPairColorization: { enabled: true },
              fixedOverflowWidgets: true,
              accessibilitySupport: "auto",
            }}
          />
        </div>
        {referenceOpen && canReference ? (
          <aside
            aria-label={t("flows.codeEditor.referenceToggle")}
            className={cn("min-h-0 shrink-0 overflow-hidden border-l bg-muted/20", isMobile ? "h-40 border-t border-l-0" : "w-64")}
          >
            <ApiReference onInsert={insertAtCursor} />
          </aside>
        ) : null}
      </div>

      {showingOutput ? (
        <div className="max-h-[40%] shrink-0 overflow-y-auto border-t">
          <RunOutput result={result} running={running} onLineHover={highlightLine} />
        </div>
      ) : null}
    </div>
  )
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn("size-7", pressed && "bg-accent text-accent-foreground")}
    >
      {children}
    </Button>
  )
}

function ProblemsChip({
  errors,
  warnings,
  markers,
  onPick,
}: {
  errors: number
  warnings: number
  markers: Marker[]
  onPick: (marker: Marker) => void
}) {
  const { t } = useTranslation()

  if (errors === 0 && warnings === 0) {
    return (
      <span className="flex items-center gap-1 px-1.5 text-xs whitespace-nowrap text-status-success">
        <CheckCircle2 className="size-3.5" aria-hidden />
        {t("flows.codeEditor.noProblems")}
      </span>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-1.5 text-xs" />
        }
      >
        {errors > 0 ? (
          <span className="flex items-center gap-1 text-status-danger">
            <CircleAlert className="size-3.5" aria-hidden />
            {t("flows.codeEditor.errors", { count: errors })}
          </span>
        ) : null}
        {warnings > 0 ? (
          <span className="flex items-center gap-1 text-status-warning">
            <TriangleAlert className="size-3.5" aria-hidden />
            {t("flows.codeEditor.warnings", { count: warnings })}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-64 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto p-1">
        <ul>
          {markers.map((marker, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => onPick(marker)}
                className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <span className="text-xs break-words">{marker.message}</span>
                <span className="text-[11px] text-muted-foreground">
                  {t("flows.codeEditor.lineColumn", { line: marker.startLineNumber, column: marker.startColumn })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
