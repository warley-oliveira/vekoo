import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Lock, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { CodeEditor, type CodeRunResult, type ScriptParameter } from "@/components/code-editor"
import {
  Callout,
  DetailSkeleton,
  ErrorState,
  SearchableSelect,
  SelectInput,
  ResponsiveDialog,
  useConfirm,
  type LoadOptions,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { lookupChats, runToolTest, useToolDetail, useToolMutations } from "@/hooks/flows/use-flow-references"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { ApiError } from "@/lib/api"
import { formatPhone } from "@/lib/format-phone"

import { useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"

// O código do bloco "Executar função". A função é da organização, e não do bloco: editar aqui muda em todo fluxo
// que a usa, e é por isso que o painel diz isso com todas as letras. Função que veio de uma ferramenta instalada
// só mostra o que faz: para mudar o código, é preciso personalizar.

const PARAMETER_TYPES = ["string", "number", "integer", "boolean", "array", "object"]

const STARTER = `// Quem chama manda os dados em \`params\`, e o que você devolver fica numa variável do fluxo.
// A referência ao lado mostra o que dá para usar.
return { ok: true };
`

export default function CodeToolPanel() {
  const codeTool = useEditorUi((state) => state.codeTool)
  const setCodeTool = useEditorUi((state) => state.setCodeTool)
  if (!codeTool) return null
  // A `key` é o bloco, e não a função: criar a função no meio do caminho não pode apagar o que está na tela.
  return <PanelBody key={codeTool.nodeId} toolId={codeTool.id} nodeId={codeTool.nodeId} onClose={() => setCodeTool(null)} />
}

function PanelBody({ toolId, nodeId, onClose }: { toolId: string | null; nodeId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const api = useEditorApi()
  const { tool, error, isLoading, reload } = useToolDetail(toolId)
  const { createTool, updateTool, personalizeTool } = useToolMutations()
  const confirm = useConfirm()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [code, setCode] = useState(STARTER)
  const [parameters, setParameters] = useState<ScriptParameter[]>([])
  const [args, setArgs] = useState<Record<string, string>>({})
  const [testChatId, setTestChatId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CodeRunResult | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const runController = useRef<AbortController | null>(null)

  const loaded = useRef(false)
  useEffect(() => {
    if (!tool || loaded.current) return
    loaded.current = true
    setName(tool.name)
    setDescription(tool.description ?? "")
    setCode(tool.jsCode ?? "")
    setParameters(tool.parameters ?? [])
  }, [tool])

  useEffect(() => () => runController.current?.abort(), [])

  const locked = Boolean(tool?.locked)
  const close = useGuardedClose(dirty, onClose)
  const change = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setDirty(true)
  }

  const nameValid = useMemo(() => /^[a-zA-Z0-9_-]{1,64}$/.test(name), [name])

  const save = async (): Promise<string | null> => {
    setFormError(null)
    if (!nameValid) {
      setFormError(t("flows.toolPanel.nameInvalid"))
      return null
    }
    setBusy(true)
    try {
      const payload = { name, description, jsCode: code, parameters }
      if (toolId) {
        await updateTool(toolId, payload)
        setDirty(false)
        await reload()
        return toolId
      }
      const created = await createTool(payload)
      setDirty(false)
      api.getState().updateData(nodeId, { tool_id: created.id, tool_name: created.name, params: {} }, { coalesce: "" })
      useEditorUi.setState({ codeTool: { id: created.id, nodeId } })
      return created.id
    } catch (failure) {
      setFormError(failure instanceof ApiError ? failure.message : t("flows.toolPanel.saveFailed"))
      return null
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    const id = await save()
    if (!id) return
    setRunning(true)
    setResult(null)
    runController.current = new AbortController()
    try {
      const parsed = Object.fromEntries(
        parameters.filter((parameter) => args[parameter.name]).map((parameter) => [parameter.name, coerce(args[parameter.name], parameter.type)])
      )
      setResult(await runToolTest(id, parsed, testChatId, runController.current.signal))
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError") return
      setResult({ status: "failed", error: failure instanceof ApiError ? failure.message : t("flows.toolPanel.runFailed") })
    } finally {
      setRunning(false)
    }
  }

  const personalize = async () => {
    if (!toolId) return
    const confirmed = await confirm({
      title: t("flows.toolPanel.personalizeTitle"),
      description: t("flows.toolPanel.personalizeDescription"),
      confirmLabel: t("flows.toolPanel.personalize"),
      onConfirm: async () => {
        await personalizeTool(toolId)
      },
    })
    if (!confirmed) return
    loaded.current = false
    await reload()
    toast.success(t("flows.toolPanel.personalized"))
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) void close()
      }}
      title={toolId ? (tool?.name ?? t("flows.toolPanel.title")) : t("flows.toolPanel.newTitle")}
      description={t("flows.toolPanel.description")}
      size="2xl"
      footer={
        locked ? (
          <Button type="button" variant="outline" onClick={onClose}>
            {t("flows.toolPanel.close")}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("flows.toolPanel.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy || !dirty}
              onClick={() =>
                void save().then((id) => {
                  if (id) toast.success(t("flows.toolPanel.saved"))
                })
              }
            >
              {t("flows.toolPanel.save")}
            </Button>
          </>
        )
      }
    >
      {error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading && toolId ? (
        <DetailSkeleton rows={5} />
      ) : (
        <div className="flex flex-col gap-4">
          {locked ? (
            <Callout
              icon={<Lock />}
              title={t("flows.toolPanel.lockedTitle", { name: tool?.tool?.name })}
              action={
                <Button type="button" size="sm" variant="outline" onClick={() => void personalize()}>
                  {t("flows.toolPanel.personalize")}
                </Button>
              }
            >
              {t("flows.toolPanel.lockedDescription")}
            </Callout>
          ) : toolId ? (
            <Callout>{t("flows.toolPanel.shared")}</Callout>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tool-name">{t("flows.toolPanel.name")}</Label>
              <Input
                id="tool-name"
                value={name}
                disabled={locked}
                className="font-mono md:text-[13px]"
                placeholder="consultar_cep"
                aria-invalid={Boolean(name) && !nameValid}
                onChange={(event) => change(setName)(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("flows.toolPanel.nameHint")}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tool-description">{t("flows.toolPanel.descriptionLabel")}</Label>
              <Textarea
                id="tool-description"
                rows={2}
                value={description}
                disabled={locked}
                placeholder={t("flows.toolPanel.descriptionPlaceholder")}
                onChange={(event) => change(setDescription)(event.target.value)}
              />
            </div>
          </div>

          {!locked ? (
            <ParametersEditor
              parameters={parameters}
              args={args}
              onArgs={setArgs}
              onChange={change(setParameters)}
            />
          ) : null}

          {!locked ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tool-test-chat">{t("flows.toolPanel.testChat")}</Label>
              <SearchableSelect
                id="tool-test-chat"
                value={testChatId}
                clearable
                loadOptions={searchChats}
                placeholder={t("flows.start.pick")}
                emptyLabel={t("flows.start.empty")}
                onChange={(value) => setTestChatId(value)}
              />
              <p className="text-xs text-muted-foreground">{t("flows.toolPanel.testChatHint")}</p>
            </div>
          ) : null}

          {!locked ? (
            <CodeEditor
              value={code}
              onChange={change(setCode)}
              height={340}
              parameters={parameters}
              onAddParameter={(parameter) =>
                change(setParameters)([...parameters, { name: parameter, type: "string", description: "", required: false }])
              }
              onRun={() => void run()}
              running={running}
              result={result}
              aria-label={t("flows.toolPanel.codeLabel")}
            />
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {(tool?.parameters ?? []).map((parameter) => (
                <li key={parameter.name} className="rounded-md border px-3 py-2">
                  <code className="font-mono text-xs">{parameter.name}</code>
                  {parameter.description ? <p className="mt-0.5 text-xs text-muted-foreground">{parameter.description}</p> : null}
                </li>
              ))}
            </ul>
          )}

          {formError ? (
            <p role="alert" className="rounded-lg bg-status-danger-soft px-3 py-2 text-sm text-status-danger">
              {formError}
            </p>
          ) : null}
        </div>
      )}
    </ResponsiveDialog>
  )
}

const searchChats: LoadOptions = async (query, signal) => {
  const chats = await lookupChats(query, signal)
  return chats.map((chat) => ({
    value: chat.id,
    label: chat.displayName || chat.userName || formatPhone(chat.externalId),
    description: formatPhone(chat.externalId),
  }))
}

function coerce(value: string, type: string): unknown {
  if (type === "number" || type === "integer") return Number(value)
  if (type === "boolean") return value === "true"
  if (type === "array" || type === "object") {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function ParametersEditor({
  parameters,
  args,
  onArgs,
  onChange,
}: {
  parameters: ScriptParameter[]
  args: Record<string, string>
  onArgs: (args: Record<string, string>) => void
  onChange: (parameters: ScriptParameter[]) => void
}) {
  const { t } = useTranslation()
  const patch = (index: number, value: Partial<ScriptParameter>) =>
    onChange(parameters.map((parameter, position) => (position === index ? { ...parameter, ...value } : parameter)))

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">{t("flows.toolPanel.parameters")}</h3>
        <p className="text-xs text-muted-foreground">{t("flows.toolPanel.parametersHint")}</p>
      </div>
      {parameters.map((parameter, index) => (
        <div key={index} className="grid grid-cols-1 items-center gap-2 rounded-lg border p-2 sm:grid-cols-[9rem_6.5rem_minmax(0,1fr)_8rem_auto_auto]">
          <Input
            aria-label={t("flows.toolPanel.parameterName")}
            placeholder={t("flows.toolPanel.parameterName")}
            className="font-mono md:text-[13px]"
            value={parameter.name}
            onChange={(event) => patch(index, { name: event.target.value.replace(/\W/g, "_") })}
          />
          <SelectInput
            aria-label={t("flows.toolPanel.parameterType")}
            value={parameter.type}
            options={PARAMETER_TYPES.map((value) => ({ value, label: t(`flows.toolPanel.types.${value}`) }))}
            onChange={(value) => patch(index, { type: value ?? "string" })}
          />
          <Input
            aria-label={t("flows.toolPanel.parameterDescription")}
            placeholder={t("flows.toolPanel.parameterDescription")}
            value={parameter.description ?? ""}
            onChange={(event) => patch(index, { description: event.target.value })}
          />
          <Input
            aria-label={t("flows.toolPanel.parameterTest")}
            placeholder={t("flows.toolPanel.parameterTest")}
            value={args[parameter.name] ?? ""}
            onChange={(event) => onArgs({ ...args, [parameter.name]: event.target.value })}
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              size="sm"
              checked={Boolean(parameter.required)}
              onCheckedChange={(required) => patch(index, { required })}
            />
            {t("flows.toolPanel.parameterRequired")}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("flows.toolPanel.parameterRemove")}
            onClick={() => onChange(parameters.filter((_, position) => position !== index))}
            className="hover:text-status-danger"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start border-dashed"
        onClick={() => onChange([...parameters, { name: "", type: "string", description: "", required: false }])}
      >
        <Plus />
        {t("flows.toolPanel.parameterAdd")}
      </Button>
    </section>
  )
}
