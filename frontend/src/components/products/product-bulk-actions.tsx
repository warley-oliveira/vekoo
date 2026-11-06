import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CirclePause, CirclePlay, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { fetchAllItemIds, useItemMutations } from "@/hooks/products/use-products"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

type ProductBulkActionsProps = {
  ids: string[]
  /** A pessoa escolheu "todos os resultados": os ids vêm da consulta, e não só do que carregou. */
  allMatching?: boolean
  /** A consulta atual da grade, de onde saem os ids em `allMatching`. */
  listPath: string
  /** Quantos a barra anuncia, para o texto do toast antes de resolver os ids. */
  count: number
  onDone: () => void
}

/** Ativar, desativar e excluir vários. O desfecho vem em toast, inclusive o parcial. */
export function ProductBulkActions({
  ids,
  allMatching = false,
  listPath,
  count,
  onDone,
}: ProductBulkActionsProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { setItemsActive, deleteItems } = useItemMutations()
  const [busy, setBusy] = useState<"activate" | "deactivate" | null>(null)

  const resolveIds = () => (allMatching ? fetchAllItemIds(listPath) : Promise.resolve(ids))
  const interpolation = (value: number) => ({
    count: value,
    formatted: formatNumber(value, language),
  })

  async function setActive(active: boolean) {
    setBusy(active ? "activate" : "deactivate")
    try {
      const { succeeded, failed } = await setItemsActive(await resolveIds(), active)
      if (failed.length === 0) {
        toast.success(
          t(active ? "products.bulk.activated" : "products.bulk.deactivated", {
            ...interpolation(succeeded.length),
          })
        )
        onDone()
      } else {
        toast.warning(
          t("products.bulk.partial", {
            done: formatNumber(succeeded.length, language),
            ...interpolation(failed.length),
          })
        )
      }
    } catch {
      toast.error(t("products.bulk.failed"))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    let deleted = 0
    const confirmed = await confirm({
      title: t("products.bulk.deleteTitle", interpolation(count)),
      description: t("products.bulk.deleteHint"),
      confirmLabel: t("products.bulk.delete", interpolation(count)),
      destructive: true,
      onConfirm: async () => {
        deleted = await deleteItems(await resolveIds())
      },
    })
    if (confirmed) {
      toast.success(t("products.bulk.deleted", interpolation(deleted)))
      onDone()
    }
  }

  const disabled = busy !== null
  // No celular a barra é estreita: fica só o ícone, com o nome para o leitor de tela.
  const label = "hidden sm:inline"

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-label={t("products.bulk.activate")}
        onClick={() => void setActive(true)}
      >
        {busy === "activate" ? <Loader2 className="animate-spin" /> : <CirclePlay />}
        <span className={label}>{t("products.bulk.activate")}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-label={t("products.bulk.deactivate")}
        onClick={() => void setActive(false)}
      >
        {busy === "deactivate" ? <Loader2 className="animate-spin" /> : <CirclePause />}
        <span className={label}>{t("products.bulk.deactivate")}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        aria-label={t("products.bulk.deleteShort")}
        className="text-destructive hover:text-destructive"
        onClick={() => void remove()}
      >
        <Trash2 />
        <span className={label}>{t("products.bulk.deleteShort")}</span>
      </Button>
    </>
  )
}
