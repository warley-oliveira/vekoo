import { useEffect, useRef, useState } from "react"
import { Navigate, useParams, useSearchParams } from "@/lib/router"

import { CardGridSkeleton, PageBody } from "@/components/shared"
import { BoardWorkspace } from "@/components/pipelines/board-workspace"
import { BoardsOverview } from "@/components/pipelines/boards-overview"
import { useBoards } from "@/hooks/pipelines/use-boards"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { boardViewUrl, parseBoardView } from "@/lib/pipelines/paths"

const LAST_BOARD_KEY = "vekoo.pipelines.lastBoard"

/**
 * `/pipelines`, sozinho, leva ao último pipeline aberto ou ao primeiro. Vindo de dentro de um
 * pipeline, ou com `?all=1`, é a lista de todos: "Todos os pipelines" no menu aponta para
 * este mesmo endereço, e a pessoa pediu para ver a lista, não para voltar ao que já estava aberto.
 */
export default function PipelinesPage() {
  const { boardId, view } = useParams<{ boardId?: string; view?: string }>()
  const [searchParams] = useSearchParams()
  const [lastBoardId, setLastBoardId] = useLocalStorage<string | null>(LAST_BOARD_KEY, null)
  const [createOpen, setCreateOpen] = useState(false)

  const visitedBoard = useRef(false)
  if (boardId) visitedBoard.current = true

  useEffect(() => {
    if (boardId) setLastBoardId(boardId)
  }, [boardId, setLastBoardId])

  const wantsAll = visitedBoard.current || searchParams.has("all")
  const { boards, isLoading } = useBoards()

  if (boardId) {
    return <BoardWorkspace key={boardId} boardId={boardId} view={parseBoardView(view)} />
  }

  if (!wantsAll) {
    if (isLoading) {
      return (
        <PageBody variant="wide">
          <CardGridSkeleton cards={3} />
        </PageBody>
      )
    }
    const target = boards.find((board) => board.id === lastBoardId) ?? boards[0]
    if (target) return <Navigate replace to={boardViewUrl(target.id)} />
  }

  return <BoardsOverview createOpen={createOpen} onCreateOpenChange={setCreateOpen} />
}
