import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useShallow } from "zustand/react/shallow"

import { SelectInput, type SelectOption } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { usePipelineFields, usePipelineLabels, usePipelineOptions } from "@/hooks/flows/use-flow-references"
import { usePeople } from "@/hooks/people/use-people"
import type { PipelineBoardOption } from "@/lib/flows/types"

import { useEditor, useEditorApi, type BlockNode, type LinkEdge } from "../store"
import {
  AddButton,
  Advanced,
  ComboBox,
  Field,
  NumberBox,
  Note,
  RepeaterItem,
  Section,
  Segmented,
  SelectBox,
  str,
  TextInput,
  Toggle,
  useBlockForm,
  VarField,
} from "./parts"

// Os blocos de Pipelines. Quadro, etapa, campo e etiqueta vêm das APIs reais. Os que agem sobre um card
// dizem de onde ele vem: de um "Criar card" antes deles, ou o mais recente da conversa num quadro.

export type CardSource = { type: "node"; node_id: string } | { type: "chat"; board_id: string; board_name?: string }

const CREATE_CARD = "pipeline_create_card"

/** Os "Criar card" dos quais este bloco descende. Só eles certamente já criaram o card. */
function upstreamCreators(nodes: BlockNode[], edges: LinkEdge[], id: string): BlockNode[] {
  const incoming = new Map<string, string[]>()
  edges.forEach((edge) => incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set<string>([id])
  const queue = [...(incoming.get(id) ?? [])]
  const found: BlockNode[] = []
  while (queue.length) {
    const current = queue.shift() as string
    if (seen.has(current)) continue
    seen.add(current)
    const node = byId.get(current)
    if (node?.type === CREATE_CARD) found.push(node)
    queue.push(...(incoming.get(current) ?? []))
  }
  return found
}

function creatorLabel(node: BlockNode | undefined, fallback: string): string {
  if (!node) return fallback
  const custom = str(node.data.label).trim()
  return [custom || fallback, str(node.data.board_name)].filter(Boolean).join(" · ")
}

function boardOptions(boards: PipelineBoardOption[]): SelectOption[] {
  return boards.filter((board) => !board.archived).map((board) => ({ value: board.id, label: board.name }))
}

/** O quadro de onde sai o card: define etapas, campos e etiquetas que fazem sentido. */
function useCardBoardId(source: CardSource | null): string | null {
  const creatorBoard = useEditor((state) =>
    source?.type === "node" ? str(state.nodes.find((node) => node.id === source.node_id)?.data.board_id) : ""
  )
  if (!source) return null
  return source.type === "chat" ? source.board_id || null : creatorBoard || null
}

function useCardSource(): CardSource | null {
  const { data } = useBlockForm()
  return (data.card_source as CardSource | null | undefined) ?? null
}

function CardSourceSection() {
  const { t } = useTranslation()
  const { id, set } = useBlockForm()
  const api = useEditorApi()
  const source = useCardSource()
  const { boards } = usePipelineOptions()

  // A lista de quem vem antes só muda quando o desenho muda. Lê ao abrir, e não a cada quadro do arrasto.
  const linkKey = useEditor(useShallow((state) => state.edges.map((edge) => `${edge.source}>${edge.target}`)))
  const creators = useMemo(() => {
    const { nodes, edges } = api.getState()
    return upstreamCreators(nodes, edges, id)
    // `linkKey`: recalcula quando as conexões mudam.
  }, [api, id, linkKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const fallbackName = t("flows.blocks.pipeline_create_card.label")
  const value = !source ? null : source.type === "chat" ? "chat" : `node:${source.node_id}`
  const options = useMemo<SelectOption[]>(
    () => [
      ...creators.map((creator) => ({
        value: `node:${creator.id}`,
        label: creatorLabel(creator, fallbackName),
        description: creator.data.stage_name
          ? t("flows.fields.card_source.entersIn", { stage: str(creator.data.stage_name) })
          : undefined,
      })),
      { value: "chat", label: t("flows.fields.card_source.latest"), description: t("flows.fields.card_source.latestHint") },
    ],
    [creators, fallbackName, t]
  )

  const choose = (raw: string | null) => {
    if (!raw) {
      set({ card_source: null }, { coalesce: "" })
    } else if (raw === "chat") {
      const first = boards.find((board) => !board.archived)
      set({ card_source: { type: "chat", board_id: first?.id ?? "", board_name: first?.name ?? "" } }, { coalesce: "" })
    } else {
      set({ card_source: { type: "node", node_id: raw.replace(/^node:/, "") } }, { coalesce: "" })
    }
  }

  const missingCreator =
    source?.type === "node" && !api.getState().nodes.some((node) => node.id === source.node_id)
  const notUpstream =
    source?.type === "node" && !missingCreator && !creators.some((creator) => creator.id === source.node_id)

  return (
    <Section title={t("flows.fields.card_source.title")} description={t("flows.fields.card_source.hint")}>
      <Field id="card-source">
        <SelectInput id="card-source" value={value} options={options} onChange={choose} placeholder={t("flows.fields.card_source.placeholder")} />
      </Field>

      {source?.type === "chat" ? (
        <Field id="card-source-board" label={t("flows.fields.board_id.label")}>
          <SelectInput
            id="card-source-board"
            value={source.board_id || null}
            options={boardOptions(boards)}
            onChange={(next) => {
              const board = boards.find((item) => item.id === next)
              set({ card_source: { type: "chat", board_id: next ?? "", board_name: board?.name ?? "" } }, { coalesce: "" })
            }}
          />
        </Field>
      ) : null}

      {!source && creators.length === 1 ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => choose(`node:${creators[0].id}`)}>
          {t("flows.fields.card_source.useCreator", { name: creatorLabel(creators[0], fallbackName) })}
        </Button>
      ) : null}
      {!source && creators.length === 0 ? <Note>{t("flows.fields.card_source.noCreator")}</Note> : null}
      {missingCreator ? <Note>{t("flows.fields.card_source.creatorGone")}</Note> : null}
      {notUpstream ? <Note>{t("flows.fields.card_source.notUpstream")}</Note> : null}
    </Section>
  )
}

function CardAction({ children, errorOutput = true }: { children?: React.ReactNode; errorOutput?: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      <CardSourceSection />
      {children}
      {errorOutput ? (
        <Section>
          <Note>{t("flows.fields.card_source.errorNote")}</Note>
        </Section>
      ) : null}
    </>
  )
}

const PRIORITIES = ["low", "medium", "high", "urgent"]

function usePriorities() {
  const { t } = useTranslation()
  return useMemo(
    () => PRIORITIES.map((value) => ({ value, label: t(`flows.fields.priority.${value}`) })),
    [t]
  )
}

function StageSelect({ boardId, name = "stage_id" }: { boardId: string | null; name?: string }) {
  const { t } = useTranslation()
  const { set } = useBlockForm()
  const { boards, isLoading } = usePipelineOptions()
  const board = boards.find((item) => item.id === boardId)
  const options = useMemo<SelectOption[]>(
    () => (board?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name })),
    [board]
  )
  return (
    <SelectBox
      name={name}
      options={options}
      placeholder={isLoading ? t("flows.inspector.loading") : board ? undefined : t("flows.fields.stage_id.pickBoard")}
      onPick={(value, option) => set({ [name]: value ?? "", stage_name: option?.label ?? "" }, { coalesce: "" })}
    />
  )
}

/** Qualquer etapa de qualquer quadro: é o que os dois blocos de negócio aceitam. */
function AnyStageSelect({ optional }: { optional?: boolean }) {
  const { t } = useTranslation()
  const { set } = useBlockForm()
  const { boards, isLoading } = usePipelineOptions()
  const options = useMemo<SelectOption[]>(
    () =>
      boards
        .filter((board) => !board.archived)
        .flatMap((board) =>
          board.stages.map((stage) => ({ value: stage.id, label: stage.name, description: board.name }))
        ),
    [boards]
  )
  return (
    <ComboBox
      name="stage_id"
      optional={optional}
      options={options}
      loading={isLoading}
      placeholder={t("flows.fields.stage_id.pick")}
      onPick={(value, option) => set({ stage_id: value ?? "", stage_name: option?.label ?? "" }, { coalesce: "" })}
    />
  )
}

export function CreateCardForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const { boards, isLoading } = usePipelineOptions()
  const priorities = usePriorities()
  const options = useMemo(() => boardOptions(boards), [boards])
  const boardId = str(data.board_id) || null

  return (
    <>
      <Section title={t("flows.fields.pipeline_create_card.where")}>
        <SelectBox
          name="board_id"
          options={options}
          placeholder={isLoading ? t("flows.inspector.loading") : undefined}
          hint={!isLoading && options.length === 0 ? t("flows.fields.board_id.empty") : undefined}
          onPick={(value, option) => {
            const board = boards.find((item) => item.id === value)
            const first = board?.stages[0]
            set(
              { board_id: value ?? "", board_name: option?.label ?? "", stage_id: first?.id ?? "", stage_name: first?.name ?? "" },
              { coalesce: "" }
            )
          }}
        />
        <StageSelect boardId={boardId} />
      </Section>
      <Section title={t("flows.fields.pipeline_create_card.card")}>
        <VarField name="title" optional />
        <VarField name="description" rows={2} optional />
        <div className="grid grid-cols-2 gap-2.5">
          <SelectBox name="priority" options={priorities} clearLabel={t("flows.fields.priority.default")} placeholder={t("flows.fields.priority.default")} />
          <VarField name="deal_value" optional />
        </div>
      </Section>
      <Advanced>
        <Toggle name="link_chat" defaultValue />
        <Toggle name="reuse_existing" defaultValue />
        <Note>{t("flows.fields.pipeline_create_card.note")}</Note>
      </Advanced>
    </>
  )
}

export function MoveCardForm() {
  const { t } = useTranslation()
  const boardId = useCardBoardId(useCardSource())
  return (
    <CardAction>
      <Section title={t("flows.fields.pipeline_move_card.destination")} description={t("flows.fields.pipeline_move_card.hint")}>
        <StageSelect boardId={boardId} />
        <Segmented
          name="position"
          fallback="top"
          options={[
            { value: "top", label: t("flows.fields.position.top") },
            { value: "bottom", label: t("flows.fields.position.bottom") },
          ]}
        />
      </Section>
    </CardAction>
  )
}

export function UpdateCardForm() {
  const { t } = useTranslation()
  const priorities = usePriorities()
  return (
    <CardAction>
      <Section title={t("flows.fields.pipeline_update_card.fields")} description={t("flows.fields.pipeline_update_card.hint")}>
        <VarField name="title" optional />
        <VarField name="description" rows={2} optional />
        <div className="grid grid-cols-2 gap-2.5">
          <SelectBox name="priority" options={priorities} clearLabel={t("flows.fields.priority.keep")} placeholder={t("flows.fields.priority.keep")} />
          <VarField name="deal_value" optional />
        </div>
      </Section>
      <Advanced>
        <VarField name="deal_probability" optional />
        <VarField name="company_name" optional />
        <VarField name="contact_email" optional />
        <VarField name="contact_phone" optional />
        <VarField name="due_date" optional />
        <VarField name="expected_close_date" optional />
      </Advanced>
    </CardAction>
  )
}

export function SetCustomFieldForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const boardId = useCardBoardId(useCardSource())
  const { fields, isLoading } = usePipelineFields(boardId)
  const options = useMemo<SelectOption[]>(
    () => fields.map((field) => ({ value: field.key, label: field.name })),
    [fields]
  )
  const current = fields.find((field) => field.key === data.field_key)

  return (
    <CardAction>
      <Section title={t("flows.fields.pipeline_set_custom_field.title")}>
        <SelectBox
          name="field_key"
          options={options}
          placeholder={
            !boardId
              ? t("flows.fields.pipeline_set_custom_field.pickCard")
              : isLoading
                ? t("flows.inspector.loading")
                : undefined
          }
          hint={boardId && !isLoading && options.length === 0 ? t("flows.fields.pipeline_set_custom_field.empty") : undefined}
          onPick={(value, option) => set({ field_key: value ?? "", field_name: option?.label ?? "" }, { coalesce: "" })}
        />
        <VarField name="value" hint={current?.options?.length ? t("flows.fields.pipeline_set_custom_field.options", { options: current.options.join(", ") }) : undefined} />
      </Section>
    </CardAction>
  )
}

export function SimpleCardForm() {
  const { t } = useTranslation()
  const { type } = useBlockForm()
  return (
    <CardAction>
      <Section>
        <Note>{t(`flows.fields.${type}.note`)}</Note>
      </Section>
    </CardAction>
  )
}

export function MarkLostForm() {
  return (
    <CardAction>
      <Section>
        <VarField name="reason" rows={2} optional />
      </Section>
    </CardAction>
  )
}

export function AddLabelForm() {
  const { t } = useTranslation()
  const { labels } = usePipelineLabels()
  return (
    <CardAction>
      <Section description={t("flows.fields.pipeline_add_label.note")}>
        <VarField name="label" />
        {labels.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("flows.fields.pipeline_add_label.existing", { names: labels.slice(0, 8).map((label) => label.name).join(", ") })}
          </p>
        ) : null}
      </Section>
    </CardAction>
  )
}

export function RemoveLabelForm() {
  const { set } = useBlockForm()
  const { labels, isLoading } = usePipelineLabels()
  const options = useMemo<SelectOption[]>(() => labels.map((label) => ({ value: label.id, label: label.name })), [labels])
  return (
    <CardAction>
      <Section>
        <ComboBox
          name="label_id"
          options={options}
          loading={isLoading}
          onPick={(value, option) => set({ label_id: value ?? "", label_name: option?.label ?? "" }, { coalesce: "" })}
        />
      </Section>
    </CardAction>
  )
}

export function CommentForm() {
  return (
    <CardAction>
      <Section>
        <VarField name="body" rows={3} />
      </Section>
    </CardAction>
  )
}

export function ChecklistForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const items = Array.isArray(data.items) ? (data.items as string[]) : []
  return (
    <CardAction>
      <Section description={t("flows.fields.pipeline_add_checklist.note")}>
        <TextInput name="name" />
        {items.map((item, index) => (
          <RepeaterItem
            key={index}
            removeLabel={t("flows.fields.pipeline_add_checklist.removeItem")}
            onRemove={() => set({ items: items.filter((_, position) => position !== index) }, { coalesce: "" })}
          >
            <Input
              aria-label={t("flows.fields.pipeline_add_checklist.item", { number: index + 1 })}
              placeholder={t("flows.fields.pipeline_add_checklist.item", { number: index + 1 })}
              value={item}
              onChange={(event) =>
                set({ items: items.map((other, position) => (position === index ? event.target.value : other)) })
              }
            />
          </RepeaterItem>
        ))}
        <AddButton
          label={t("flows.fields.pipeline_add_checklist.addItem")}
          onClick={() => set({ items: [...items, ""] }, { coalesce: "" })}
        />
      </Section>
    </CardAction>
  )
}

function useOwnerOptions() {
  const { people } = usePeople()
  return useMemo<SelectOption[]>(
    () =>
      (people ?? [])
        .filter((person) => !person.revokedAt)
        .map((person) => ({ value: person.id, label: person.name, description: person.email })),
    [people]
  )
}

export function CreateDealForm() {
  const { t } = useTranslation()
  const owners = useOwnerOptions()
  return (
    <>
      <Section description={t("flows.fields.pipeline_create_deal.note")}>
        <AnyStageSelect />
        <VarField name="title" optional />
        <VarField name="deal_value" optional />
      </Section>
      <Advanced>
        <VarField name="description" rows={2} optional />
        <NumberBox name="deal_probability" min={0} max={100} optional />
        <ComboBox name="assigned_to_id" options={owners} optional />
      </Advanced>
    </>
  )
}

export function UpdateDealForm() {
  const { t } = useTranslation()
  const owners = useOwnerOptions()
  return (
    <>
      <Section description={t("flows.fields.pipeline_update_deal.note")}>
        <AnyStageSelect optional />
        <VarField name="title" optional />
        <VarField name="deal_value" optional />
      </Section>
      <Advanced>
        <VarField name="card_id" mono optional />
        <VarField name="description" rows={2} optional />
        <NumberBox name="deal_probability" min={0} max={100} optional />
        <ComboBox name="assigned_to_id" options={owners} optional />
      </Advanced>
    </>
  )
}
