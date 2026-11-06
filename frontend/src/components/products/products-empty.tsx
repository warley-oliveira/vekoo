import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Plus, ShoppingBag, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Catálogo vazio. Igual ao `EmptyState`, com duas saídas no lugar de uma: quem tem uma
 * planilha pronta não deveria ter de procurar como importar, e quem não tem começa por um
 * item só.
 */
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
