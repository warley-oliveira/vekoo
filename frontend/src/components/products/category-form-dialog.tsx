import { useEffect, useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import {
  ComboboxField,
  FormActions,
  ResponsiveDialog,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { useCategoryMutations } from "@/hooks/products/use-products"
import {
  categoryPathLabel,
  nextSiblingPosition,
  subtreeOf,
} from "@/lib/products/category-tree"
import type { ProductCategory } from "@/lib/products/types"

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t("products.categories.errors.nameRequired")),
    parentId: z.string().nullable(),
  })
}

type CategoryFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: readonly ProductCategory[]
  /** Editando: renomear e mover são a mesma ação. Sem ela, é cadastro. */
  category?: ProductCategory | null
  /** Onde a categoria nova nasce: "Adicionar subcategoria". */
  defaultParentId?: string | null
  onSaved?: (category: ProductCategory) => void
}

/** Cadastrar, renomear e mover. Serve à tela de categorias e à tela do item. */
export function CategoryFormDialog({
  open,
  onOpenChange,
  categories,
  category = null,
  defaultParentId = null,
  onSaved,
}: CategoryFormDialogProps) {
  const { t } = useTranslation()
  const { saveCategory } = useCategoryMutations()

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", parentId: null },
    mode: "onBlur",
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      name: category?.name ?? "",
      parentId: category ? category.parentId : defaultParentId,
    })
  }, [category, defaultParentId, form, open])

  // Uma categoria não pode ficar dentro de si mesma nem do próprio ramo. O servidor também
  // recusa; aqui é para a opção nem aparecer.
  const parentOptions = useMemo(() => {
    const blocked = new Set(category ? subtreeOf(categories, category).map((item) => item.id) : [])
    return categories
      .filter((candidate) => !blocked.has(candidate.id))
      .map((candidate) => ({
        value: candidate.id,
        label: categoryPathLabel(categories, candidate),
      }))
  }, [categories, category])

  const submit = useFormSubmit(form, async ({ name, parentId }) => {
    const moved = !category || category.parentId !== parentId
    const saved = await saveCategory(category?.id ?? null, {
      name,
      parentId,
      // Quem chega a um nível novo entra depois das que já estavam lá.
      ...(moved ? { position: nextSiblingPosition(categories, parentId) } : {}),
    })
    toast.success(t(category ? "products.categories.saved" : "products.categories.created", { name: saved.name }))
    onSaved?.(saved)
    onOpenChange(false)
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t(category ? "products.categories.editTitle" : "products.categories.createTitle")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t(category ? "products.categories.save" : "products.categories.create")}
          onCancel={() => onOpenChange(false)}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          control={form.control}
          name="name"
          label={t("products.categories.name")}
          autoFocus
          maxLength={200}
        />
        <ComboboxField
          control={form.control}
          name="parentId"
          label={t("products.categories.parent")}
          hint={t("products.categories.parentHint")}
          options={parentOptions}
          clearable
          placeholder={t("products.categories.root")}
        />
      </div>
    </ResponsiveDialog>
  )
}
