import { memo, useMemo, useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { ChevronDown, Info, Pencil, Settings2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCustomFields } from "@/hooks/chat/use-chat-refs"
import { useChatFields } from "@/hooks/chat-details/use-chat-fields"
import { useCan } from "@/hooks/use-can"
import { ApiError } from "@/lib/api"
import { channelKey } from "@/lib/chat/channel"
import { saveAttribute } from "@/lib/chat-details/actions"
import { humanizeKey, isFilled, parseStoredDate } from "@/lib/chat-details/field-values"
import type { Chat, CustomField } from "@/lib/chat/types"
import { formatDate } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { AttributeEditor } from "./attribute-editor"
import { DetailsSection, SectionEmpty } from "./section"

const FIELDS = ["customAttributes", "audienceType", "partial"] as const

const NO_ATTRIBUTES: Chat["customAttributes"] = {}

/** No widget, telefone e e-mail do visitante já aparecem junto do nome. */
const SHOWN_IN_HERO = new Set(["phone", "email"])

function useDisplayValue() {
  const { t } = useTranslation()
  const language = useLanguage()

  return (field: Pick<CustomField, "valueType"> | undefined, raw: string): string => {
    switch (field?.valueType) {
      case "number": {
        const parsed = Number(raw)
        return Number.isFinite(parsed) ? formatNumber(parsed, language) : raw
      }
      case "date": {
        const parsed = parseStoredDate(raw)
        return parsed ? formatDate(parsed, language, "medium") : raw
      }
      case "checkbox":
        return raw === "true" ? t("chatDetails.fields.yes") : t("chatDetails.fields.no")
      default:
        return raw
    }
  }
}

function FieldLabel({ name, description }: { name: string; description?: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <span className="truncate">{name}</span>
      {description ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span tabIndex={0} className="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
            }
          >
            <Info aria-label={description} className="size-3" />
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{description}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  )
}

/** Sim ou não vale na hora: não há o que confirmar, e desfazer é o mesmo gesto. */
function CheckboxRow({
  chatId,
  field,
  value,
}: {
  chatId: string
  field: CustomField
  value: string | null
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-9 items-center justify-between gap-2 pointer-coarse:min-h-10">
      <FieldLabel name={field.name} description={field.description} />
      <Switch
        checked={value === "true"}
        aria-label={field.name}
        className="mr-1 shrink-0"
        onCheckedChange={(checked) => {
          saveAttribute(chatId, field.key, checked ? "true" : "false").catch((error: unknown) =>
            toast.error(
              error instanceof ApiError && error.serverMessage
                ? error.serverMessage
                : t("chatDetails.fields.failed")
            )
          )
        }}
      />
    </div>
  )
}

function FieldRow({
  label,
  description,
  shown,
  editLabel,
  onEdit,
}: {
  label: string
  description?: string | null
  shown: string | null
  editLabel: string
  onEdit: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="py-1">
      <FieldLabel name={label} description={description} />
      <button
        type="button"
        aria-label={editLabel}
        onClick={onEdit}
        className="group/field -mx-2 flex min-h-6 w-[calc(100%+1rem)] items-start justify-between gap-2 rounded-md px-2 py-0.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10 pointer-coarse:items-center"
      >
        {shown ? (
          <span className="min-w-0 text-sm wrap-anywhere whitespace-pre-wrap">{shown}</span>
        ) : (
          <span className="text-sm text-muted-foreground">{t("chatDetails.fields.addValue")}</span>
        )}
        <Pencil
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/field:opacity-100 group-focus-visible/field:opacity-100 pointer-coarse:mt-0 pointer-coarse:opacity-60"
        />
      </button>
    </div>
  )
}

/**
 * Os campos preenchidos à vista; os vazios, a um toque: um contato com três campos não precisa de um
 * formulário com vinte. O que um fluxo gravou sem campo cadastrado também aparece, porque é a pessoa
 * quem atende e precisa saber, e só aí dá para tirar a chave.
 */
export const FieldsSection = memo(function FieldsSection({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const chat = useChatFields(chatId, FIELDS)
  const { customFields } = useCustomFields()
  const canManage = useCan("core_settings")
  const display = useDisplayValue()
  const [editing, setEditing] = useState<string | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)

  const attributes = chat?.customAttributes ?? NO_ATTRIBUTES
  const channel = channelKey(undefined, chat?.audienceType)

  const { filled, empty, extras } = useMemo(() => {
    const known = new Set(customFields.map((field) => field.key))
    return {
      filled: customFields.filter((field) => isFilled(attributes[field.key])),
      empty: customFields.filter((field) => !isFilled(attributes[field.key])),
      extras: Object.keys(attributes).filter(
        (key) =>
          !known.has(key) &&
          isFilled(attributes[key]) &&
          !(channel === "web" && SHOWN_IN_HERO.has(key))
      ),
    }
  }, [attributes, channel, customFields])

  const renderField = (field: CustomField) => {
    const raw = attributes[field.key]
    const value = isFilled(raw) ? String(raw) : null

    if (field.valueType === "checkbox") {
      return <CheckboxRow key={field.key} chatId={chatId} field={field} value={value} />
    }

    if (editing === field.key) {
      return (
        <AttributeEditor
          key={field.key}
          chatId={chatId}
          field={field}
          value={value}
          onDone={() => setEditing(null)}
        />
      )
    }

    return (
      <FieldRow
        key={field.key}
        label={field.name}
        description={field.description}
        shown={value ? display(field, value) : null}
        editLabel={t("chatDetails.fields.edit", { name: field.name })}
        onEdit={() => setEditing(field.key)}
      />
    )
  }

  const total = filled.length + extras.length

  return (
    <DetailsSection id="fields" title={t("chatDetails.fields.title")} count={total}>
      <div className="flex flex-col gap-0.5">
        {filled.map(renderField)}

        {extras.map((key) =>
          editing === key ? (
            <AttributeEditor
              key={key}
              chatId={chatId}
              field={{ name: humanizeKey(key), key, description: null }}
              value={String(attributes[key])}
              onDone={() => setEditing(null)}
            />
          ) : (
            <FieldRow
              key={key}
              label={humanizeKey(key)}
              shown={String(attributes[key])}
              editLabel={t("chatDetails.fields.edit", { name: humanizeKey(key) })}
              onEdit={() => setEditing(key)}
            />
          )
        )}

        {total === 0 && empty.length === 0 ? (
          <SectionEmpty
            action={
              canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-2 pointer-coarse:h-10"
                  nativeButton={false}
                  render={<Link to="/settings/custom-fields" />}
                >
                  <Settings2 />
                  {t("chatDetails.fields.manage")}
                </Button>
              ) : undefined
            }
          >
            {t("chatDetails.fields.noneDefined")}
          </SectionEmpty>
        ) : null}

        {showEmpty ? empty.map(renderField) : null}

        {empty.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-0.5 -ml-2 w-fit text-muted-foreground pointer-coarse:h-10"
            aria-expanded={showEmpty}
            onClick={() => setShowEmpty((value) => !value)}
          >
            <ChevronDown className={showEmpty ? "rotate-180" : undefined} />
            {showEmpty
              ? t("chatDetails.fields.hideEmpty")
              : t("chatDetails.fields.showEmpty", { count: empty.length })}
          </Button>
        ) : null}
      </div>
    </DetailsSection>
  )
})
