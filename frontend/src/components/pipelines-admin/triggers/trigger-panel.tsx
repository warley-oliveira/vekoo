import { useEffect, useMemo, useRef, type ReactNode } from "react"
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type Resolver,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import {
  DragHandle,
  FormActions,
  SidePanel,
  SortableArea,
  SwitchField,
  TextField,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useTriggerMutations } from "@/hooks/pipelines-admin/use-triggers"
import { useTriggerContext } from "@/hooks/pipelines-admin/use-trigger-context"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { useSortableEntry } from "@/hooks/use-sortable-entry"
import {
  ACTION_GROUPS,
  MAX_ACTIONS,
  conditionFieldsFor,
  eventsFor,
  OPERATORS_BY_KIND,
} from "@/lib/pipelines-admin/trigger-catalog"
import {
  buildTriggerSchema,
  draftToInput,
  newActionDraft,
  newTriggerDraft,
  triggerToDraft,
  type ActionDraft,
  type TriggerDraft,
} from "@/lib/pipelines-admin/trigger-form"
import { sentenceParts, suggestedName } from "@/lib/pipelines-admin/trigger-sentence"
import type { Trigger, TriggerActionType, TriggerEvent } from "@/lib/pipelines-admin/types"
import { cn } from "@/lib/utils"
import {
  AssignUserEditor,
  MoveCardEditor,
  NotifyEditor,
  ToggleAutomationEditor,
  WebhookEditor,
  WhatsappMessageEditor,
  WhatsappTemplateEditor,
} from "./action-editors"
import { ACTION_ICONS } from "./action-icons"
import { CodeActionEditor } from "./code-action-editor"
import { ConditionRow } from "./condition-row"
import { CreateCardEditor } from "./create-card-editor"
import { PhrasePicker, type PhraseOption } from "./phrase-picker"
import { TriggerSentence } from "./trigger-sentence"

const SUGGESTED_NAME_MAX = 80

type TriggerPanelProps = {
  /** Sem gatilho, o painel cria. */
  trigger: Trigger | null
  /** Um rascunho de partida, vindo de um exemplo. */
  seed?: TriggerDraft | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete?: (trigger: Trigger) => void
}

/**
 * Montar um gatilho é escrever uma frase. Quando, se e então, cada pedaço escolhível, e a frase pronta
 * logo acima, para conferir. O nome vem da frase: ninguém precisa pensar em como chamar o gatilho, e
 * quem quiser troca.
 */
export function TriggerPanel({ trigger, seed, open, onOpenChange, onDelete }: TriggerPanelProps) {
  const { t } = useTranslation()
  const { createTrigger, updateTrigger } = useTriggerMutations(useTriggerContext().board.id)
  const { lookups } = useTriggerContext()

  const schema = useMemo(() => buildTriggerSchema(t), [t])
  const form = useForm<TriggerDraft>({
    resolver: zodResolver(schema) as unknown as Resolver<TriggerDraft>,
    defaultValues: trigger ? triggerToDraft(trigger) : (seed ?? newTriggerDraft()),
    mode: "onSubmit",
  })

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const input = draftToInput(values)
    if (trigger) {
      await updateTrigger(trigger.id, input)
      toast.success(t("pipelinesAdmin.triggers.saved", { name: input.name }))
    } else {
      await createTrigger(input)
      toast.success(t("pipelinesAdmin.triggers.created", { name: input.name }))
    }
    form.reset(values)
    close()
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const eventType = useWatch({ control: form.control, name: "eventType" })
  const stageId = useWatch({ control: form.control, name: "stageId" })
  const conditions = useWatch({ control: form.control, name: "conditions" })
  const actions = useWatch({ control: form.control, name: "actions" })

  const parts = useMemo(
    () =>
      sentenceParts(
        { eventType, stageId, conditions: conditions ?? [], actions: (actions ?? []) as ActionDraft[] },
        lookups
      ),
    [actions, conditions, eventType, lookups, stageId]
  )

  const suggested = useMemo(
    () =>
      suggestedName(parts, (key, values) => t(key, values as Record<string, string>), lookups, SUGGESTED_NAME_MAX),
    [lookups, parts, t]
  )

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="xl"
      title={trigger?.name ?? t("pipelinesAdmin.triggers.editor.createTitle")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={
            trigger ? t("pipelinesAdmin.triggers.editor.submitEdit") : t("pipelinesAdmin.triggers.editor.submitCreate")
          }
          onCancel={close}
          requireChanges={Boolean(trigger)}
          secondary={
            trigger && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
                onClick={() => onDelete(trigger)}
              >
                <Trash2 />
                {t("pipelinesAdmin.triggers.delete.action")}
              </Button>
            ) : undefined
          }
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <FormProvider {...form}>
        <div className="flex flex-col gap-6">
          <div className="rounded-lg bg-muted/40 p-3" aria-live="polite">
            <TriggerSentence parts={parts} className="text-base text-foreground" />
          </div>

          <SentenceBlock title={t("pipelinesAdmin.triggers.editor.when")}>
            <WhenFields />
          </SentenceBlock>

          <SentenceBlock
            title={t("pipelinesAdmin.triggers.editor.if")}
            hint={t("pipelinesAdmin.triggers.editor.ifHint")}
          >
            <ConditionsFields />
          </SentenceBlock>

          <SentenceBlock
            title={t("pipelinesAdmin.triggers.editor.then")}
            hint={t("pipelinesAdmin.triggers.editor.thenHint")}
          >
            <ActionsFields />
          </SentenceBlock>

          <div className="flex flex-col gap-4 border-t pt-5">
            <NameField suggested={trigger ? null : suggested} />
            <SwitchField
              control={form.control}
              name="active"
              label={t("pipelinesAdmin.triggers.editor.active")}
              hint={t("pipelinesAdmin.triggers.editor.activeHint")}
            />
          </div>
        </div>
      </FormProvider>
    </SidePanel>
  )
}

/**
 * O nome acompanha a frase até a pessoa escrever o dela. Em gatilho que já existe, nunca muda sozinho.
 *
 * O valor padrão anda junto, porque o nome sugerido não é alteração de ninguém: sem isso, abrir e fechar
 * o painel sem mexer em nada perguntaria se a pessoa quer sair sem salvar. Mora junto do campo porque
 * `resetField` só age em campo registrado, e o conteúdo do painel monta depois do formulário.
 */
function NameField({ suggested }: { suggested: string | null }) {
  const { t } = useTranslation()
  const { control, resetField } = useFormContext<TriggerDraft>()
  const touched = useRef(false)

  useEffect(() => {
    if (suggested !== null && !touched.current) resetField("name", { defaultValue: suggested })
  }, [resetField, suggested])

  return (
    <TextField
      control={control}
      name="name"
      label={t("pipelinesAdmin.triggers.editor.name")}
      hint={suggested === null ? undefined : t("pipelinesAdmin.triggers.editor.nameHint")}
      autoComplete="off"
      maxLength={255}
      onInput={() => {
        touched.current = true
      }}
    />
  )
}

function SentenceBlock({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-heading text-sm font-medium">{title}</h3>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

/* ---------- quando ---------- */

function WhenFields() {
  const { t } = useTranslation()
  const { board, stageOptions } = useTriggerContext()
  const { control, setValue, getValues } = useFormContext<TriggerDraft>()
  const eventType = useWatch({ control, name: "eventType" })
  const stageId = useWatch({ control, name: "stageId" })

  const eventOptions = useMemo<PhraseOption[]>(
    () =>
      eventsFor(board.boardType).map((event) => ({
        value: event,
        label: t(`pipelinesAdmin.triggers.events.${event}.label`),
        description: t(`pipelinesAdmin.triggers.events.${event}.hint`),
      })),
    [board.boardType, t]
  )

  const stageChoices = useMemo<PhraseOption[]>(
    () => [
      { value: "", label: t("pipelinesAdmin.triggers.editor.anyStage") },
      ...stageOptions.map((stage) => ({ value: stage.value, label: stage.label })),
    ],
    [stageOptions, t]
  )

  /** Trocar o evento pode invalidar uma condição: "motivo da perda" não existe em "card criado". */
  function changeEvent(next: string) {
    const event = next as TriggerEvent
    const allowed = new Set(conditionFieldsFor(event).map((field) => field.key))
    const kept = getValues("conditions").filter((condition) => allowed.has(condition.key))
    setValue("eventType", event, { shouldDirty: true })
    setValue("conditions", kept, { shouldDirty: true })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
      <PhrasePicker
        label={t("pipelinesAdmin.triggers.editor.event")}
        value={eventType}
        options={eventOptions}
        searchFrom={99}
        onChange={changeEvent}
      />
      <span>{t(`pipelinesAdmin.triggers.events.${eventType}.preposition`)}</span>
      <PhrasePicker
        label={t("pipelinesAdmin.triggers.editor.stage")}
        value={stageId ?? ""}
        options={stageChoices}
        onChange={(value) => setValue("stageId", value || null, { shouldDirty: true })}
      />
    </div>
  )
}

/* ---------- se ---------- */

function ConditionsFields() {
  const { t } = useTranslation()
  const { lookups } = useTriggerContext()
  const { control } = useFormContext<TriggerDraft>()
  const eventType = useWatch({ control, name: "eventType" })
  const { fields, append, remove } = useFieldArray({ control, name: "conditions", keyName: "fieldKey" })

  const current = useWatch({ control, name: "conditions" })

  const available = useMemo<PhraseOption[]>(() => {
    const used = new Set((current ?? []).map((condition) => condition.key))
    return conditionFieldsFor(eventType)
      .filter((field) => !used.has(field.key))
      .map((field) => ({ value: field.key, label: lookups.conditionField(field.key) }))
  }, [current, eventType, lookups])

  function add(key: string) {
    const field = conditionFieldsFor(eventType).find((item) => item.key === key)
    if (!field) return
    append({ key, operator: OPERATORS_BY_KIND[field.kind][0], value: "" })
  }

  return (
    <div className="flex flex-col gap-2">
      {fields.map((field, index) => (
        <ConditionRow key={field.fieldKey} index={index} onRemove={() => remove(index)} />
      ))}
      {available.length > 0 ? (
        <PhrasePicker
          label={t("pipelinesAdmin.triggers.editor.addCondition")}
          value={null}
          options={available}
          display={
            <span className="inline-flex items-center gap-1">
              <Plus aria-hidden className="size-3.5" />
              {fields.length > 0
                ? t("pipelinesAdmin.triggers.editor.addAnotherCondition")
                : t("pipelinesAdmin.triggers.editor.addCondition")}
            </span>
          }
          className="self-start border-transparent font-normal text-muted-foreground"
          onChange={add}
        />
      ) : null}
    </div>
  )
}

/* ---------- então ---------- */

function ActionsFields() {
  const { t } = useTranslation()
  const { canUseCode } = useTriggerContext()
  const { control, formState } = useFormContext<TriggerDraft>()
  const { fields, append, remove, move } = useFieldArray({ control, name: "actions", keyName: "fieldKey" })

  const options = useActionOptions(canUseCode)
  const items = useMemo(() => fields.map((field) => ({ ...field, id: field.fieldKey })), [fields])

  const arrayError = formState.errors.actions?.root?.message ?? formState.errors.actions?.message

  return (
    <div className="flex flex-col gap-3">
      <SortableArea
        items={items}
        nameOf={(item) => t(`pipelinesAdmin.triggers.actions.${item.type}.label`)}
        onReorder={(ordered) => {
          const first = items.findIndex((item, position) => item.id !== ordered[position].id)
          if (first < 0) return
          const from = items.findIndex((item) => item.id === ordered[first].id)
          // Quem chegou em `first` veio de longe: subiu. Senão, quem estava lá é que desceu.
          if (from > first + 1) move(from, first)
          else move(first, ordered.findIndex((item) => item.id === items[first].id))
        }}
      >
        <ol className="flex flex-col gap-3">
          {items.map((item, index) => (
            <ActionCard
              key={item.id}
              id={item.id}
              index={index}
              type={item.type}
              canRemove={items.length > 1}
              onRemove={() => remove(index)}
            />
          ))}
        </ol>
      </SortableArea>

      {arrayError ? (
        <p role="alert" className="text-xs text-destructive">
          {String(arrayError)}
        </p>
      ) : null}

      {fields.length < MAX_ACTIONS ? (
        <PhrasePicker
          label={t("pipelinesAdmin.triggers.editor.addAction")}
          value={null}
          options={options}
          searchFrom={99}
          display={
            <span className="inline-flex items-center gap-1">
              <Plus aria-hidden className="size-3.5" />
              {t("pipelinesAdmin.triggers.editor.addAction")}
            </span>
          }
          className="self-start"
          onChange={(type) =>
            append(newActionDraft(type as TriggerActionType, t("pipelinesAdmin.code.starter")))
          }
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("pipelinesAdmin.triggers.editor.maxActions", { count: MAX_ACTIONS })}
        </p>
      )}
    </div>
  )
}

function useActionOptions(canUseCode: boolean) {
  const { t } = useTranslation()
  return useMemo<PhraseOption[]>(
    () =>
      ACTION_GROUPS.flatMap((group) =>
        group.types
          .filter((type) => type !== "run_code" || canUseCode)
          .map((type) => {
            const Icon = ACTION_ICONS[type]
            return {
              value: type,
              label: t(`pipelinesAdmin.triggers.actions.${type}.label`),
              description: t(`pipelinesAdmin.triggers.actions.${type}.hint`),
              icon: <Icon />,
              group: t(`pipelinesAdmin.triggers.actionGroups.${group.id}`),
            }
          })
      ),
    [canUseCode, t]
  )
}

function ActionCard({
  id,
  index,
  type,
  canRemove,
  onRemove,
}: {
  id: string
  index: number
  type: TriggerActionType
  canRemove: boolean
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, style, handleProps, isDragging } = useSortableEntry(id)
  const { canUseCode } = useTriggerContext()
  const { setValue, control } = useFormContext<TriggerDraft>()

  const options = useActionOptions(canUseCode)
  const currentType = (useWatch({ control, name: `actions.${index}.type` }) ?? type) as TriggerActionType

  // Código sem permissão não some da lista: a pessoa vê que existe, e o servidor recusaria mudá-lo.
  const typeOptions =
    currentType === "run_code" && !canUseCode
      ? [
          ...options,
          { value: "run_code", label: t("pipelinesAdmin.triggers.actions.run_code.label"), disabled: true },
        ]
      : options

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col gap-3 rounded-lg bg-card p-3 ring-1 ring-foreground/10",
        isDragging && "shadow-md"
      )}
    >
      <div className="flex items-center gap-1">
        <DragHandle
          {...handleProps}
          label={t("pipelinesAdmin.triggers.editor.dragAction")}
          className="-ml-1.5"
        />
        <PhrasePicker
          label={t("pipelinesAdmin.triggers.editor.actionType")}
          value={currentType}
          options={typeOptions}
          searchFrom={99}
          onChange={(next) =>
            setValue(
              `actions.${index}`,
              newActionDraft(next as TriggerActionType, t("pipelinesAdmin.code.starter")),
              { shouldDirty: true }
            )
          }
        />
        <div className="flex-1" />
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("pipelinesAdmin.triggers.editor.removeAction")}
            className="text-muted-foreground pointer-coarse:size-10"
            onClick={onRemove}
          >
            <X />
          </Button>
        ) : null}
      </div>

      <ActionFields index={index} type={currentType} />
    </li>
  )
}

function ActionFields({ index, type }: { index: number; type: TriggerActionType }) {
  switch (type) {
    case "notify":
      return <NotifyEditor index={index} />
    case "move_card":
      return <MoveCardEditor index={index} />
    case "assign_user":
      return <AssignUserEditor index={index} />
    case "send_whatsapp_message":
      return <WhatsappMessageEditor index={index} />
    case "send_whatsapp_template":
      return <WhatsappTemplateEditor index={index} />
    case "toggle_automation":
      return <ToggleAutomationEditor index={index} />
    case "fire_webhook":
      return <WebhookEditor index={index} />
    case "create_card":
      return <CreateCardEditor index={index} />
    case "run_code":
      return <CodeActionEditor index={index} />
    default:
      return null
  }
}
