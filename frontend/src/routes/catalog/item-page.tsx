import { useEffect, useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch, type Control, type UseFormSetError } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link, useLocation, useNavigate, useParams } from "react-router"
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { CategoryFormDialog } from "@/components/products/category-form-dialog"
import { ChipsField } from "@/components/products/chips-input"
import { CustomFieldControl } from "@/components/products/custom-field-control"
import { FieldFormPanel } from "@/components/products/field-form-panel"
import { ImageGallery } from "@/components/products/image-gallery"
import { ItemPageSkeleton } from "@/components/products/item-page-skeleton"
import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  FormError,
  MultiSelectField,
  PageBody,
  PageHeader,
  SectionCard,
  SwitchField,
  TextField,
  TextareaField,
  UnsavedChangesDialog,
  applyServerErrors,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useImageQueue } from "@/hooks/products/use-image-queue"
import { useItemActions } from "@/hooks/products/use-item-actions"
import {
  useFieldMutations,
  useItemMutations,
  useProductCategories,
  useProductFields,
  useProductItem,
} from "@/hooks/products/use-products"
import { ApiError } from "@/lib/api"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { categoryPathLabel } from "@/lib/products/category-tree"
import {
  ITEM_SUMMARY_MAX,
  ITEM_TAGS_MAX,
  ITEM_TITLE_MAX,
  buildItemSchema,
  emptyItemValues,
  isAutoKey,
  itemFormToPayload,
  itemToFormValues,
  toFieldValue,
  type ItemFormValues,
} from "@/lib/products/item-form"
import { nextPosition } from "@/lib/products/reorder"
import type { ProductCategory, ProductField, ProductItemDetail } from "@/lib/products/types"

type RouteState = { from?: string } | null

export default function ItemPage() {
  const { t } = useTranslation()
  const { itemId } = useParams<{ itemId: string }>()
  const location = useLocation()

  const id = itemId === "new" ? null : (itemId ?? null)
  const backTo = `/catalog${(location.state as RouteState)?.from ?? ""}`

  const { item, error: itemError, mutate: retryItem } = useProductItem(id)
  const { fields, error: fieldsError, mutate: retryFields } = useProductFields()
  const { categories, error: categoriesError, mutate: retryCategories } = useProductCategories()

  // Aqui, e não no formulário: as fotos de um item novo sobrevivem à troca de `/new` para o
  // id, que é quando elas finalmente sobem.
  const queue = useImageQueue(id)

  const shell = (children: React.ReactNode) => (
    <PageBody>
      <PageHeader
        title={t("navigation.routes.catalogItem")}
        backTo={backTo}
        parentTitle={t("navigation.catalog")}
      />
      {children}
    </PageBody>
  )

  if (itemError instanceof ApiError && itemError.status === 404) {
    return shell(
      <EmptyState
        title={t("products.item.notFound.title")}
        description={t("products.item.notFound.description")}
        action={{ label: t("products.item.notFound.back"), onClick: () => window.history.back() }}
      />
    )
  }

  const error = itemError ?? fieldsError ?? categoriesError
  if (error) {
    return shell(
      <ErrorState
        error={error}
        onRetry={() => {
          void retryItem()
          void retryFields()
          void retryCategories()
        }}
      />
    )
  }

  if (!fields || !categories || (id && !item)) return shell(<ItemPageSkeleton />)

  return (
    <ItemForm
      // Item novo que acabou de ser salvo vira outro formulário, limpo e com a resposta.
      key={id ?? "new"}
      item={id ? (item ?? null) : null}
      fields={fields}
      categories={categories}
      queue={queue}
      backTo={backTo}
      routeState={location.state}
    />
  )
}

type ItemFormProps = {
  item: ProductItemDetail | null
  fields: ProductField[]
  categories: ProductCategory[]
  queue: ReturnType<typeof useImageQueue>
  backTo: string
  routeState: unknown
}

function ItemForm({ item, fields, categories, queue, backTo, routeState }: ItemFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { saveItem } = useItemMutations()
  const { saveField } = useFieldMutations()
  const { remove } = useItemActions()

  const schema = useMemo(() => buildItemSchema(t, fields), [fields, t])
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(schema),
    defaultValues: item ? itemToFormValues(item, fields) : emptyItemValues(fields),
    mode: "onBlur",
  })
  const { isDirty, isSubmitting, errors } = form.formState

  const [fieldPanelOpen, setFieldPanelOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)

  // Sair pela própria tela (salvou o novo, excluiu): a guarda de alterações sai antes, e a
  // navegação vem no efeito, depois que ela já saiu de verdade.
  const [leaveTo, setLeaveTo] = useState<{ path: string; state?: unknown } | null>(null)
  useEffect(() => {
    if (leaveTo) navigate(leaveTo.path, { replace: true, state: leaveTo.state })
  }, [leaveTo, navigate])

  const submit = useFormSubmit(form, async (values) => {
    let saved: ProductItemDetail
    try {
      saved = await saveItem(item?.id ?? null, itemFormToPayload(values, fields, item))
    } catch (cause) {
      if (markCustomFieldErrors(cause, fields, form.setError, t)) return
      throw cause
    }
    form.reset(itemToFormValues(saved, fields))
    toast.success(t(item ? "products.item.saved" : "products.item.created"))
    if (!item) setLeaveTo({ path: `/catalog/${saved.id}`, state: routeState })
  })

  // O botão de salvar fica na barra superior, longe do erro geral: o toast é o que a pessoa
  // vê, onde quer que tenha rolado a página.
  const rootError = errors.root?.message
  useEffect(() => {
    if (rootError) toast.error(rootError)
  }, [rootError])

  async function deleteItem() {
    if (item && (await remove(item))) setLeaveTo({ path: backTo })
  }

  async function createOption(field: ProductField, option: string) {
    try {
      await saveField(field.id, { optionValues: [...field.optionValues, option] })
      toast.success(t("products.fieldControl.optionCreated", { option }))
    } catch (cause) {
      toast.error(t("products.fieldControl.optionFailed"))
      throw cause
    }
  }

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: categoryPathLabel(categories, category),
      })),
    [categories]
  )

  const title = useWatch({ control: form.control, name: "title" })
  const pageTitle =
    title.trim() || t(item ? "products.item.untitled" : "products.item.newTitle")

  const saveLabel = t(item ? "products.item.save" : "products.list.create")
  const canSave = !item || isDirty

  const saveButton = (label: string) => (
    <Button
      disabled={!canSave}
      aria-busy={isSubmitting}
      className={isSubmitting ? "pointer-events-none opacity-80" : undefined}
      onClick={() => void submit()}
    >
      {isSubmitting ? <Loader2 className="animate-spin" /> : null}
      {label}
    </Button>
  )

  const menu = item ? (
    <ActionsMenu
      label={t("products.item.more")}
      className="size-8 pointer-coarse:size-10"
      actions={[
        {
          label: t("products.list.openLink"),
          icon: <ExternalLink />,
          hidden: !item.url,
          onSelect: () => window.open(item.url ?? undefined, "_blank", "noopener,noreferrer"),
        },
        {
          label: t("products.list.delete"),
          icon: <Trash2 />,
          destructive: true,
          separatorBefore: Boolean(item.url),
          onSelect: () => void deleteItem(),
        },
      ]}
    />
  ) : null

  return (
    <PageBody>
      <PageHeader
        title={pageTitle}
        backTo={backTo}
        parentTitle={t("navigation.catalog")}
        actions={
          <>
            <Button nativeButton={false} variant="outline" render={<Link to={backTo} />}>
              {t("kit.actions.cancel")}
            </Button>
            {saveButton(saveLabel)}
            {menu}
          </>
        }
        mobileActions={
          <>
            {saveButton(t(item ? "products.item.saveShort" : "products.item.createShort"))}
            {menu}
          </>
        }
        mobilePlacement="inline"
      />

      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {/* Enter num campo salva, como em qualquer formulário: o botão visível está na barra. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden />
        <FormError form={form} />

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
            <SectionCard title={t("products.item.sections.details")}>
              <div className="flex flex-col gap-4">
                <TextField
                  control={form.control}
                  name="title"
                  label={t("products.item.title")}
                  autoFocus={!item}
                  maxLength={ITEM_TITLE_MAX}
                  action={<LengthCounter control={form.control} name="title" max={ITEM_TITLE_MAX} />}
                />
                <TextareaField
                  control={form.control}
                  name="summary"
                  label={t("products.item.summary")}
                  hint={t("products.item.summaryHint")}
                  optional
                  showCount
                  maxLength={ITEM_SUMMARY_MAX}
                  rows={2}
                />
                <TextareaField
                  control={form.control}
                  name="description"
                  label={t("products.item.description")}
                  optional
                  rows={5}
                />
              </div>
            </SectionCard>

            <SectionCard
              title={t("products.item.sections.photos")}
              description={item ? undefined : t("products.images.newHint")}
            >
              <ImageGallery
                itemId={item?.id ?? null}
                title={pageTitle}
                images={item?.images ?? []}
                queue={queue}
              />
            </SectionCard>

            <SectionCard
              title={t("products.item.sections.fields")}
              actions={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="pointer-coarse:h-10"
                  onClick={() => setFieldPanelOpen(true)}
                >
                  <Plus />
                  {t("products.fields.create")}
                </Button>
              }
            >
              {fields.length === 0 ? (
                <p className="text-sm text-pretty text-muted-foreground">
                  {t("products.item.noFields")}
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {fields.map((field) => (
                    <CustomFieldControl
                      key={field.id}
                      control={form.control}
                      field={field}
                      onCreateOption={createOption}
                    />
                  ))}
                </div>
              )}
              {errors.customFields?.message ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {String(errors.customFields.message)}
                </p>
              ) : null}
            </SectionCard>
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:gap-6">
            <SectionCard title={t("products.item.sections.publishing")}>
              <div className="flex flex-col gap-4">
                <SwitchField
                  control={form.control}
                  name="active"
                  label={t("products.item.active")}
                  hint={t("products.item.activeHint")}
                />
                <TextField
                  control={form.control}
                  name="externalId"
                  label={t("products.item.sku")}
                  hint={t("products.item.skuHint")}
                  optional
                  placeholder={isAutoKey(item?.externalId) ? t("products.list.noSku") : undefined}
                />
                <TextField
                  control={form.control}
                  name="url"
                  label={t("products.item.url")}
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  optional
                  placeholder={t("products.fieldControl.urlPlaceholder")}
                />
              </div>
            </SectionCard>

            <SectionCard title={t("products.item.sections.organization")}>
              <div className="flex flex-col gap-4">
                <MultiSelectField
                  control={form.control}
                  name="categoryIds"
                  label={t("products.item.categories")}
                  options={categoryOptions}
                  placeholder={t("products.item.categoriesPlaceholder")}
                  emptyLabel={t("products.item.categoriesEmpty")}
                  action={
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto p-0"
                      onClick={() => setCategoryDialogOpen(true)}
                    >
                      {t("products.categories.create")}
                    </Button>
                  }
                />
                <ChipsField
                  control={form.control}
                  name="tags"
                  label={t("products.item.tags")}
                  hint={t("products.item.tagsHint")}
                  placeholder={t("products.item.tagsPlaceholder")}
                  max={ITEM_TAGS_MAX}
                  optional
                />
              </div>
            </SectionCard>
          </div>
        </div>
      </form>

      {/* Fora do `<form>`: são outros formulários, e o envio deles subiria por este na árvore
          do React, mesmo no portal. */}
      <CategoryFormDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        categories={categories}
        onSaved={(category) =>
          // Quem cadastra no meio do preenchimento quer usar a categoria neste item.
          form.setValue("categoryIds", [...form.getValues("categoryIds"), category.id], {
            shouldDirty: true,
          })
        }
      />
      <FieldFormPanel
        open={fieldPanelOpen}
        onOpenChange={setFieldPanelOpen}
        nextPosition={nextPosition(fields)}
        onSaved={(field) =>
          form.resetField(`customFields.${field.key}`, {
            defaultValue: toFieldValue(field.valueType, field.defaultValue),
          })
        }
      />

      <UnsavedChangesDialog when={!leaveTo && (isDirty || queue.hasUnsent)} />
    </PageBody>
  )
}

function LengthCounter({
  control,
  name,
  max,
}: {
  control: Control<ItemFormValues, unknown, ItemFormValues>
  name: "title"
  max: number
}) {
  const language = useLanguage()
  const value = useWatch({ control, name })

  return (
    <span className="text-xs leading-none text-muted-foreground tabular-nums">
      {formatNumber(value.length, language)}/{formatNumber(max, language)}
    </span>
  )
}

/**
 * O 422 de campo personalizado nomeia os campos num texto só ("têm valor inválido em: Preço,
 * Cor"). A tela sabe os nomes, então leva cada erro ao campo dele. Devolve `false` quando
 * não reconhece, e aí o erro segue o caminho normal.
 */
function markCustomFieldErrors(
  cause: unknown,
  fields: readonly ProductField[],
  setError: UseFormSetError<ItemFormValues>,
  t: (key: string, options?: Record<string, unknown>) => string
): boolean {
  if (!(cause instanceof ApiError)) return false

  const message = cause.details?.customFields?.[0]
  if (!message) return false

  const names = message
    .slice(message.lastIndexOf(":") + 1)
    .split(",")
    .map((name) => name.trim())
  const invalid = fields.filter((field) => names.includes(field.name))
  if (invalid.length === 0) return false

  invalid.forEach((field, index) => {
    setError(
      `customFields.${field.key}`,
      { type: "server", message: t("products.item.errors.fieldInvalid", { name: field.name }) },
      { shouldFocus: index === 0 }
    )
  })

  // O que veio junto, de outros campos, segue para o caminho normal.
  const { customFields: _handled, ...others } = cause.details ?? {}
  if (Object.keys(others).length > 0) {
    applyServerErrors(
      new ApiError({ status: cause.status, code: cause.code, details: others }),
      setError
    )
  }
  return true
}
