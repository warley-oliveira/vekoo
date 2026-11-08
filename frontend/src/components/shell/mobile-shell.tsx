import { useEffect, useLayoutEffect } from "react"
import { useLocation } from "@/lib/router"

import { SHEET_EXIT_MS } from "@/components/shell/bottom-sheet"
import { HeaderSlotSheet } from "@/components/shell/header-slot"
import { MobileBottomNav } from "@/components/shell/mobile-bottom-nav"
import { MoreSheet } from "@/components/shell/more-sheet"
import { PipelinesSheet } from "@/components/shell/pipelines-sheet"
import { useAppShell } from "@/hooks/use-app-shell"
import { useMobileNav } from "@/hooks/use-mobile-nav"
import { useMobileShell } from "@/hooks/use-mobile-shell"
import { installBackStack } from "@/lib/back-stack"

const BOTTOM_NAV_TOTAL_VAR = "--app-bottom-nav-total"
const BOTTOM_NAV_TOTAL = "calc(var(--app-bottom-nav-h) + var(--app-safe-bottom))"

/**
 * A barra inferior e as folhas. Só existe abaixo de 1024 px: a barra lateral nem monta,
 * e o inverso também, para não duplicar requisição nem assinatura.
 */
export function MobileShell({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { pathname } = useLocation()
  const { isKeyboardOpen } = useMobileShell()
  const immersive = useAppShell((shell) => shell.immersive)
  const pendingSheet = useMobileNav((state) => state.pendingSheet)
  const commitPendingSheet = useMobileNav((state) => state.commitPendingSheet)
  const closeSheet = useMobileNav((state) => state.closeSheet)
  const reset = useMobileNav((state) => state.reset)

  // A folga que a barra tira do fim do conteúdo. Com a barra fora de cena não há o que
  // reservar. Fora do shell móvel a variável volta a `0px`, pelo `:root`.
  // `useLayoutEffect`: quem mede altura em efeito normal já lê o valor novo.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.style.setProperty(
      BOTTOM_NAV_TOTAL_VAR,
      immersive || isKeyboardOpen ? "0px" : BOTTOM_NAV_TOTAL
    )
    return () => {
      root.style.removeProperty(BOTTOM_NAV_TOTAL_VAR)
    }
  }, [immersive, isKeyboardOpen])

  // O voltar do aparelho fecha o que está por cima, um passo de cada vez, no app todo.
  useEffect(() => installBackStack(), [])

  // Encadeia a troca de folha: espera a atual sair antes de abrir a próxima. O atraso
  // não é cosmético: abrir no mesmo tick faria o `history.back()` de quem saiu cair em
  // cima do `pushState` de quem entra, e a folha nova fecharia sozinha.
  useEffect(() => {
    if (!pendingSheet) return
    const timer = window.setTimeout(commitPendingSheet, SHEET_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [pendingSheet, commitPendingSheet])

  // Navegou: qualquer folha aberta perdeu o sentido.
  useEffect(() => {
    closeSheet()
  }, [pathname, closeSheet])

  // Girar para a largura de desktop ou sair da conta.
  useEffect(() => reset, [reset])

  return (
    <>
      <MobileBottomNav />
      <MoreSheet
        onOpenSearch={() => {
          closeSheet()
          onOpenSearch()
        }}
      />
      <PipelinesSheet />
      <HeaderSlotSheet />
    </>
  )
}
