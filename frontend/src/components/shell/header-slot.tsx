import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { BottomSheet } from "@/components/shell/bottom-sheet"
import { useHeaderStore, useHeaderTitle } from "@/hooks/use-header-slot"
import { useMobileNav } from "@/hooks/use-mobile-nav"

const BASE_TITLE = document.title

/**
 * O `<title>` da aba acompanha o título da barra. Volta ao padrão fora da casca. É o único que
 * escreve o título dentro da casca: com mais de um, valia quem escrevesse por último, e a aba
 * da conversa ora dizia o nome do contato, ora "Chat".
 */
export function DocumentTitle(): null {
  const { title: headerTitle } = useHeaderTitle()
  const tabTitle = useHeaderStore((state) => state.tabTitle)
  const { t } = useTranslation()
  const title = tabTitle ?? headerTitle

  useEffect(() => {
    document.title = title ? t("navigation.documentTitle", { title }) : BASE_TITLE
  }, [title, t])

  useEffect(
    () => () => {
      document.title = BASE_TITLE
    },
    []
  )

  return null
}

/** As ações que a página injetou, na barra superior do desktop. */
export function HeaderSlotOutlet() {
  const node = useHeaderStore((state) => state.node)
  return <>{node}</>
}

/**
 * O padrão seguro no celular: as ações da página, empilhadas numa folha. Uma barra
 * horizontal vira coluna, o que nem sempre fica perfeito, mas nada se perde. Quem quer
 * algo próprio passa `mobileNode`.
 */
export function HeaderSlotSheet() {
  const { t } = useTranslation()
  const node = useHeaderStore((state) => state.node)
  const mobileNode = useHeaderStore((state) => state.mobileNode)
  const open = useMobileNav((state) => state.activeSheet === "headerSlot")
  const closeSheet = useMobileNav((state) => state.closeSheet)

  const content = mobileNode ?? node
  if (!content) return null

  return (
    <BottomSheet
      open={open}
      onClose={closeSheet}
      title={t("navigation.pageActions")}
      showTitle
      maxHeightRatio={0.8}
    >
      <div className="flex flex-col gap-2 pb-3 *:w-full">{content}</div>
    </BottomSheet>
  )
}
