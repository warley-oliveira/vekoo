import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { ContactSelection } from "@/hooks/contacts/use-contact-selection"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type SelectionBannerProps = {
  selection: ContactSelection
  /** Quantos estão na página. */
  pageSize: number
  /** Quantos o filtro alcança, do que a pessoa pode ver. */
  total: number
}

/**
 * Passar da página para todos do filtro. No desktop só aparece com a página marcada; no celular
 * a lista empilhada não tem o quadrado do cabeçalho, então é daqui que se marca a página. O texto
 * nunca diz "todos da organização": quem decide o que entra é o servidor.
 */
export function SelectionBanner({ selection, pageSize, total }: SelectionBannerProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isMobile = useIsMobile()

  const amount = (count: number) => ({ count, formatted: formatNumber(count, language) })
  const hasMore = total > pageSize
  const { allMatching, pageSelected, pagePartlySelected, excludedCount } = selection

  const message = allMatching
    ? excludedCount > 0
      ? t("contacts.selection.allExcept", {
          ...amount(total),
          excluded: formatNumber(excludedCount, language),
        })
      : t("contacts.selection.all", amount(total))
    : pageSelected && hasMore
      ? t("contacts.selection.page", amount(pageSize))
      : null

  const offerAll = !allMatching && pageSelected && hasMore

  if (!isMobile && !message) return null
  if (pageSize === 0) return null

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
        // Sem recado, no celular é só o quadrado de marcar: não pede fundo.
        message ? "rounded-lg bg-muted/50 px-3 py-2" : "px-3"
      )}
    >
      {isMobile ? (
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5">
          <Checkbox
            className="border-muted-foreground/40 data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground"
            checked={pageSelected}
            indeterminate={pagePartlySelected}
            onCheckedChange={(checked) => selection.togglePage(Boolean(checked))}
          />
          <span>{t("contacts.selection.selectPage")}</span>
        </label>
      ) : null}

      {message ? <span className="min-w-0 text-pretty text-muted-foreground">{message}</span> : null}

      {offerAll ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 pointer-coarse:min-h-10"
          onClick={selection.selectAllMatching}
        >
          {t("contacts.selection.selectAll", amount(total))}
        </Button>
      ) : null}

      {allMatching ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 pointer-coarse:min-h-10"
          onClick={selection.clear}
        >
          {t("contacts.selection.clear")}
        </Button>
      ) : null}
    </div>
  )
}
