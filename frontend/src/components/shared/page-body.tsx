import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const VARIANTS = {
  /** Listas e formulários: a largura de leitura confortável. */
  default: "max-w-6xl",
  /** Tabelas largas e painéis com muitas colunas. */
  wide: "max-w-[96rem]",
  /** Quadros e o que precisa da tela inteira. */
  full: "max-w-none",
} as const

export type PageBodyProps = ComponentProps<"div"> & {
  variant?: keyof typeof VARIANTS
}

/**
 * Contêiner de toda página: largura, respiro e espaço entre as seções. Vai direto
 * dentro da rota, com o `PageHeader` como primeiro filho.
 */
export function PageBody({ variant = "default", className, ...props }: PageBodyProps) {
  return (
    <div
      data-slot="page-body"
      // `relative` segura os `sr-only`: sem um ancestral posicionado, eles escapam do
      // rolável da página e esticam o documento, criando uma segunda barra de rolagem.
      className={cn(
        "relative mx-auto flex w-full flex-col gap-6 px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:gap-8 md:px-6",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  )
}
