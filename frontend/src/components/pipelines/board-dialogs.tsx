import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { Archive, ArrowRightLeft, Check, Flag, Loader2, UserRound } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  BulkActionsBar,
  ComboboxField,
  FormActions,
  ResponsiveDialog,
  SearchableSelect,
  SelectField,
  TextField,
  TextareaField,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useBoardMutations } from "@/hooks/pipelines/use-boards"
import { useBoardHandle } from "@/hooks/pipelines/board-handle"
import { useIsTouch } from "@/hooks/use-media-query"
import { useBoardUi } from "@/hooks/pipelines/use-board-ui"
import { useCardActions } from "@/hooks/pipelines/use-card-actions"
import { usePeopleOptions } from "@/hooks/pipelines/use-people-options"
import { findCard } from "@/lib/pipelines/board-state"
import { isBlankValue } from "@/lib/pipelines/card-meta"
import {
  CARD_PRIORITIES,
  type Board,
  type CardPriority,
  type CustomField,
  type Stage,
} from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"
import { CustomFieldControl } from "./card-panel/custom-field-control"

/* ---------- mover ---------- */

/** "Mover para…": a alternativa ao arrastar, em qualquer tela e para qualquer pessoa. */
export function MoveCardDialog({ stages }: { stages: Stage[] }) {
  const { t } = useTranslation()
  const handle = useBoardHandle()
  const actions = useCardActions()
  const request = useBoardUi((state) => state.moveRequest)
  const requestMove = useBoardUi((state) => state.requestMove)
  const clearSelected = useBoardUi((state) => state.clearSelected)
  const [busy, setBusy] = useState(false)

  const cardIds = request ?? []
  const single = cardIds.length === 1
  const board = request ? handle.getBoard() : undefined
  const singleCard = single && board ? findCard(board, cardIds[0]) : null
  const currentStageId = singleCard?.stage.id ?? null

  async function moveTo(stageId: string) {
    setBusy(true)
    if (single) {
      requestMove(null)
      setBusy(false)
      const moved = await actions.moveTo(cardIds[0], stageId)
      if (moved) {
        toast.success(
          t("pipelines.move.done", {
            stage: stages.find((stage) => stage.id === stageId)?.name ?? "",
          })
        )
      }
      return
    }

    const { moved, blocked } = await actions.bulkMove(cardIds, stageId)
    setBusy(false)
    requestMove(null)
    clearSelected()
    if (moved > 0) toast.success(t("pipelines.bulk.moved", { count: moved }))
    if (blocked.length > 0) {
      toast.warning(t("pipelines.bulk.moveBlocked", { count: blocked.length }), {
        description: blocked.join(", "),
        duration: 8_000,
      })
    }
  }

  return (
    <ResponsiveDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) requestMove(null)
      }}
      size="sm"
      title={
        single
          ? t("pipelines.move.title")
          : t("pipelines.move.titleMany", { count: cardIds.length })
      }
      description={singleCard?.card.title}
    >
      <ul className="flex flex-col gap-0.5">
        {stages.map((stage) => {
          const current = stage.id === currentStageId
          return (
            <li key={stage.id}>
              <button
                type="button"
                disabled={busy || current}
                aria-current={current || undefined}
                onClick={() => void moveTo(stage.id)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:hover:bg-transparent",
                  current && "text-muted-foreground"
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
                  style={stage.color ? { backgroundColor: stage.color } : undefined}
                />
                <span className="min-w-0 flex-1 truncate">{stage.name}</span>
                {current ? <Check className="size-4" aria-hidden /> : null}
              </button>
            </li>
          )
        })}
      </ul>
      {busy ? (
        <p className="flex items-center gap-2 pt-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("pipelines.bulk.moving")}
        </p>
      ) : null}
    </ResponsiveDialog>
  )
}

/* ---------- perdido ---------- */

export function LostReasonDialog() {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const actions = useCardActions()
  const cardId = useBoardUi((state) => state.lostRequest)
  const requestLost = useBoardUi((state) => state.requestLost)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (cardId) setReason("")
  }, [cardId])

  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    if (!cardId || busy) return
    setBusy(true)
    await actions.closeDeal(cardId, "lost", reason.trim() || undefined)
    setBusy(false)
    requestLost(null)
  }

  return (
    <ResponsiveDialog
      open={cardId !== null}
      onOpenChange={(open) => {
        if (!open) requestLost(null)
      }}
      size="sm"
      title={t("pipelines.deal.lostTitle")}
      description={t("pipelines.deal.lostHint")}
      onSubmit={(event) => void confirm(event)}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="pointer-coarse:h-10"
            onClick={() => requestLost(null)}
          >
            {t("pipelines.actions.cancel")}
          </Button>
          <Button type="submit" variant="destructive" className="pointer-coarse:h-10" aria-busy={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t("pipelines.deal.markLost")}
          </Button>
        </>
      }
    >
      <textarea
        autoFocus
        rows={3}
        value={reason}
        maxLength={500}
        aria-label={t("pipelines.deal.lostReason")}
        placeholder={t("pipelines.deal.lostReasonPlaceholder")}
        onChange={(event) => setReason(event.target.value)}
        onKeyDown={(event) => {
          // É uma frase, não um texto: Enter confirma. No toque, o teclado pula linha.
          if (event.key === "Enter" && !event.shiftKey && !isTouch) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }}
        className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </ResponsiveDialog>
  )
}

/* ---------- campos obrigatórios ao fechar ---------- */

/** O negócio foi recusado por falta de campo: pede o que falta aqui mesmo e fecha de novo. */
export function DealRequiredFieldsDialog({ customFields }: { customFields: CustomField[] }) {
  const { t } = useTranslation()
  const handle = useBoardHandle()
  const actions = useCardActions()
  const request = useBoardUi((state) => state.dealGuard)
  const setDealGuard = useBoardUi((state) => state.setDealGuard)

  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (request) {
      setDraft({})
      setShowErrors(false)
    }
  }, [request])

  const fields = useMemo(
    () => customFields.filter((field) => request?.fieldKeys.includes(field.key)),
    [customFields, request]
  )
  const unknown = useMemo(() => {
    const known = new Set(fields.map((field) => field.key))
    return (request?.fieldKeys ?? []).filter((key) => !known.has(key))
  }, [fields, request])

  const board = handle.getBoard()
  const card = request && board ? findCard(board, request.cardId)?.card : null
  const valueOf = (key: string) => (key in draft ? draft[key] : card?.customFieldValues?.[key])
  const stillBlank = fields.filter((field) => isBlankValue(valueOf(field.key)))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!request || busy) return
    if (stillBlank.length > 0) {
      setShowErrors(true)
      return
    }

    setBusy(true)
    try {
      // O PATCH substitui o mapa inteiro: o que o card já tinha vai junto.
      await actions.update(request.cardId, {
        customFieldValues: { ...card?.customFieldValues, ...draft },
      })
      setDealGuard(null)
      await actions.closeDeal(request.cardId, request.outcome, request.lostReason)
    } catch {
      // `update` já avisou. O diálogo fica aberto, com o que a pessoa escreveu.
    } finally {
      setBusy(false)
    }
  }

  const won = request?.outcome === "won"

  return (
    <ResponsiveDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) setDealGuard(null)
      }}
      title={t(won ? "pipelines.deal.requiredTitleWon" : "pipelines.deal.requiredTitleLost")}
      description={t("pipelines.deal.requiredHint")}
      onSubmit={(event) => void submit(event)}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="pointer-coarse:h-10"
            onClick={() => setDealGuard(null)}
          >
            {t("pipelines.actions.cancel")}
          </Button>
          <Button
            type="submit"
            variant={won ? "default" : "destructive"}
            disabled={unknown.length > 0}
            aria-busy={busy}
            className="pointer-coarse:h-10"
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t(won ? "pipelines.deal.requiredConfirmWon" : "pipelines.deal.requiredConfirmLost")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {showErrors && stillBlank.length > 0 ? (
          <p role="alert" className="text-sm text-destructive">
            {t("pipelines.deal.requiredStillBlank", {
              fields: stillBlank.map((field) => field.name).join(", "),
            })}
          </p>
        ) : null}
        {unknown.length > 0 ? (
          <p role="alert" className="text-sm text-destructive">
            {t("pipelines.deal.requiredUnknown", { fields: unknown.join(", ") })}
          </p>
        ) : null}
        {fields.map((field) => (
          <div key={field.id} className="flex flex-col gap-1.5">
            <label htmlFor={`deal-field-${field.id}`} className="text-sm font-medium">
              {field.name}
            </label>
            <CustomFieldControl
              id={`deal-field-${field.id}`}
              field={field}
              value={valueOf(field.key)}
              onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
            />
          </div>
        ))}
      </div>
    </ResponsiveDialog>
  )
}

/* ---------- ações em lote ---------- */

/** Selecionar no quadro abre esta barra. Mover, atribuir, prioridade e arquivar valem para todos. */
export function BoardBulkBar() {
  const { t } = useTranslation()
  const actions = useCardActions()
  const confirm = useConfirm()
  const count = useBoardUi((state) => state.selectedCount)
  const selected = useBoardUi((state) => state.selected)
  const clearSelected = useBoardUi((state) => state.clearSelected)
  const requestMove = useBoardUi((state) => state.requestMove)
  const requestBulk = useBoardUi((state) => state.requestBulk)

  const ids = useMemo(() => Object.keys(selected), [selected])

  // Esc sai da seleção. O que estiver por cima (diálogo, menu, arraste no teclado) fecha primeiro.
  useEffect(() => {
    if (count === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      const above = document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"]')
      // `data-closed`: o menu de onde veio a seleção ainda pode estar saindo, na animação.
      if (Array.from(above).some((node) => !node.hasAttribute("data-closed"))) return
      clearSelected()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [clearSelected, count])

  async function archive() {
    const confirmed = await confirm({
      title: t("pipelines.bulk.archiveTitle", { count: ids.length }),
      description: t("pipelines.bulk.archiveHint"),
      confirmLabel: t("pipelines.card.archive"),
      destructive: true,
    })
    if (!confirmed) return
    if (await actions.bulkUpdate(ids, { archived: true })) {
      toast.success(t("pipelines.bulk.archived", { count: ids.length }))
      clearSelected()
    }
  }

  return (
    <BulkActionsBar count={count} onClear={clearSelected}>
      <Button type="button" variant="ghost" size="sm" onClick={() => requestMove(ids)}>
        <ArrowRightLeft />
        {t("pipelines.move.action")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => requestBulk("assign")}>
        <UserRound />
        {t("pipelines.bulk.assign")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => requestBulk("priority")}>
        <Flag />
        {t("pipelines.bulk.priority")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => void archive()}>
        <Archive />
        {t("pipelines.card.archive")}
      </Button>
    </BulkActionsBar>
  )
}

/** Responsável e prioridade em lote. */
export function BulkFieldDialog() {
  const { t } = useTranslation()
  const actions = useCardActions()
  const request = useBoardUi((state) => state.bulkRequest)
  const requestBulk = useBoardUi((state) => state.requestBulk)
  const selected = useBoardUi((state) => state.selected)
  const clearSelected = useBoardUi((state) => state.clearSelected)
  const { assignable } = usePeopleOptions()

  const [value, setValue] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (request) setValue(null)
  }, [request])

  const ids = Object.keys(selected)
  const isAssign = request === "assign"

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const done = isAssign
      ? await actions.bulkUpdate(
          ids,
          { assignedToId: value },
          {
            assignedToId: value,
            assignedTo: assignable.find((person) => person.id === value) ?? null,
          }
        )
      : await actions.bulkUpdate(
          ids,
          { priority: value as CardPriority | null },
          { priority: value as CardPriority | null }
        )
    setBusy(false)
    if (!done) return
    toast.success(t("pipelines.bulk.updated", { count: ids.length }))
    requestBulk(null)
    clearSelected()
  }

  return (
    <ResponsiveDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) requestBulk(null)
      }}
      size="sm"
      title={
        isAssign
          ? t("pipelines.bulk.assignTitle", { count: ids.length })
          : t("pipelines.bulk.priorityTitle", { count: ids.length })
      }
      onSubmit={(event) => void submit(event)}
      bodyClassName="min-h-24"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="pointer-coarse:h-10"
            onClick={() => requestBulk(null)}
          >
            {t("pipelines.actions.cancel")}
          </Button>
          <Button type="submit" aria-busy={busy} className="pointer-coarse:h-10">
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t("pipelines.bulk.apply")}
          </Button>
        </>
      }
    >
      {isAssign ? (
        <SearchableSelect
          aria-label={t("pipelines.card.assignee")}
          clearable
          placeholder={t("pipelines.card.noAssignee")}
          value={value}
          onChange={(next) => setValue(next)}
          options={assignable.map((person) => ({
            value: person.id,
            label: person.name,
            description: person.email ?? undefined,
          }))}
        />
      ) : (
        <div className="flex flex-col gap-0.5">
          {[...CARD_PRIORITIES, null].map((priority) => (
            <button
              key={priority ?? "none"}
              type="button"
              aria-pressed={value === priority}
              onClick={() => setValue(priority)}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                value === priority && "bg-accent text-accent-foreground"
              )}
            >
              <span className="flex-1">
                {priority ? t(`pipelines.priority.${priority}`) : t("pipelines.priority.none")}
              </span>
              {value === priority ? <Check className="size-4" aria-hidden /> : null}
            </button>
          ))}
        </div>
      )}
    </ResponsiveDialog>
  )
}

/* ---------- novo card ---------- */

function buildCardSchema(t: (key: string) => string) {
  return z.object({
    title: z.string().trim().min(1, t("pipelines.card.titleRequired")).max(500),
    stageId: z.string().nullable().refine(Boolean, t("pipelines.card.stageRequired")),
    assignedToId: z.string().nullable(),
  })
}

export function NewCardDialog({
  open,
  onOpenChange,
  stages,
  defaultStageId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stages: Stage[]
  defaultStageId: string | null
}) {
  const { t } = useTranslation()
  const actions = useCardActions()
  const { assignable } = usePeopleOptions()

  const schema = useMemo(() => buildCardSchema(t), [t])
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", stageId: defaultStageId, assignedToId: null },
    mode: "onBlur",
  })

  useEffect(() => {
    if (open) form.reset({ title: "", stageId: defaultStageId, assignedToId: null })
  }, [defaultStageId, form, open])

  const submit = useFormSubmit(form, async (values) => {
    const card = await actions.create(values.stageId as string, values.title, {
      assignedToId: values.assignedToId,
    })
    toast.success(t("pipelines.card.created"), {
      action: { label: t("pipelines.card.open"), onClick: () => actions.open(card.id) },
    })
    onOpenChange(false)
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("pipelines.card.new")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("pipelines.card.create")}
          onCancel={() => onOpenChange(false)}
          cancelLabel={t("pipelines.actions.cancel")}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          control={form.control}
          name="title"
          label={t("pipelines.card.titleLabel")}
          placeholder={t("pipelines.card.titlePlaceholder")}
          autoFocus
          maxLength={500}
        />
        <SelectField
          control={form.control}
          name="stageId"
          label={t("pipelines.card.stage")}
          options={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
        />
        <ComboboxField
          control={form.control}
          name="assignedToId"
          label={t("pipelines.card.assignee")}
          optional
          clearable
          options={assignable.map((person) => ({ value: person.id, label: person.name }))}
        />
      </div>
    </ResponsiveDialog>
  )
}

/* ---------- renomear ---------- */

function buildRenameSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t("pipelines.boards.nameRequired")).max(120),
    description: z.string().trim().max(500).nullable(),
  })
}

export function RenameBoardDialog({
  board,
  open,
  onOpenChange,
}: {
  board: Pick<Board, "id" | "name" | "description">
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { renameBoard } = useBoardMutations()

  const schema = useMemo(() => buildRenameSchema(t), [t])
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: board.name, description: board.description },
    mode: "onBlur",
  })

  useEffect(() => {
    if (open) form.reset({ name: board.name, description: board.description })
  }, [board.description, board.name, form, open])

  const submit = useFormSubmit(form, async (values) => {
    await renameBoard(board.id, values.name, values.description || null)
    toast.success(t("pipelines.boards.renamed"))
    onOpenChange(false)
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("pipelines.boards.renameTitle")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("pipelines.boards.save")}
          requireChanges
          onCancel={() => onOpenChange(false)}
          cancelLabel={t("pipelines.actions.cancel")}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          control={form.control}
          name="name"
          label={t("pipelines.boards.name")}
          autoFocus
          maxLength={120}
        />
        <TextareaField
          control={form.control}
          name="description"
          label={t("pipelines.boards.description")}
          optional
          maxLength={500}
          rows={3}
        />
      </div>
    </ResponsiveDialog>
  )
}
