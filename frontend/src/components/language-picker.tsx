import { useTranslation } from "react-i18next"

import { SUPPORTED_LANGUAGES, useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Troca de idioma em uma linha, para onde não cabe menu: o rodapé das telas
 * de entrada. Quem chega antes de ter conta também precisa poder trocar — a
 * detecção pelo navegador acerta na maioria das vezes, não em todas.
 *
 * A escolha vale para o aparelho (fica no localStorage, ver `lib/i18n.ts`) e
 * passa a mandar em cima do idioma do navegador.
 */
export function LanguagePicker({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const active = useLanguage()

  return (
    <div className={cn("flex items-center gap-1.5 text-xs", className)}>
      <span className="text-muted-foreground/80">{t("language.label")}</span>
      {SUPPORTED_LANGUAGES.map((code, index) => (
        <span key={code} className="flex items-center gap-1.5">
          {index > 0 && (
            <span className="text-muted-foreground/40" aria-hidden>
              ·
            </span>
          )}
          <button
            type="button"
            lang={code}
            onClick={() => i18n.changeLanguage(code)}
            aria-current={code === active ? "true" : undefined}
            className={cn(
              "rounded underline-offset-2 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              code === active
                ? "font-medium text-foreground"
                : "text-muted-foreground/80 hover:text-foreground hover:underline"
            )}
          >
            {t(`language.${code}`)}
          </button>
        </span>
      ))}
    </div>
  )
}
