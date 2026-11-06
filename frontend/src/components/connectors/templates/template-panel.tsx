import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useFieldArray, useForm, useWatch, type Control, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { Copy, ExternalLink, Phone, Plus, Reply, Trash2, TriangleAlert, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import {
  FormActions,
  SegmentedControl,
  SelectField,
  SidePanel,
  TextField,
  TextareaField,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { ApiError, apiPatch, apiPost } from "@/lib/api"
import {
  BUTTON_TYPES,
  CATEGORIES,
  HEADER_FORMATS,
  LANGUAGES,
  MAX_BODY_TEXT,
  MAX_BUTTONS,
  MAX_BUTTON_TEXT,
  MAX_FOOTER_TEXT,
  MAX_HEADER_TEXT,
  bodyVariables,
  buildTemplateSchema,
  emptyTemplate,
  exampleKey,
  formToComponents,
  nextVariable,
  normalizeTemplateName,
  templateToForm,
  type ButtonType,
  type TemplateFormValues,
} from "@/lib/connectors/template-builder"
import type { WhatsappTemplate } from "@/lib/connectors/types"
import { TemplatePreview } from "./template-preview"

const BUTTON_ICONS: Record<ButtonType, LucideIcon> = {
  QUICK_REPLY: Reply,
  URL: ExternalLink,
  PHONE_NUMBER: Phone,
  COPY_CODE: Copy,
}

export type TemplatePanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectorId: string
  connectorName: string
  /** Editando. Sem isto, cria. */
  template?: WhatsappTemplate | null
  onSaved: () => void
}

/**
 * O construtor de modelos, com a prévia ao lado. No celular as duas coisas não cabem juntas:
 * a prévia vira uma visão própria, a um toque.
 */
export function TemplatePanel({
  open,
  onOpenChange,
  connectorId,
  connectorName,
  template,
  onSaved,
}: TemplatePanelProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const schema = useMemo(() => buildTemplateSchema(t), [t])
  const editing = Boolean(template)
  const [view, setView] = useState<"edit" | "preview">("edit")
  const [serverErrors, setServerErrors] = useState<string[]>([])
  const errorsRef = useRef<HTMLDivElement>(null)

  const defaults = useMemo(() => (template ? templateToForm(template) : emptyTemplate()), [template])

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onBlur",
  })

  useEffect(() => {
    if (!open) return
    form.reset(defaults)
    setServerErrors([])
    setView("edit")
  }, [open, defaults, form])

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    setServerErrors([])
    const components = formToComponents(values, template ?? undefined)
    const base = `/connectors/${connectorId}/templates`

    try {
      if (template) {
        // A Meta só deixa mudar os `components`. Nome, idioma e categoria ficam travados.
        await apiPatch(`${base}/${template.id}`, { components })
      } else {
        await apiPost(base, {
          name: normalizeTemplateName(values.name),
          category: values.category,
          language: values.language,
          components,
        })
      }
      toast.success(t(editing ? "connectors.templates.updated" : "connectors.templates.created"))
      onSaved()
      close()
    } catch (error) {
      // O que a Meta recusa vem em `base`, às vezes mais de um motivo: todos ficam na tela,
      // onde a pessoa está, em vez de um só. O resto (nome, idioma) vai para o campo.
      const base = error instanceof ApiError ? error.details?.base : undefined
      if (!base?.length) throw error
      setServerErrors(base)
      setView("edit")
      errorsRef.current?.scrollIntoView({ block: "nearest" })
    }
  })

  const values = useWatch({ control: form.control }) as TemplateFormValues

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      className="data-[side=right]:sm:max-w-5xl"
      disablePointerDismissal
      title={t(editing ? "connectors.templates.editTitle" : "connectors.templates.createTitle")}
      description={connectorName}
      onSubmit={submit}
      bodyClassName="p-0"
      footer={
        <FormActions
          form={form}
          submitLabel={t(editing ? "connectors.templates.save" : "connectors.templates.create")}
          onCancel={close}
        />
      }
    >
      {isMobile ? (
        <div className="sticky top-0 z-10 border-b bg-popover p-3">
          <SegmentedControl
            fullWidth
            aria-label={t("connectors.templates.viewLabel")}
            value={view}
            onChange={setView}
            options={[
              { value: "edit", label: t("connectors.templates.viewEdit") },
              { value: "preview", label: t("connectors.templates.viewPreview") },
            ]}
          />
        </div>
      ) : null}

      <div className="grid md:h-full md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className={isMobile && view !== "edit" ? "hidden" : "flex flex-col gap-6 p-4 md:overflow-y-auto"}>
          {serverErrors.length > 0 ? (
            <div
              ref={errorsRef}
              role="alert"
              className="flex gap-2 rounded-lg bg-status-danger-soft p-3 text-sm text-status-danger"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{t("connectors.templates.serverErrors")}</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {serverErrors.map((error) => (
                    <li key={error} className="wrap-anywhere">{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <BasicFields form={form} editing={editing} />
          <HeaderSection form={form} />
          <BodySection form={form} />
          <FooterSection form={form} />
          <ButtonsSection form={form} />
        </div>

        <aside
          className={
            isMobile && view !== "preview"
              ? "hidden"
              : "flex flex-col gap-3 p-4 md:overflow-y-auto md:border-l"
          }
        >
          <div className="space-y-0.5">
            <h3 className="text-sm font-medium">{t("connectors.templates.preview.title")}</h3>
            <p className="text-xs text-pretty text-muted-foreground">
              {t("connectors.templates.preview.hint")}
            </p>
          </div>
          <TemplatePreview values={values} />
        </aside>
      </div>
    </SidePanel>
  )
}

type SectionProps = { form: UseFormReturn<TemplateFormValues> }

function BasicFields({ form, editing }: SectionProps & { editing: boolean }) {
  const { t } = useTranslation()
  const name = useWatch({ control: form.control, name: "name" })
  const normalized = normalizeTemplateName(name ?? "")

  return (
    <div className="flex flex-col gap-4">
      <TextField
        control={form.control}
        name="name"
        label={t("connectors.templates.name")}
        placeholder={t("connectors.templates.namePlaceholder")}
        disabled={editing}
        hint={
          editing
            ? t("connectors.templates.lockedHint")
            : normalized && normalized !== name
              ? t("connectors.templates.nameNormalized", { name: normalized })
              : t("connectors.templates.nameHint")
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="category"
          label={t("connectors.templates.category")}
          disabled={editing}
          options={CATEGORIES.map((value) => ({
            value,
            label: t(`connectors.templates.categories.${value}`),
          }))}
        />
        <SelectField
          control={form.control}
          name="language"
          label={t("connectors.templates.language")}
          disabled={editing}
          options={LANGUAGES.map((value) => ({
            value,
            label: t(`connectors.templates.languages.${value}`),
          }))}
        />
      </div>
    </div>
  )
}

/** Uma parte opcional do modelo: um botão para acrescentar, e para tirar depois. */
function OptionalPart({
  title,
  hint,
  enabled,
  onToggle,
  addLabel,
  children,
}: {
  title: string
  hint: string
  enabled: boolean
  onToggle: (next: boolean) => void
  addLabel: string
  children: ReactNode
}) {
  const { t } = useTranslation()

  if (!enabled) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-auto justify-start border-dashed py-2 text-left whitespace-normal"
        onClick={() => onToggle(true)}
      >
        <Plus />
        <span className="min-w-0">
          <span className="block">{addLabel}</span>
          <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
        </span>
      </Button>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={() => onToggle(false)}
        >
          <Trash2 />
          {t("connectors.templates.removePart")}
        </Button>
      </div>
      {children}
    </section>
  )
}

function HeaderSection({ form }: SectionProps) {
  const { t } = useTranslation()
  const enabled = useWatch({ control: form.control, name: "header.enabled" })
  const format = useWatch({ control: form.control, name: "header.format" })
  const isMedia = format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT"

  return (
    <OptionalPart
      title={t("connectors.templates.header.title")}
      hint={t("connectors.templates.header.hint")}
      addLabel={t("connectors.templates.header.add")}
      enabled={enabled}
      onToggle={(next) => form.setValue("header.enabled", next, { shouldDirty: true, shouldValidate: false })}
    >
      <SelectField
        control={form.control}
        name="header.format"
        label={t("connectors.templates.header.format")}
        options={HEADER_FORMATS.map((value) => ({
          value,
          label: t(`connectors.templates.header.formats.${value}`),
        }))}
      />
      {format === "TEXT" ? (
        <TextField
          control={form.control}
          name="header.text"
          label={t("connectors.templates.header.text")}
          maxLength={MAX_HEADER_TEXT}
          hint={t("connectors.templates.maxChars", { max: MAX_HEADER_TEXT })}
        />
      ) : null}
      {isMedia ? (
        <TextField
          control={form.control}
          name="header.mediaUrl"
          type="url"
          inputMode="url"
          label={t("connectors.templates.header.mediaUrl")}
          placeholder={t("connectors.templates.header.mediaPlaceholder")}
          hint={t(`connectors.templates.header.mediaHint.${format}`)}
        />
      ) : null}
      {format === "LOCATION" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="header.latitude"
            inputMode="decimal"
            label={t("connectors.templates.header.latitude")}
            placeholder="-23.550520"
          />
          <TextField
            control={form.control}
            name="header.longitude"
            inputMode="decimal"
            label={t("connectors.templates.header.longitude")}
            placeholder="-46.633308"
          />
          <TextField
            control={form.control}
            name="header.placeName"
            label={t("connectors.templates.header.placeName")}
            optional
          />
          <TextField
            control={form.control}
            name="header.address"
            label={t("connectors.templates.header.address")}
            optional
          />
        </div>
      ) : null}
    </OptionalPart>
  )
}

function BodySection({ form }: SectionProps) {
  const { t } = useTranslation()
  const text = useWatch({ control: form.control, name: "body.text" }) ?? ""
  const variables = bodyVariables(text)

  return (
    <section className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-foreground/10">
      <TextareaField
        control={form.control}
        name="body.text"
        label={t("connectors.templates.body.title")}
        placeholder={t("connectors.templates.body.placeholder")}
        hint={t("connectors.templates.body.hint", { first: "{{1}}", second: "{{2}}" })}
        rows={4}
        maxLength={MAX_BODY_TEXT}
        showCount
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit pointer-coarse:h-10"
        onClick={() => {
          const current = form.getValues("body.text")
          form.setValue(
            "body.text",
            `${current}${current && !current.endsWith(" ") ? " " : ""}${nextVariable(current)}`,
            { shouldDirty: true, shouldValidate: false }
          )
        }}
      >
        <Plus />
        {t("connectors.templates.body.addVariable")}
      </Button>

      {variables.length > 0 ? (
        <div className="flex flex-col gap-3 border-t pt-3">
          <p className="text-xs text-pretty text-muted-foreground">
            {t("connectors.templates.body.examplesHint")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {variables.map((name) => (
              <TextField
                key={name}
                control={form.control}
                name={`body.examples.${exampleKey(name)}`}
                label={t("connectors.templates.body.exampleOf", { variable: `{{${name}}}` })}
                placeholder={t("connectors.templates.body.examplePlaceholder")}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function FooterSection({ form }: SectionProps) {
  const { t } = useTranslation()
  const enabled = useWatch({ control: form.control, name: "footer.enabled" })

  return (
    <OptionalPart
      title={t("connectors.templates.footer.title")}
      hint={t("connectors.templates.footer.hint")}
      addLabel={t("connectors.templates.footer.add")}
      enabled={enabled}
      onToggle={(next) => form.setValue("footer.enabled", next, { shouldDirty: true })}
    >
      <TextField
        control={form.control}
        name="footer.text"
        label={t("connectors.templates.footer.text")}
        maxLength={MAX_FOOTER_TEXT}
        hint={t("connectors.templates.maxChars", { max: MAX_FOOTER_TEXT })}
      />
    </OptionalPart>
  )
}

function ButtonsSection({ form }: SectionProps) {
  const { t } = useTranslation()
  const enabled = useWatch({ control: form.control, name: "buttons.enabled" })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "buttons.items" })
  const items = useWatch({ control: form.control, name: "buttons.items" }) ?? []
  const groupError = form.formState.errors.buttons?.enabled?.message

  return (
    <OptionalPart
      title={t("connectors.templates.buttons.title")}
      hint={t("connectors.templates.buttons.hint")}
      addLabel={t("connectors.templates.buttons.add")}
      enabled={enabled}
      onToggle={(next) => form.setValue("buttons.enabled", next, { shouldDirty: true })}
    >
      {fields.map((field, index) => (
        <ButtonRow
          key={field.id}
          control={form.control}
          index={index}
          type={items[index]?.type ?? field.type}
          onRemove={() => remove(index)}
        />
      ))}

      {groupError ? (
        <p role="alert" className="text-xs text-destructive">
          {groupError}
        </p>
      ) : null}

      {fields.length < MAX_BUTTONS ? (
        <div className="flex flex-wrap gap-1.5">
          {BUTTON_TYPES.map((type) => {
            const Icon = BUTTON_ICONS[type]
            return (
              <Button
                key={type}
                type="button"
                variant="outline"
                size="sm"
                className="border-dashed pointer-coarse:h-10"
                onClick={() => append({ type, text: "", url: "", phone: "" })}
              >
                <Icon />
                {t(`connectors.templates.buttons.types.${type}`)}
              </Button>
            )
          })}
        </div>
      ) : null}

      <p className="text-xs text-pretty text-muted-foreground">
        {t("connectors.templates.buttons.rules", { count: fields.length, max: MAX_BUTTONS })}
      </p>
    </OptionalPart>
  )
}

function ButtonRow({
  control,
  index,
  type,
  onRemove,
}: {
  control: Control<TemplateFormValues>
  index: number
  type: ButtonType
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const Icon = BUTTON_ICONS[type]

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Icon aria-hidden className="size-3.5" />
          {t(`connectors.templates.buttons.types.${type}`)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("connectors.templates.buttons.remove", { number: index + 1 })}
          className="text-muted-foreground pointer-coarse:size-10"
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      <TextField
        control={control}
        name={`buttons.items.${index}.text`}
        label={t("connectors.templates.buttons.text")}
        maxLength={MAX_BUTTON_TEXT}
        hint={t("connectors.templates.maxChars", { max: MAX_BUTTON_TEXT })}
      />
      {type === "URL" ? (
        <TextField
          control={control}
          name={`buttons.items.${index}.url`}
          type="url"
          inputMode="url"
          label={t("connectors.templates.buttons.url")}
          placeholder={t("connectors.templates.buttons.urlPlaceholder")}
          hint={t("connectors.templates.buttons.urlHint", { variable: "{{1}}" })}
        />
      ) : null}
      {type === "PHONE_NUMBER" ? (
        <TextField
          control={control}
          name={`buttons.items.${index}.phone`}
          type="tel"
          inputMode="tel"
          label={t("connectors.templates.buttons.phone")}
          placeholder={t("connectors.templates.buttons.phonePlaceholder")}
          hint={t("connectors.templates.buttons.phoneHint")}
        />
      ) : null}
    </div>
  )
}
