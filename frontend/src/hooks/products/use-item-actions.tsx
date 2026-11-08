import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@/lib/router"
import { CheckSquare, CirclePause, CirclePlay, ExternalLink, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useConfirm, type RowAction } from "@/components/shared"
import { useIsTouch } from "@/hooks/use-media-query"
import { useItemMutations } from "@/hooks/products/use-products"
import type { ProductItem } from "@/lib/products/types"

type ItemActionsOptions = {
  /** O caminho de volta depois de abrir o item: mantém os filtros da grade. */
  from?: string
  /** No toque não há passar o mouse: selecionar também sai do menu. */
  onSelect?: (item: ProductItem) => void
}

/** As ações de um item, iguais no card e na linha da tabela. */
export function useItemActions({ from, onSelect }: ItemActionsOptions = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const isTouch = useIsTouch()
  const { setItemActive, deleteItem } = useItemMutations()

  const toggleActive = useCallback(
    async (item: ProductItem) => {
      const next = !item.active
      try {
        await setItemActive(item.id, next)
        toast.success(
          t(next ? "products.list.activated" : "products.list.deactivated", { title: item.title })
        )
      } catch {
        toast.error(t("products.list.statusFailed"))
      }
    },
    [setItemActive, t]
  )

  const remove = useCallback(
    async (item: Pick<ProductItem, "id" | "title">) => {
      const confirmed = await confirm({
        title: t("products.list.deleteTitle", { title: item.title }),
        description: t("products.list.deleteHint"),
        confirmLabel: t("products.list.delete"),
        destructive: true,
        onConfirm: () => deleteItem(item.id),
      })
      if (confirmed) toast.success(t("products.list.deleted", { title: item.title }))
      return confirmed
    },
    [confirm, deleteItem, t]
  )

  const actionsFor = useCallback(
    (item: ProductItem): RowAction[] => [
      {
        label: t("products.list.edit"),
        icon: <Pencil />,
        onSelect: () => navigate(`/catalog/${item.id}`, { state: { from } }),
      },
      {
        label: t(item.active ? "products.list.deactivate" : "products.list.activate"),
        icon: item.active ? <CirclePause /> : <CirclePlay />,
        onSelect: () => void toggleActive(item),
      },
      {
        label: t("products.list.openLink"),
        icon: <ExternalLink />,
        hidden: !item.url,
        onSelect: () => window.open(item.url ?? undefined, "_blank", "noopener,noreferrer"),
      },
      {
        label: t("products.list.select"),
        icon: <CheckSquare />,
        hidden: !isTouch || !onSelect,
        onSelect: () => onSelect?.(item),
      },
      {
        label: t("products.list.delete"),
        icon: <Trash2 />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => void remove(item),
      },
    ],
    [from, isTouch, navigate, onSelect, remove, t, toggleActive]
  )

  return { actionsFor, toggleActive, remove }
}
