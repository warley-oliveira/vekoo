import { useMemo, useRef, type KeyboardEvent } from "react"
import { Controller, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import {
  CreatableSelect,
  DateField,
  Form,
  FormActions,
  NumberField,
  TextField,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useIsTouch } from "@/hooks/use-media-query"
import { ApiError } from "@/lib/api"
import { addFieldOption, saveAttribute } from "@/lib/chat-details/actions"
import { parseStoredDate } from "@/lib/chat-details/field-values"
import type { CustomField } from "@/lib/chat/types"
import { toDateInputValue } from "@/lib/date-format"
import { cn } from "@/lib/utils"

const MAX_TEXT = 1_000

function FormFooter({ onCancel, onClear }: { onCancel: () => void; onClear?: () => void }) {
  const { t } = useTranslation()

  return (
    <FormActions
      submitLabel={t("chatDetails.fields.save")}
      onCancel={onCancel}
      secondary={
        onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:h-10"
            onClick={onClear}
          >
            {t("chatDetails.fields.clear")}
          </Button>
        ) : undefined
      }
    />
  )
}

/** Fecha o que está aberto com Esc, sem mexer em nada mais. */
function useEscape(onCancel: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      onCancel()
    }
  }
}

type EditorProps = {
  chatId: string
  field: Pick<CustomField, "name" | "key" | "description"> & Partial<CustomField>
  value: string | null
  onDone: () => void
}

function useSave({ chatId, field, onDone }: EditorProps) {
  const { t } = useTranslation()

  return async (next: string | null) => {
    await saveAttribute(chatId, field.key, next)
    toast.success(t("chatDetails.fields.saved", { name: field.name }))
    onDone()
  }
}

function useClear(props: EditorProps) {
  const { t } = useTranslation()
  const save = useSave(props)

  return props.value
    ? () => {
        save(null).catch((error: unknown) =>
          toast.error(
            error instanceof ApiError && error.serverMessage
              ? error.serverMessage
              : t("chatDetails.fields.failed")
          )
        )
      }
    : undefined
}

function TextEditor(props: EditorProps) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const save = useSave(props)
  const clear = useClear(props)
  const onKeyDown = useEscape(props.onDone)

  const schema = useMemo(
    () =>
      z.object({
        value: z.string().trim().max(MAX_TEXT, t("chatDetails.fields.tooLong", { max: MAX_TEXT })),
      }),
    [t]
  )
  const form = useForm<{ value: string }>({
    resolver: zodResolver(schema),
    defaultValues: { value: props.value ?? "" },
  })

  return (
    <Form
      form={form}
      className="flex flex-col gap-2"
      onKeyDown={onKeyDown}
      onSubmit={({ value }) => save(value || null)}
    >
      <TextField
        control={form.control}
        name="value"
        label={props.field.name}
        hint={props.field.description ?? undefined}
        autoFocus={!isTouch}
      />
      <FormFooter onCancel={props.onDone} onClear={clear} />
    </Form>
  )
}

function NumberEditor(props: EditorProps) {
  const { t } = useTranslation()
  const save = useSave(props)
  const clear = useClear(props)
  const onKeyDown = useEscape(props.onDone)

  const parsed = props.value === null ? null : Number(props.value)
  const form = useForm<{ value: number | null }>({
    resolver: zodResolver(
      z.object({ value: z.number({ error: t("chatDetails.fields.notNumber") }).nullable() })
    ),
    defaultValues: { value: parsed !== null && Number.isFinite(parsed) ? parsed : null },
  })

  return (
    <Form
      form={form}
      className="flex flex-col gap-2"
      onKeyDown={onKeyDown}
      onSubmit={({ value }) => save(value === null ? null : String(value))}
    >
      <NumberField
        control={form.control}
        name="value"
        label={props.field.name}
        hint={props.field.description ?? undefined}
      />
      <FormFooter onCancel={props.onDone} onClear={clear} />
    </Form>
  )
}

function DateEditor(props: EditorProps) {
  const save = useSave(props)
  const clear = useClear(props)
  const onKeyDown = useEscape(props.onDone)

  const form = useForm<{ value: Date | null }>({
    defaultValues: { value: props.value ? parseStoredDate(props.value) : null },
  })

  return (
    <Form
      form={form}
      className="flex flex-col gap-2"
      onKeyDown={onKeyDown}
      onSubmit={({ value }) => save(value ? toDateInputValue(value) : null)}
    >
      <DateField
        control={form.control}
        name="value"
        label={props.field.name}
        hint={props.field.description ?? undefined}
      />
      <FormFooter onCancel={props.onDone} onClear={clear} />
    </Form>
  )
}

/** Campo de lista: escolhe ou cadastra a opção ali mesmo, sem sair da conversa. */
function ListEditor(props: EditorProps) {
  const { t } = useTranslation()
  const save = useSave(props)
  const clear = useClear(props)
  const onKeyDown = useEscape(props.onDone)
  const created = useRef(new Set<string>())

  const form = useForm<{ value: string | null }>({ defaultValues: { value: props.value } })
  const fieldId = props.field.id

  const options = useMemo(() => {
    const known = props.field.optionValues ?? []
    return props.value && !known.includes(props.value) ? [...known, props.value] : known
  }, [props.field.optionValues, props.value])

  return (
    <Form
      form={form}
      className="flex flex-col gap-2"
      onKeyDown={onKeyDown}
      onSubmit={({ value }) => save(value)}
    >
      <Controller
        control={form.control}
        name="value"
        render={({ field }) => (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor={`attribute-${props.field.key}`}>
              {props.field.name}
            </label>
            <CreatableSelect
              id={`attribute-${props.field.key}`}
              options={options}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={t("chatDetails.fields.choose")}
              onCreate={
                fieldId
                  ? async (option) => {
                      try {
                        await addFieldOption(fieldId, option)
                        created.current.add(option)
                      } catch (error) {
                        toast.error(
                          error instanceof ApiError && error.serverMessage
                            ? error.serverMessage
                            : t("chatDetails.fields.optionFailed")
                        )
                        throw error
                      }
                    }
                  : undefined
              }
            />
            {props.field.description ? (
              <p className="text-xs text-muted-foreground">{props.field.description}</p>
            ) : null}
          </div>
        )}
      />
      <FormFooter onCancel={props.onDone} onClear={clear} />
    </Form>
  )
}

/** Edita um campo só, no lugar dele, com o controle do tipo. */
export function AttributeEditor(props: EditorProps) {
  const type = props.field.valueType ?? "text"

  return (
    <div className={cn("rounded-lg bg-muted/40 p-2.5")}>
      {type === "number" ? (
        <NumberEditor {...props} />
      ) : type === "date" ? (
        <DateEditor {...props} />
      ) : type === "list" ? (
        <ListEditor {...props} />
      ) : (
        <TextEditor {...props} />
      )}
    </div>
  )
}
