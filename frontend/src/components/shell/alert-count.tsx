import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

const MAX_VISIBLE = 99

/**
 * Contagem de alertas de um item do menu. O número é visual; quem usa leitor de tela
 * ouve a frase inteira ("3 alertas"), dentro do próprio link.
 */
export function AlertCount({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  const { t } = useTranslation()
  if (count <= 0) return null

  return (
    <>
      <span
        aria-hidden
        className={cn(
          "flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-destructive/10 px-1 text-[11px] leading-none font-semibold text-destructive tabular-nums",
          className
        )}
      >
        {count > MAX_VISIBLE ? `${MAX_VISIBLE}+` : count}
      </span>
      <span className="sr-only">{t("navigation.alerts", { count })}</span>
    </>
  )
}

/** Ponto no ícone: há alerta aqui dentro. Só no trilho, onde o número não cabe. */
export function AlertDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive ring-2 ring-sidebar",
        className
      )}
    />
  )
}
