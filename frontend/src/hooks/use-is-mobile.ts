import { useMediaQuery } from "@/hooks/use-media-query"

/** Abaixo do `md` do Tailwind. O mesmo corte de `md:` no CSS. */
export const MOBILE_QUERY = "(max-width: 767.98px)"

/** Decisões de layout que o CSS não resolve: Sheet no lugar de Dialog, lista no lugar de tabela. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}
