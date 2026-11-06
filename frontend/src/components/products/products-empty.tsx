import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Plus, ScanSearch, ShoppingBag, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Catálogo vazio. Igual ao `EmptyState`, com duas saídas no lugar de uma: quem tem uma
 * planilha pronta não deveria ter de procurar como importar, e quem não tem começa por um
 * item só.
 */
/**
 * Filtro sem resultado. A grade procura por palavras, sem ranking; quando a pessoa digitou
 * algo, vale oferecer a busca dos fluxos, que pode achar pelo significado e diz como achou.
 */
export function ProductsNoResults({
  hasQuery,
  onClear,
  onSearchTest,
}: {
  hasQuery: boolean
  onClear: () => void
  onSearchTest: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t("products.list.noResults.title")}</h2>
        <p className="max-w-md text-sm text-pretty text-muted-foreground">
          {t(hasQuery ? "products.list.noResults.withQuery" : "products.list.noResults.description")}
        </p>
      </div>
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <Button variant="outline" className="pointer-coarse:h-10" onClick={onClear}>
          {t("kit.filters.clear")}
        </Button>
        {hasQuery ? (
          <Button variant="ghost" className="pointer-coarse:h-10" onClick={onSearchTest}>
            <ScanSearch />
            {t("products.menu.searchTest")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function ProductsEmpty({ onImport }: { onImport: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <ShoppingBag aria-hidden className="size-5 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t("products.list.empty.title")}</h2>
        <p className="max-w-md text-sm text-pretty text-muted-foreground">
          {t("products.list.empty.description")}
        </p>
      </div>
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <Button nativeButton={false} className="pointer-coarse:h-10" render={<Link to="/catalog/new" />}>
          <Plus />
          {t("products.list.create")}
        </Button>
        <Button variant="outline" className="pointer-coarse:h-10" onClick={onImport}>
          <Upload />
          {t("products.list.import")}
        </Button>
      </div>
    </div>
  )
}
