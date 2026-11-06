import { useEffect, useMemo, useRef, useState } from "react"
import { useController, useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  MessageTestDialog,
  type MessageTestTarget,
} from "@/components/calendar/settings/message-test-dialog"
import {
  FormActions,
  SidePanel,
  SwitchField,
  TextField,
  UnsavedChangesDialog,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { zoneDisplayName } from "@/lib/calendar/timezone"
import type {
  AgendaCalendar,
  AttendanceSequence,
  SequenceAnchor,
} from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { DelayField } from "./delay-field"
import {
  buildSequenceSchema,
  newStepValues,
  sequenceToValues,
  splitMinutes,
  toMinutes,
  valuesToSequence,
  type SequenceValues,
} from "./sequence-form"
import { SequenceStepEditor } from "./sequence-step-editor"
import { SequenceToolsDialog } from "./sequence-tools-dialog"

const ANCHORS: SequenceAnchor[] = ["attendance_mark", "after_event_end"]

type SequencePanelProps = {
  calendar: AgendaCalendar
  /** O que o formulário abre preenchido: a sequência, um modelo pronto ou o rascunho vazio. */
  draft: AttendanceSequence
  /** Como a sequência estava ao abrir. `null` para uma nova. */
  base: AttendanceSequence | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (next: AttendanceSequence, base: AttendanceSequence | null) => Promise<boolean>
  onDelete: (sequence: AttendanceSequence) => void
}

/** Criar e editar uma sequência. Nada vale até salvar. */
export function SequencePanel({
  calendar,
  draft,
  base,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: SequencePanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()

  // A foto de quando o painel abriu: é contra ela que se descobre se alguém mexeu aqui.
  const [snapshot] = useState(base)
  const trigger = draft.trigger

  const schema = useMemo(() => buildSequenceSchema(t), [t])
  const form = useForm<SequenceValues>({
    resolver: zodResolver(schema),
    defaultValues: sequenceToValues(draft),
    mode: "onBlur",
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "steps",
    // O padrão é `id`, que aqui é um campo de verdade: o id do passo, que os jobs procuram.
    keyName: "fieldKey",
  })

  const [testing, setTesting] = useState<MessageTestTarget | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)

  /* ---------- passos dobrados ---------- */

  // Guarda os dobrados, e não os abertos: um passo novo já nasce aberto.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(fields.slice(1).map((field) => field.fieldKey))
  )

  const setStepOpen = (key: string, stepOpen: boolean) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (stepOpen) next.delete(key)
      else next.add(key)
      return next
    })

  // Erro num passo dobrado ficaria invisível: abre o passo e leva o foco até o campo. Só a cada
  // tentativa de salvar, e não a cada erro, para não tirar o foco de quem está corrigindo.
  const submitCount = form.formState.submitCount
  const stepErrors = form.formState.errors.steps
  const handledSubmit = useRef(0)
  useEffect(() => {
    if (submitCount === handledSubmit.current) return
    handledSubmit.current = submitCount
    if (!stepErrors) return

    const failing = fields.flatMap((field, index) => (stepErrors[index] ? [{ field, index }] : []))
    if (failing.length === 0) return

    setCollapsed((current) => {
      const next = new Set(current)
      for (const { field } of failing) next.delete(field.fieldKey)
      return next
    })

    const { index } = failing[0]
    const firstField = Object.keys(stepErrors[index] ?? {})[0]
    if (firstField) {
      requestAnimationFrame(() =>
        form.setFocus(`steps.${index}.${firstField}` as Parameters<typeof form.setFocus>[0])
      )
    }
  }, [fields, form, stepErrors, submitCount])

  async function removeStep(index: number) {
    const step = form.getValues(`steps.${index}`)
    if (step.message.trim() || step.aiPrompt.trim()) {
      const confirmed = await confirm({
        title: t("calendar.sequences.step.removeTitle", { name: step.name }),
        description: t("calendar.sequences.step.removeDescription"),
        confirmLabel: t("calendar.sequences.step.removeConfirm"),
        destructive: true,
      })
      if (!confirmed) return
    }
    remove(index)
  }

  function testStep(index: number) {
    const step = form.getValues(`steps.${index}`)
    setTesting({
      kind: "step",
      label: t("calendar.sequences.step.testLabel", { number: index + 1, name: step.name }),
      message: step.message,
      aiPrompt: step.mode === "ai" ? step.aiPrompt : "",
    })
  }

  /* ---------- inscrição automática ---------- */

  const anchors = useController({ control: form.control, name: "autoEnrollAnchors" })
  const minutes = useController({ control: form.control, name: "autoEnrollMinutesAfterEnd" })
  const autoEnroll = form.watch("autoEnroll")
  const chosenAnchors = anchors.field.value
  const showsAnchors = autoEnroll && trigger === "no_show"
  const afterEnd = showsAnchors && chosenAnchors.includes("after_event_end")

  function toggleAnchor(anchor: SequenceAnchor, checked: boolean) {
    const next = checked
      ? [...chosenAnchors, anchor]
      : chosenAnchors.filter((item) => item !== anchor)
    // Nunca fica vazio: sem âncora, a API inscreve ao marcar.
    anchors.field.onChange(next.length > 0 ? next : ["attendance_mark"])
  }

  /* ---------- salvar ---------- */

  const close = () => onOpenChange(false)
  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const submit = useFormSubmit(form, async (values) => {
    const saved = await onSave(
      valuesToSequence(values, { id: snapshot?.id, trigger }),
      snapshot
    )
    if (!saved) return
    form.reset(values)
    toast.success(
      t(snapshot ? "calendar.sequences.panel.saved" : "calendar.sequences.panel.created", {
        name: values.name,
      })
    )
    close()
  })

  const zoneLabel = `${zoneDisplayName(calendar.timeZone, language)} (${calendar.timeZone})`
  const minutesParts = splitMinutes(minutes.field.value ?? 60)

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="xl"
      title={snapshot ? snapshot.name : t("calendar.sequences.panel.createTitle")}
      description={t(`calendar.sequences.panel.description.${trigger}`)}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t(snapshot ? "calendar.sequences.panel.submit" : "calendar.sequences.panel.create")}
          onCancel={close}
          requireChanges={Boolean(snapshot)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-6">
        <TextField
          control={form.control}
          name="name"
          label={t("calendar.sequences.panel.name")}
          maxLength={120}
          autoComplete="off"
          autoFocus={!snapshot}
        />

        <section className="space-y-3">
          <div className="space-y-0.5">
            <h3 className="font-heading text-sm leading-snug font-medium">
              {t("calendar.sequences.panel.steps")}
            </h3>
            <p className="text-xs leading-snug text-pretty text-muted-foreground">
              {t("calendar.sequences.panel.stepsHint")}
            </p>
          </div>
          <ol>
            {fields.map((field, index) => (
              <SequenceStepEditor
                key={field.fieldKey}
                form={form}
                index={index}
                canRemove={fields.length > 1}
                isLast={index === fields.length - 1}
                open={!collapsed.has(field.fieldKey)}
                onOpenChange={(stepOpen) => setStepOpen(field.fieldKey, stepOpen)}
                zoneLabel={zoneLabel}
                onRemove={() => void removeStep(index)}
                onTest={() => testStep(index)}
                onShowTools={() => setToolsOpen(true)}
              />
            ))}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-coarse:h-10"
            onClick={() => append(newStepValues(t), { shouldFocus: false })}
          >
            <Plus />
            {t("calendar.sequences.panel.addStep")}
          </Button>
        </section>

        <section className="space-y-3 border-t pt-4">
          <div className="space-y-0.5">
            <h3 className="font-heading text-sm leading-snug font-medium">
              {t("calendar.sequences.panel.enrollment")}
            </h3>
            <p className="text-xs leading-snug text-pretty text-muted-foreground">
              {t("calendar.sequences.panel.enrollmentHint")}
            </p>
          </div>
          <SwitchField
            control={form.control}
            name="autoEnroll"
            label={t("calendar.sequences.options.autoEnroll.label")}
            hint={t(`calendar.sequences.options.autoEnroll.hint.${trigger}`)}
          />
          {showsAnchors ? (
            <div className="space-y-3 rounded-lg bg-muted/50 p-3">
              <fieldset className="space-y-2">
                <legend className="text-sm leading-none font-medium">
                  {t("calendar.sequences.anchors.label")}
                </legend>
                {ANCHORS.map((anchor) => (
                  <label
                    key={anchor}
                    className="flex cursor-pointer items-start gap-2.5 pointer-coarse:min-h-10"
                  >
                    <Checkbox
                      checked={chosenAnchors.includes(anchor)}
                      className="mt-px"
                      onCheckedChange={(checked) => toggleAnchor(anchor, Boolean(checked))}
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-sm leading-snug">
                        {t(`calendar.sequences.anchors.${anchor}.label`)}
                      </span>
                      <span className="block text-xs leading-snug text-pretty text-muted-foreground">
                        {t(`calendar.sequences.anchors.${anchor}.hint`)}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {afterEnd ? (
                <DelayField
                  label={t("calendar.sequences.anchors.delay.label")}
                  hint={t("calendar.sequences.anchors.delay.hint")}
                  error={minutes.fieldState.error?.message}
                  amount={minutesParts.amount}
                  unit={minutesParts.unit}
                  onChange={(amount, unit) =>
                    minutes.field.onChange(amount === null ? null : toMinutes(amount, unit))
                  }
                />
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="space-y-3 border-t pt-4">
          <h3 className="font-heading text-sm leading-snug font-medium">
            {t("calendar.sequences.panel.rules")}
          </h3>
          <SwitchField
            control={form.control}
            name="enabled"
            label={t("calendar.sequences.options.enabled.label")}
            hint={t("calendar.sequences.options.enabled.hint")}
          />
          <SwitchField
            control={form.control}
            name="stopOnReply"
            label={t("calendar.sequences.options.stopOnReply.label")}
            hint={t("calendar.sequences.options.stopOnReply.hint")}
          />
          <SwitchField
            control={form.control}
            name="reactivateAutomation"
            label={t("calendar.sequences.options.reactivateAutomation.label")}
            hint={t("calendar.sequences.options.reactivateAutomation.hint")}
          />
          <SwitchField
            control={form.control}
            name="ignoreAutomationPaused"
            label={t("calendar.sequences.options.ignoreAutomationPaused.label")}
            hint={t("calendar.sequences.options.ignoreAutomationPaused.hint")}
          />
        </section>

        {snapshot ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(snapshot)}
            >
              <Trash2 />
              {t("calendar.sequences.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>

      <MessageTestDialog
        calendar={calendar}
        target={testing}
        open={Boolean(testing)}
        onOpenChange={(next) => {
          if (!next) setTesting(null)
        }}
      />
      <SequenceToolsDialog open={toolsOpen} onOpenChange={setToolsOpen} />
    </SidePanel>
  )
}
