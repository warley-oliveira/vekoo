import { memo, useCallback, useMemo, type ComponentType } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { Copy, Plus, Trash2, X } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { Callout, SearchableSelect, type SelectOption } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { blockEntry, blockFamily, blockIcon, isTrigger } from "@/lib/flows/catalog"
import { blockOutputs, DEFAULT_OUTPUT, normalizeHandle, outputLabel, type BlockOutput } from "@/lib/flows/outputs"
import { missingKey } from "@/lib/flows/summary"
import type { BlockData } from "@/lib/flows/types"
import { useMotionPreset } from "@/lib/motion"

import { useEditor, useEditorApi } from "../store"
import { useEditorUi } from "../ui-store"
import {
  AssignAgentForm,
  AssignTeamForm,
  AskQuestionForm,
  AttributeForm,
  CatalogSearchForm,
  ConditionForm,
  ExecuteToolForm,
  FunnelStageForm,
  GotoFlowForm,
  HttpRequestForm,
  InteractiveForm,
  LoopForm,
  NoteOnlyForm,
  PauseForm,
  SendMediaForm,
  SendTemplateForm,
  SendTextForm,
  SetVariableForm,
  SwitchForm,
  TagForm,
  TransferForm,
  WaitForMessageForm,
  WaitForm,
} from "./forms-basic"
import { AssistantForm, ExtractorForm, IntentForm, SentimentForm, TranscriptionForm } from "./forms-ai"
import {
  AddLabelForm,
  ChecklistForm,
  CommentForm,
  CreateCardForm,
  CreateDealForm,
  MarkLostForm,
  MoveCardForm,
  RemoveLabelForm,
  SetCustomFieldForm,
  SimpleCardForm,
  UpdateCardForm,
  UpdateDealForm,
} from "./forms-pipeline"
import { BlockFormProvider, str, type BlockSet } from "./form-context"
import { Section } from "./parts"
import { BlockReadOnly } from "./read-only"
import { TriggerForm } from "./trigger-form"

// O inspetor: um painel à direita com o essencial à vista e o avançado recolhido. Assina só o `data` do
// bloco aberto, então arrastar qualquer bloco no quadro não passa por aqui.

const FORMS: Record<string, ComponentType> = {
  send_text: SendTextForm,
  ask_question: AskQuestionForm,
  send_interactive: InteractiveForm,
  send_media: SendMediaForm,
  send_template: SendTemplateForm,
  ai_assistant: AssistantForm,
  ai_intent_classification: IntentForm,
  ai_sentiment: SentimentForm,
  ai_parameter_extractor: ExtractorForm,
  ai_audio_transcription: TranscriptionForm,
  condition: ConditionForm,
  switch: SwitchForm,
  wait: WaitForm,
  wait_for_message: WaitForMessageForm,
  set_variable: SetVariableForm,
  loop: LoopForm,
  add_tag: TagForm,
  remove_tag: TagForm,
  set_custom_attribute: AttributeForm,
  assign_agent: AssignAgentForm,
  assign_team: AssignTeamForm,
  transfer_to_human: TransferForm,
  finalize_chat: NoteOnlyForm,
  pause_automation: PauseForm,
  resume_automation: NoteOnlyForm,
  set_funnel_stage: FunnelStageForm,
  pipeline_create_card: CreateCardForm,
  pipeline_move_card: MoveCardForm,
  pipeline_update_card: UpdateCardForm,
  pipeline_set_custom_field: SetCustomFieldForm,
  pipeline_mark_won: SimpleCardForm,
  pipeline_mark_lost: MarkLostForm,
  pipeline_reopen_deal: SimpleCardForm,
  pipeline_add_label: AddLabelForm,
  pipeline_remove_label: RemoveLabelForm,
  pipeline_add_comment: CommentForm,
  pipeline_add_checklist: ChecklistForm,
  pipeline_archive_card: SimpleCardForm,
  pipeline_create_deal: CreateDealForm,
  pipeline_update_deal: UpdateDealForm,
  http_request: HttpRequestForm,
  execute_tool: ExecuteToolForm,
  goto_flow: GotoFlowForm,
  catalog_search: CatalogSearchForm,
  end: NoteOnlyForm,
}

export function Inspector() {
  const preset = useMotionPreset()
  const selectedId = useEditor((state) => state.selectedId)
  const selectionCount = useEditor((state) => state.selectionCount)
  const testOpen = useEditorUi((state) => state.testOpen)
  const readOnly = useEditor((state) => state.readOnly)
  const visible = !testOpen && (Boolean(selectedId) || selectionCount > 1)

  if (readOnly) return <BlockReadOnly />

  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          key="inspector"
          {...preset.slideUp}
          initial={preset.reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
          animate={preset.reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={preset.reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
          className="absolute top-3 right-3 bottom-3 z-20 flex w-[min(24rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-popover shadow-lg"
        >
          {selectedId ? <BlockPanel key={selectedId} id={selectedId} /> : <SelectionPanel />}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}

const BlockPanel = memo(function BlockPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const api = useEditorApi()
  const type = useEditor((state) => state.nodes.find((node) => node.id === id)?.type ?? "")
  const data = useEditor((state) => state.nodes.find((node) => node.id === id)?.data)
  const set = useCallback<BlockSet>(
    (patch, options) => api.getState().updateData(id, patch, options),
    [api, id]
  )
  const form = useMemo(() => ({ id, type, data: data ?? {}, set }), [data, id, set, type])

  if (!data) return null

  const Icon = blockIcon(type)
  const family = blockFamily(type)
  const label = t(`flows.blocks.${type}.label`, { defaultValue: type })
  const trigger = isTrigger(type)
  const Form = trigger ? TriggerForm : FORMS[type]
  const missing = missingKey(type, data)

  return (
    <BlockFormProvider value={form}>
      <header className="flow-block flex shrink-0 items-start gap-2.5 border-b p-3" data-family={family}>
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--block-tint-soft) text-(--block-tint)">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          {trigger ? (
            <h2 className="py-0.5 font-heading text-base font-semibold tracking-tight">{label}</h2>
          ) : (
            <input
              aria-label={t("flows.inspector.nameLabel")}
              value={str(data.label)}
              placeholder={label}
              onChange={(event) => set({ label: event.target.value })}
              className="-ml-1 w-full rounded-md bg-transparent px-1 py-0.5 font-heading text-base font-semibold tracking-tight outline-none placeholder:text-foreground hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          )}
          <p className="px-0 text-xs text-pretty text-muted-foreground">{t(`flows.blocks.${type}.description`, { defaultValue: "" })}</p>
        </div>
        <div className="flex shrink-0 items-center">
          {!trigger ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("flows.block.duplicate")}
                title={t("flows.block.duplicate")}
                onClick={() => api.getState().duplicateBlocks([id])}
              >
                <Copy />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("flows.block.delete")}
                title={t("flows.block.delete")}
                onClick={() => api.getState().deleteBlocks([id])}
                className="hover:text-status-danger"
              >
                <Trash2 />
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("flows.inspector.close")}
            title={t("flows.inspector.close")}
            onClick={() => api.getState().selectBlock(null)}
          >
            <X />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 divide-y overflow-y-auto">
        {missing ? (
          <div className="px-4 pt-3 pb-0">
            <Callout tone="warning">{t(missing)}</Callout>
          </div>
        ) : null}
        {Form ? <Form /> : <UnknownBlock />}
        <Connections id={id} type={type} data={data} />
      </div>
    </BlockFormProvider>
  )
})

function UnknownBlock() {
  const { t } = useTranslation()
  return (
    <Section>
      <Callout tone="danger">{t("flows.block.unknown")}</Callout>
    </Section>
  )
}

function SelectionPanel() {
  const { t } = useTranslation()
  const api = useEditorApi()
  const count = useEditor((state) => state.selectionCount)
  const ids = () => api.getState().nodes.filter((node) => node.selected).map((node) => node.id)

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="font-heading text-base font-semibold tracking-tight">{t("flows.inspector.selection", { count })}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => api.getState().duplicateBlocks(ids())}>
          <Copy />
          {t("flows.block.duplicate")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => api.getState().deleteBlocks(ids())}>
          <Trash2 />
          {t("flows.block.delete")}
        </Button>
      </div>
    </div>
  )
}

/* ---------- Para onde vai ---------- */

/**
 * Cada saída e o bloco seguinte, em forma de formulário: é o caminho de quem não usa mouse para ligar os
 * blocos, e também de quem não descobriu que dá para puxar a linha.
 */
function Connections({ id, type, data }: { id: string; type: string; data: BlockData }) {
  const { t } = useTranslation()
  const outputs = useMemo(() => blockOutputs(type, data), [data, type])
  // Títulos só mudam quando alguém edita: não vale redesenhar a cada arrasto.
  const ids = useEditor(useShallow((state) => state.nodes.map((node) => node.id)))
  const entry = blockEntry(type)

  if (outputs.length === 0 || entry?.terminal) return null

  return (
    <Section title={t("flows.inspector.nextTitle")} description={t("flows.inspector.nextHint")}>
      {outputs.map((output) => (
        <OutputLink key={output.id} id={id} output={output} ids={ids} single={outputs.length === 1} />
      ))}
    </Section>
  )
}

function OutputLink({ id, output, ids, single }: { id: string; output: BlockOutput; ids: string[]; single: boolean }) {
  const { t } = useTranslation()
  const api = useEditorApi()
  const target = useEditor(
    (state) =>
      state.edges.find((edge) => edge.source === id && normalizeHandle(edge.sourceHandle) === output.id)?.target ?? null
  )

  const options = useMemo<SelectOption[]>(() => {
    const { nodes } = api.getState()
    return nodes
      .filter((node) => node.id !== id && !isTrigger(node.type))
      .map((node) => {
        const custom = str(node.data.label).trim()
        const label = t(`flows.blocks.${node.type}.label`, { defaultValue: node.type ?? "" })
        return { value: node.id, label: custom || label, description: custom ? label : undefined }
      })
    // `ids`: refaz quando entra ou sai um bloco.
  }, [api, id, ids, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const name = output.id === DEFAULT_OUTPUT && single ? t("flows.inspector.nextBlock") : outputLabel(output, t) || t("flows.block.noName")

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <p className="mb-1 truncate text-xs font-medium text-foreground/80">{name}</p>
        <SearchableSelect
          aria-label={t("flows.inspector.linkTo", { name })}
          value={target}
          options={options}
          clearable
          placeholder={t("flows.inspector.linkPlaceholder")}
          selectedOption={options.find((option) => option.value === target) ?? null}
          onChange={(next) => api.getState().linkOutput(id, output.id, next)}
        />
      </div>
      {!target ? (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="mt-5"
          aria-label={t("flows.block.addAfterOutput", { name })}
          title={t("flows.block.addAfterOutput", { name })}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            api.getState().openPicker({
              source: { nodeId: id, handle: output.id },
              screen: { x: rect.left - 372, y: rect.top - 80 },
            })
          }}
        >
          <Plus />
        </Button>
      ) : null}
    </div>
  )
}
