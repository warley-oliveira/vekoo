import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

/**
 * Contêiner dos esqueletos: anuncia "carregando" uma vez para o leitor de tela, em
 * vez de ele percorrer dezenas de retângulos vazios.
 */
export function LoadingRegion({ children, ...props }: ComponentProps<"div">) {
  const { t } = useTranslation()

  return (
    <div role="status" aria-busy="true" {...props}>
      <span className="sr-only">{t("kit.loading")}</span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  )
}
