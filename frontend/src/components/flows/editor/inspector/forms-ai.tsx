import { useMemo, useRef, useState, type ReactNode } from "react"
import { Link } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { Bot, ChevronDown, Signpost, X } from "lucide-react"

import { CreatableSelect, MultiSelectInput, type SelectOption } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToolOptions } from "@/hooks/flows/use-flow-references"
import { fieldKeyFromLabel, type FieldRef } from "@/lib/flows/fields"
import { uniqueOutputId } from "@/lib/flows/outputs"
import { cn } from "@/lib/utils"

import { useEditor, useEditorApi } from "../store"
import { useEditorUi } from "../ui-store"
import { str, useBlockForm } from "./form-context"
import {
  AddButton,
  Advanced,
  ChoiceCards,
  Field,
  NumberBox,
  Note,
  Section,
  Segmented,
  TextInput,
  Toggle,
  VarField,
} from "./parts"

// Os blocos de IA. Cada um mostra só o que o motor usa. As saídas são o que há de mais importante aqui: é
// por elas que a conversa segue, e o texto de "quando seguir" é o que o modelo lê.

type Output = { id: string; label: string; when?: string; default?: boolean; parameters?: FieldRef[] }

function outputsOf(data: Record<string, unknown>): Output[] {
  return Array.isArray(data.outputs) ? (data.outputs as Output[]) : []
}

function OutputsEditor({
  title,
  description,
  nameLabel,
  whenLabel,
  whenPlaceholder,
  addLabel,
  newLabel,
  withParameters,
  minOutputs = 0,
  children,
}: {
  title: string
  description: string
  nameLabel: string
  whenLabel?: string
  whenPlaceholder?: string
  addLabel: string
  newLabel: string
  withParameters?: boolean
  minOutputs?: number
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const outputs = outputsOf(data)
  // O id de uma saída nova acompanha o nome ao sair do campo. O de uma que já existia fica como está:
  // é o que o modelo vê, e instruções podem citar.
  const fresh = useRef(new Set<string>())
  const [focusId, setFocusId] = useState<string | null>(null)

  const patch = (index: number, change: Partial<Output>) =>
    set({ outputs: outputs.map((output, position) => (position === index ? { ...output, ...change } : output)) })

  const add = () => {
    const id = uniqueOutputId(newLabel, outputs.map((output) => output.id))
    fresh.current.add(id)
    setFocusId(id)
    set({ outputs: [...outputs, { id, label: "", ...(whenLabel ? { when: "" } : {}) }] }, { coalesce: "" })
  }

  const syncId = (index: number) => {
    const output = outputs[index]
    if (!output || !fresh.current.has(output.id) || !output.label.trim()) return
    const others = outputs.filter((_, position) => position !== index).map((item) => item.id)
    const nextId = uniqueOutputId(output.label, others)
    if (nextId === output.id) return
    fresh.current.delete(output.id)
    fresh.current.add(nextId)
    set(
      { outputs: outputs.map((item, position) => (position === index ? { ...item, id: nextId } : item)) },
      { renames: { [output.id]: nextId }, coalesce: "" }
    )
  }

  return (
    <Section title={title} description={description}>
      {outputs.map((output, index) => (
        <div key={index} className="flex flex-col gap-2.5 rounded-lg border bg-muted/20 p-2.5">
          <div className="flex items-center gap-1.5">
            <Input
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={focusId === output.id}
              aria-label={nameLabel}
              placeholder={nameLabel}
              value={output.label || (output.id in SENTIMENTS ? t(SENTIMENTS[output.id]) : "")}
              onChange={(event) => patch(index, { label: event.target.value })}
              onBlur={() => syncId(index)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("flows.fields.outputs.remove")}
              disabled={outputs.length <= minOutputs}
              onClick={() => set({ outputs: outputs.filter((_, position) => position !== index) }, { coalesce: "" })}
              className="text-muted-foreground hover:text-status-danger"
            >
              <X />
            </Button>
          </div>
          {whenLabel ? (
            <Textarea
              rows={2}
              aria-label={whenLabel}
              placeholder={whenPlaceholder}
              value={output.when ?? ""}
              onChange={(event) => patch(index, { when: event.target.value })}
            />
          ) : null}
          {withParameters ? (
            <OutputParameters output={output} onChange={(parameters) => patch(index, { parameters })} />
          ) : null}
        </div>
      ))}
      <AddButton label={addLabel} onClick={add} />
      {children}
    </Section>
  )
}

const SENTIMENTS: Record<string, string> = {
  positive: "flows.outputs.positive",
  neutral: "flows.outputs.neutral",
  negative: "flows.outputs.negative",
}

function FixedOutput({ label, description, tone }: { label: string; description: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg border border-dashed px-3 py-2">
      <p className={cn("text-sm font-medium", tone === "danger" && "text-status-danger")}>{label}</p>
      <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{description}</p>
    </div>
  )
}

function OutputParameters({ output, onChange }: { output: Output; onChange: (parameters: FieldRef[]) => void }) {
  const { t } = useTranslation()
  const fields = useEditor((state) => state.fields)
  const refs = output.parameters ?? []
  const [open, setOpen] = useState(refs.length > 0)
  const collected = refs
    .map((ref) => fields.find((field) => field.key === ref.name)?.label)
    .filter(Boolean)
    .join(", ")

  return (
    <div className="border-t pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="min-w-0 flex-1 truncate">
          {collected ? t("flows.fields.outputs.saves", { names: collected }) : t("flows.fields.outputs.saveData")}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="mt-2">
          <FieldRefsPicker refs={refs} withRequired onChange={onChange} />
        </div>
      ) : null}
    </div>
  )
}

/** Escolhe os dados cadastrados no fluxo, ou cadastra um novo pelo nome. */
function FieldRefsPicker({
  refs,
  withRequired,
  onChange,
}: {
  refs: FieldRef[]
  withRequired?: boolean
  onChange: (refs: FieldRef[]) => void
}) {
  const { t } = useTranslation()
  const api = useEditorApi()
  const fields = useEditor((state) => state.fields)
  const setDialog = useEditorUi((state) => state.setDialog)
  const visible = refs.filter((ref) => fields.some((field) => field.key === ref.name))
  const available = useMemo(
    () => fields.filter((field) => field.key && !refs.some((ref) => ref.name === field.key)).map((field) => field.label),
    [fields, refs]
  )

  const addField = (key: string) =>
    onChange([...refs, { name: key, ...(withRequired ? { required: true } : {}) }])

  return (
    <div className="flex flex-col gap-2">
      {visible.map((ref) => {
        const field = fields.find((item) => item.key === ref.name)
        return (
          <div key={ref.name} className="flex items-center gap-2 rounded-md border bg-card py-1 pr-1 pl-2.5">
            <span className="min-w-0 flex-1 truncate text-sm">{field?.label || ref.name}</span>
            {withRequired ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title={t("flows.fields.outputs.requiredHint")}>
                {t("flows.fields.outputs.required")}
                <Switch
                  size="sm"
                  checked={Boolean(ref.required)}
                  onCheckedChange={(required) =>
                    onChange(refs.map((item) => (item.name === ref.name ? { ...item, required } : item)))
                  }
                />
              </label>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("flows.fields.outputs.removeField", { name: field?.label })}
              onClick={() => onChange(refs.filter((item) => item.name !== ref.name))}
            >
              <X />
            </Button>
          </div>
        )
      })}
      <CreatableSelect
        options={available}
        value={null}
        placeholder={t("flows.fields.outputs.pickField")}
        onChange={(label) => {
          const field = fields.find((item) => item.label === label)
          if (field) addField(field.key)
        }}
        onCreate={async (label) => {
          const state = api.getState()
          const key = fieldKeyFromLabel(label, state.fields.map((field) => field.key))
          state.setFields([...state.fields, { key, label, type: "string", description: "" }])
          addField(key)
        }}
      />
      <button
        type="button"
        onClick={() => setDialog("fields")}
        className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {t("flows.fields.outputs.manage")}
      </button>
    </div>
  )
}

/* ---------- Conversa com IA ---------- */

export function AssistantForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const mode = (str(data.mode) || "interactive") as "interactive" | "processing"
  const interactive = mode === "interactive"
  const basePrompt = useEditor((state) => state.basePrompt)
  const inherits = str(data.model_size) !== "fast" && basePrompt.trim().length > 0

  return (
    <>
      <Section>
        <ChoiceCards
          label={t("flows.fields.ai_assistant.modeLabel")}
          value={mode}
          onChange={(value) => set({ mode: value }, { coalesce: "" })}
          options={[
            {
              value: "interactive",
              icon: <Bot />,
              title: t("flows.fields.ai_assistant.interactive"),
              description: t("flows.fields.ai_assistant.interactiveHint"),
            },
            {
              value: "processing",
              icon: <Signpost />,
              title: t("flows.fields.ai_assistant.processing"),
              description: t("flows.fields.ai_assistant.processingHint"),
            },
          ]}
        />
        <VarField
          name="system_prompt"
          rows={6}
          hint={inherits ? t("flows.fields.ai_assistant.inheritsHint") : undefined}
          placeholder={
            interactive
              ? t("flows.fields.ai_assistant.promptPlaceholder")
              : t("flows.fields.ai_assistant.decidePlaceholder")
          }
        />
      </Section>

      <OutputsEditor
        title={t("flows.fields.ai_assistant.outputsTitle")}
        description={
          interactive
            ? t("flows.fields.ai_assistant.outputsHint")
            : t("flows.fields.ai_assistant.outputsDecideHint")
        }
        nameLabel={t("flows.fields.ai_assistant.outputName")}
        whenLabel={t("flows.fields.ai_assistant.outputWhen")}
        whenPlaceholder={t("flows.fields.ai_assistant.outputWhenPlaceholder")}
        addLabel={t("flows.fields.ai_assistant.addOutput")}
        newLabel={t("flows.fields.ai_assistant.newOutput")}
        withParameters={interactive}
      >
        {interactive && Number(data.max_turns) > 0 ? (
          <FixedOutput
            label={t("flows.outputs.maxTurns")}
            description={t("flows.fields.ai_assistant.maxTurnsExit", { count: Number(data.max_turns) })}
          />
        ) : null}
        <FixedOutput
          tone="danger"
          label={t("flows.outputs.onError")}
          description={t("flows.fields.ai_assistant.errorExit")}
        />
      </OutputsEditor>

      {interactive ? <ToolsPicker /> : null}

      <Section title={t("flows.fields.ai_assistant.modelTitle")}>
        <ModelPicker />
      </Section>

      <Advanced defaultOpen={Boolean(Number(data.max_turns)) || Boolean(str(data.sender_name))}>
        {interactive ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <NumberBox name="min_turns" min={1} max={20} fallback={1} />
              <NumberBox name="max_turns" min={0} max={50} />
            </div>
            <VarField name="sender_name" optional />
          </>
        ) : null}
        <Toggle name="use_history" defaultValue />
      </Advanced>
    </>
  )
}

function ModelPicker() {
  const { t } = useTranslation()
  const { data } = useBlockForm()
  const setDialog = useEditorUi((state) => state.setDialog)
  const basePrompt = useEditor((state) => state.basePrompt).trim()
  const fast = str(data.model_size) === "fast"

  return (
    <>
      <Segmented
        name="model_size"
        fallback="main"
        options={[
          { value: "main", label: t("flows.fields.model_size.main") },
          { value: "fast", label: t("flows.fields.model_size.fast") },
        ]}
      />
      {fast ? (
        <Note>{t("flows.fields.model_size.fastHint")}</Note>
      ) : (
        <div className="rounded-lg border border-dashed p-2.5">
          <p className="text-sm font-medium">{t("flows.basePrompt.title")}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {basePrompt || t("flows.basePrompt.emptyHint")}
          </p>
          <Button type="button" variant="ghost" size="sm" className="-ml-2 mt-1" onClick={() => setDialog("basePrompt")}>
            {basePrompt ? t("flows.basePrompt.edit") : t("flows.basePrompt.add")}
          </Button>
        </div>
      )}
    </>
  )
}

function ToolsPicker() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const { tools, isLoading } = useToolOptions()
  const ids = useMemo(() => (Array.isArray(data.tool_ids) ? (data.tool_ids as string[]) : []), [data.tool_ids])
  const options = useMemo<SelectOption[]>(() => {
    const known = tools.map((tool) => ({ value: tool.id, label: tool.name, description: tool.description ?? undefined }))
    // Função que saiu da organização continua à vista, para poder ser tirada daqui.
    const gone = ids
      .filter((id) => !tools.some((tool) => tool.id === id))
      .map((id) => ({ value: id, label: t("flows.fields.tool_ids.gone") }))
    return isLoading ? known : [...known, ...gone]
  }, [ids, isLoading, t, tools])

  return (
    <Section title={t("flows.fields.tool_ids.title")} description={t("flows.fields.tool_ids.hint")}>
      {!isLoading && tools.length === 0 ? (
        <Note>{t("flows.fields.tool_ids.empty")}</Note>
      ) : (
        <Field id="ai-tools">
          <MultiSelectInput
            id="ai-tools"
            value={ids}
            options={options}
            placeholder={t("flows.fields.tool_ids.placeholder")}
            onChange={(next) => set({ tool_ids: next }, { coalesce: "" })}
          />
        </Field>
      )}
      <Link
        to="/tools"
        target="_blank"
        className="self-start rounded text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {t("flows.fields.tool_ids.manage")}
      </Link>
    </Section>
  )
}

/* ---------- Os outros blocos de IA ---------- */

export function IntentForm() {
  const { t } = useTranslation()
  return (
    <>
      <Section description={t("flows.fields.ai_intent_classification.note")}>
        <VarField name="system_prompt" rows={3} optional placeholder={t("flows.fields.ai_intent_classification.promptPlaceholder")} />
      </Section>
      <OutputsEditor
        title={t("flows.fields.ai_intent_classification.outputsTitle")}
        description={t("flows.fields.ai_intent_classification.outputsHint")}
        nameLabel={t("flows.fields.ai_intent_classification.outputName")}
        whenLabel={t("flows.fields.ai_intent_classification.outputWhen")}
        whenPlaceholder={t("flows.fields.ai_intent_classification.outputWhenPlaceholder")}
        addLabel={t("flows.fields.ai_intent_classification.addOutput")}
        newLabel={t("flows.fields.ai_intent_classification.newOutput")}
      >
        <FixedOutput label={t("flows.outputs.noneOfThem")} description={t("flows.fields.ai_intent_classification.noneHint")} />
        <FixedOutput tone="danger" label={t("flows.outputs.onError")} description={t("flows.fields.ai_shared.errorExit")} />
      </OutputsEditor>
    </>
  )
}

export function SentimentForm() {
  const { t } = useTranslation()
  return (
    <>
      <Section>
        <Note>{t("flows.fields.ai_sentiment.note")}</Note>
      </Section>
      <OutputsEditor
        title={t("flows.fields.ai_sentiment.outputsTitle")}
        description={t("flows.fields.ai_sentiment.outputsHint")}
        nameLabel={t("flows.fields.ai_sentiment.outputName")}
        addLabel={t("flows.fields.ai_sentiment.addOutput")}
        newLabel={t("flows.fields.ai_sentiment.newOutput")}
        minOutputs={2}
      >
        <FixedOutput tone="danger" label={t("flows.outputs.onError")} description={t("flows.fields.ai_shared.errorExit")} />
      </OutputsEditor>
    </>
  )
}

export function ExtractorForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const refs = Array.isArray(data.fields) ? (data.fields as FieldRef[]) : []
  return (
    <>
      <Section title={t("flows.fields.ai_parameter_extractor.fieldsTitle")} description={t("flows.fields.ai_parameter_extractor.fieldsHint")}>
        <FieldRefsPicker refs={refs} onChange={(fields) => set({ fields }, { coalesce: "" })} />
      </Section>
      <Section title={t("flows.fields.ai_assistant.modelTitle")}>
        <ModelPicker />
      </Section>
      <Advanced defaultOpen={Boolean(str(data.system_prompt))}>
        <VarField name="system_prompt" rows={3} optional placeholder={t("flows.fields.ai_parameter_extractor.promptPlaceholder")} />
      </Advanced>
    </>
  )
}

export function TranscriptionForm() {
  const { t } = useTranslation()
  const { data } = useBlockForm()
  return (
    <>
      <Section description={t("flows.fields.ai_audio_transcription.note")}>
        <TextInput
          name="save_to"
          mono
          variableName
          optional
          placeholder="last_transcription"
          hint={t("flows.fields.ai_audio_transcription.saveHint")}
        />
      </Section>
      <Advanced defaultOpen={Boolean(str(data.audio_url))}>
        <VarField name="audio_url" mono optional />
      </Advanced>
    </>
  )
}
