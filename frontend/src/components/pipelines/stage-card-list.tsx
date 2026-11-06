import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { useBoardDrag } from "@/hooks/pipelines/use-board-drag"
import type { Card } from "@/lib/pipelines/types"
import type { BoardMeta } from "./pipeline-card"
import { SortableCard } from "./sortable-card"

// A lista de uma etapa longa, em páginas. Página longe da área visível vira um espaço do mesmo
// tamanho, sem nenhum card montado: abrir uma etapa com mil cards custa o mesmo que abrir uma com
// vinte, e o arraste só acompanha o que existe na tela.
//
// Por que não o Virtuoso: o dnd-kit desenha a cópia que segue o ponteiro enquanto o card arrastado
// estiver montado. Numa lista virtual, rolar para longe o desmontaria, e a cópia sumiria na mão da
// pessoa. Aqui a página do card no ar nunca sai.

const PAGE_SIZE = 20
/** Altura de um card antes de ser medido. Errar por pouco só ajusta a barra de rolagem depois. */
const ESTIMATED_CARD_HEIGHT = 96
const ROOT_MARGIN = "600px 0px"

type PageProps = {
  cards: Card[]
  stageId: string
  meta: BoardMeta
  /** A área que rola: é em relação a ela que a página está perto ou longe. */
  root: HTMLElement | null
  startsVisible: boolean
}

const CardPage = memo(function CardPage({ cards, stageId, meta, root, startsVisible }: PageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(startsVisible)
  const height = useRef(0)

  const ids = useMemo(() => new Set(cards.map((card) => card.id)), [cards])
  const holdsActive = useBoardDrag((state) => state.activeId !== null && ids.has(state.activeId))

  useEffect(() => {
    const node = ref.current
    if (!node || !root) return
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      { root, rootMargin: ROOT_MARGIN }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [root])

  const mounted = near || holdsActive

  useLayoutEffect(() => {
    if (mounted && ref.current) height.current = ref.current.offsetHeight
  })

  return (
    <div
      ref={ref}
      className="flex flex-col gap-2"
      style={
        mounted
          ? undefined
          : { height: height.current || cards.length * ESTIMATED_CARD_HEIGHT }
      }
    >
      {mounted
        ? cards.map((card) => (
            <SortableCard key={card.id} card={card} stageId={stageId} meta={meta} />
          ))
        : null}
    </div>
  )
})

type StageCardListProps = {
  cards: Card[]
  stageId: string
  meta: BoardMeta
  root: HTMLElement | null
}

export const StageCardList = memo(function StageCardList({
  cards,
  stageId,
  meta,
  root,
}: StageCardListProps) {
  const pages = useMemo(() => {
    if (cards.length <= PAGE_SIZE) return null
    const chunks: Card[][] = []
    for (let index = 0; index < cards.length; index += PAGE_SIZE) {
      chunks.push(cards.slice(index, index + PAGE_SIZE))
    }
    return chunks
  }, [cards])

  if (!pages) {
    return (
      <>
        {cards.map((card) => (
          <SortableCard key={card.id} card={card} stageId={stageId} meta={meta} />
        ))}
      </>
    )
  }

  return (
    <>
      {pages.map((page, index) => (
        <CardPage
          // Por índice: a página é um pedaço da lista, e não um grupo com identidade própria.
          key={index}
          cards={page}
          stageId={stageId}
          meta={meta}
          root={root}
          startsVisible={index === 0}
        />
      ))}
    </>
  )
})
