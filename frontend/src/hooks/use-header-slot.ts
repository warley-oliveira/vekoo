import { useLayoutEffect, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { create } from "zustand"

// O que a página põe na barra superior. A barra e a página são irmãs (o `Outlet` não
// é ancestral do cabeçalho), então o caminho é um store: a página escreve ao montar e
// limpa ao desmontar. Só as folhas que desenham o cabeçalho assinam, nenhuma re-render
// sobe de volta para a página.

/**
 * Como o cabeçalho do celular mostra as ações da página:
 * - `overflow` (padrão): botão "Ações da página", que abre uma folha com o `node`
 *   empilhado. Nem sempre fica perfeito, mas nada se perde, que é o requisito.
 * - `inline`: na própria linha do cabeçalho, para uma ação principal curta.
 * - `toolbar`: segunda linha com rolagem horizontal, para filtros em chips.
 * - `hidden`: a página cuida do celular por conta própria.
 */
export type HeaderSlotPlacement = "overflow" | "inline" | "toolbar" | "hidden"

export type HeaderSlotOptions = {
  /** Versão própria para o celular. Sem ela, usa o `node`. */
  mobileNode?: ReactNode
  mobilePlacement?: HeaderSlotPlacement
}

export type PageTitleOptions = {
  /** Bolinha de cor antes do título (cor escolhida pela pessoa, como pasta). */
  color?: string
  /** Mostra "voltar" no cabeçalho, para este caminho. */
  backTo?: string
  /** Texto da área de origem, acima do título no celular. */
  parentTitle?: string
}

type HeaderState = {
  routeTitleKey: string | null
  page: (PageTitleOptions & { title: string }) | null
  /** Só para a aba do navegador: ver `useTabTitle`. */
  tabTitle: string | null
  node: ReactNode
  mobileNode: ReactNode
  mobilePlacement: HeaderSlotPlacement
}

export const useHeaderStore = create<HeaderState>()(() => ({
  routeTitleKey: null,
  page: null,
  tabTitle: null,
  node: null,
  mobileNode: null,
  mobilePlacement: "overflow",
}))

/**
 * Injeta ações na barra superior enquanto a página estiver montada.
 *
 *     useHeaderSlot(<Button onClick={save}>{t("x.save")}</Button>)
 *     useHeaderSlot(<Filters />, { mobilePlacement: "toolbar" })
 *
 * Escreve a cada render de propósito: assim o nó nunca fica com um closure velho e a
 * página não precisa de `useMemo`. O elemento monta dentro do cabeçalho; um hook usado
 * nele roda lá, com acesso a SWR, rota e `useShell`.
 */
export function useHeaderSlot(node: ReactNode, options?: HeaderSlotOptions): void {
  useLayoutEffect(() => {
    useHeaderStore.setState({
      node,
      mobileNode: options?.mobileNode ?? null,
      mobilePlacement: options?.mobilePlacement ?? "overflow",
    })
  })

  useLayoutEffect(
    () => () => {
      useHeaderStore.setState({
        node: null,
        mobileNode: null,
        mobilePlacement: "overflow",
      })
    },
    []
  )
}

/**
 * Troca o título que a rota declarou por um que só a página conhece (nome da pasta,
 * do fluxo, do contato), na barra superior e na aba do navegador. `null`/vazio devolve
 * o título da rota.
 */
export function usePageTitle(
  title: string | null | undefined,
  options?: PageTitleOptions
): void {
  const color = options?.color
  const backTo = options?.backTo
  const parentTitle = options?.parentTitle

  // Antes da pintura: o título da rota não pisca antes do nome da pasta.
  useLayoutEffect(() => {
    useHeaderStore.setState({
      page: title ? { title, color, backTo, parentTitle } : null,
    })
    return () => useHeaderStore.setState({ page: null })
  }, [title, color, backTo, parentTitle])
}

/**
 * Muda só a aba do navegador, e a barra superior continua com o título da tela: é a conversa
 * aberta, numa tela que segue chamada "Chat".
 */
export function useTabTitle(title: string | null | undefined): void {
  useLayoutEffect(() => {
    useHeaderStore.setState({ tabTitle: title || null })
    return () => useHeaderStore.setState({ tabTitle: null })
  }, [title])
}

/** Uso interno de `RouteFrame`: o título que cada rota declara. */
export function useRouteTitle(titleKey: string): void {
  useLayoutEffect(() => {
    useHeaderStore.setState({ routeTitleKey: titleKey })
  }, [titleKey])
}

/** Uso interno dos cabeçalhos: o título a mostrar, já traduzido. */
export function useHeaderTitle() {
  const { t } = useTranslation()
  const page = useHeaderStore((state) => state.page)
  const routeTitleKey = useHeaderStore((state) => state.routeTitleKey)

  return {
    title: page?.title ?? (routeTitleKey ? t(routeTitleKey) : ""),
    color: page?.color,
    backTo: page?.backTo,
    parentTitle: page?.parentTitle,
  }
}
