import { useMemo, useRef } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Braces, Eye } from "lucide-react"

import { FormField, type FieldControlProps, type FormFieldBaseProps } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useTriggerContext } from "@/hooks/pipelines-admin/use-trigger-context"
import {
  MESSAGE_TOKENS,
  customFieldToken,
  type TokenDefinition,
} from "@/lib/pipelines-admin/trigger-catalog"
import type { BoardCard, CustomField } from "@/lib/pipelines-admin/types"
import { cn } from "@/lib/utils"
import { PhrasePicker, type PhraseOption } from "./phrase-picker"

// Depois que o popover devolve o foco ao botão: é o tempo de fechar a animação.
const REFOCUS_DELAY_MS = 60

type TokenFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> =
  FormFieldBaseProps<TValues, TName> & {
    multiline?: boolean
    rows?: number
    placeholder?: string
    /** A lista de `{{...}}` que vale aqui. O padrão é a das mensagens. */
    tokens?: TokenDefinition[]
    /** Os campos personalizados do quadro também entram na lista. */
    withCustomFields?: boolean
    /** Mostra como fica com um card de verdade. */
    preview?: boolean
    mono?: boolean
  }

/** Espelha o `token_value` de `Pipelines::TriggerJob`, para a prévia dizer a verdade. */
function tokenValue(
  name: string,
  card: BoardCard,
  boardName: string,
  stageName: string | null,
  fields: CustomField[]
): string | null {
  switch (name) {
    case "card.title":
      return card.title
    case "card.description":
      return card.description ?? ""
    case "card.priority":
      return card.priority ?? ""
    case "card.due_date":
      return card.dueDate ? new Intl.DateTimeFormat().format(new Date(card.dueDate)) : ""
    case "card.deal_value":
      return card.dealValue === null ? "" : String(card.dealValue)
    case "card.company_name":
      return card.companyName ?? ""
    case "card.contact_email":
      return card.contactEmail ?? ""
    case "card.contact_phone":
      return card.contactPhone ?? ""
    case "card.tags":
      return card.tags.join(", ")
    case "card.labels":
      return card.labels.map((label) => label.name).join(", ")
    case "card.assigned_to":
    case "card.assigned_to_name":
      return card.assignedTo?.name ?? ""
    case "board.name":
      return boardName
    case "stage.name":
      return stageName ?? ""
    default:
      if (name.startsWith("card.custom_field.")) {
        const reference = name.slice("card.custom_field.".length)
        const field = fields.find((item) => item.key === reference || item.name === reference)
        const value = card.customFieldValues?.[field?.key ?? reference]
        return value === null || value === undefined ? "" : String(value)
      }
      return null
  }
}

/**
 * Texto com informações do card no meio: "{{card.title}} chegou em {{stage.name}}". Quem escreve não
 * decora nada: um menu insere no ponto do cursor, com o nome em português, e a prévia mostra como
 * fica com um card de verdade.
 */
export function TokenField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  multiline = false,
  rows = 3,
  placeholder,
  tokens = MESSAGE_TOKENS,
  withCustomFields = true,
  preview = false,
  mono = false,
  ...fieldProps
}: TokenFieldProps<TValues, TName>) {
  const { t } = useTranslation()
  const { board } = useTriggerContext()
  const isCrm = board.boardType === "crm"

  const options = useMemo<PhraseOption[]>(() => {
    const base = tokens
      .filter((token) => isCrm || token.group !== "deal")
      .map((token) => ({
        value: token.token,
        label: t(`pipelinesAdmin.triggers.tokens.${token.labelKey}`),
        group: t(`pipelinesAdmin.triggers.tokenGroups.${token.group}`),
      }))
    const custom = withCustomFields
      ? board.customFields.map((field) => ({
          value: customFieldToken(field.key),
          label: field.name,
          group: t("pipelinesAdmin.triggers.tokenGroups.custom"),
        }))
      : []
    return [...base, ...custom]
  }, [board.customFields, isCrm, t, tokens, withCustomFields])

  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <TokenInput
          multiline={multiline}
          rows={rows}
          placeholder={placeholder}
          mono={mono}
          value={field.value ?? ""}
          name={field.name}
          fieldRef={field.ref}
          onChange={field.onChange}
          onBlur={field.onBlur}
          controlProps={controlProps}
          options={options}
          preview={preview}
        />
      )}
    </FormField>
  )
}

type TextElement = HTMLInputElement | HTMLTextAreaElement

function TokenInput({
  multiline,
  rows,
  placeholder,
  mono,
  value,
  name,
  fieldRef,
  onChange,
  onBlur,
  controlProps,
  options,
  preview,
}: {
  multiline: boolean
  rows: number
  placeholder?: string
  mono: boolean
  value: string
  name: string
  fieldRef: (element: TextElement | null) => void
  onChange: (value: string) => void
  onBlur: () => void
  controlProps: FieldControlProps
  options: PhraseOption[]
  preview: boolean
}) {
  const { t } = useTranslation()
  const elementRef = useRef<TextElement | null>(null)
  const caret = useRef<number | null>(null)

  const remember = (event: React.SyntheticEvent<TextElement>) => {
    caret.current = event.currentTarget.selectionStart
  }

  function insert(token: string) {
    const position = caret.current ?? value.length
    const end = position + token.length
    onChange(value.slice(0, position) + token + value.slice(position))
    caret.current = end
    window.setTimeout(() => {
      elementRef.current?.focus()
      elementRef.current?.setSelectionRange(end, end)
    }, REFOCUS_DELAY_MS)
  }

  const setRef = (element: TextElement | null) => {
    elementRef.current = element
    fieldRef(element)
  }

  const common = {
    ...controlProps,
    name,
    value,
    placeholder,
    spellCheck: !mono,
    onSelect: remember,
    onChange: (event: React.ChangeEvent<TextElement>) => onChange(event.target.value),
    onBlur: (event: React.FocusEvent<TextElement>) => {
      remember(event)
      onBlur()
    },
    className: cn(mono && "font-mono text-xs"),
  }

  return (
    <div className="flex flex-col gap-1.5">
      {multiline ? <Textarea {...common} ref={setRef} rows={rows} /> : <Input {...common} ref={setRef} />}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{preview ? <TokenPreview text={value} /> : null}</div>
        <PhrasePicker
          label={t("pipelinesAdmin.triggers.insertToken")}
          value={null}
          options={options}
          display={
            <span className="inline-flex items-center gap-1">
              <Braces aria-hidden className="size-3" />
              {t("pipelinesAdmin.triggers.insertToken")}
            </span>
          }
          align="end"
          className="h-6 shrink-0 border-transparent px-1 text-xs font-normal text-muted-foreground pointer-coarse:h-8"
          onChange={insert}
        />
      </div>
    </div>
  )
}

function TokenPreview({ text }: { text: string }) {
  const { t } = useTranslation()
  const { board, sampleCard: card } = useTriggerContext()

  const rendered = useMemo(() => {
    if (!card || !text.includes("{{")) return null
    const stageName = board.stages.find((stage) => stage.id === card.stageId)?.name ?? null
    return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, name: string) => {
      const value = tokenValue(name, card, board.name, stageName, board.customFields)
      return value === null ? token : value
    })
  }, [board, card, text])

  if (!rendered) return null

  return (
    <p className="flex gap-1.5 text-xs text-pretty text-muted-foreground">
      <Eye aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>
        <span className="sr-only">{t("pipelinesAdmin.triggers.previewLabel")} </span>
        {rendered}
      </span>
    </p>
  )
}
