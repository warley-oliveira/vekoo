import { useOptionalApi } from "@/hooks/use-api"
import { useCan } from "@/hooks/use-can"

/** O mínimo que o menu precisa. O domínio de pipelines estende na própria tela. */
export type PipelineBoard = {
  id: string
  name: string
}

type BoardsResponse = { boards: PipelineBoard[] }

/** Chave no SWR: quem cria, renomeia ou arquiva um quadro invalida esta. */
export const PIPELINE_BOARDS_KEY = "/pipelines/boards"

const EMPTY_RESPONSE: BoardsResponse = { boards: [] }
const NO_BOARDS: PipelineBoard[] = []

/**
 * Os quadros de pipeline: sub-itens do menu e seletor do celular. Enquanto a API não
 * existir, o 404 vale como lista vazia, sem erro visível. Sem acesso a pipelines, nem
 * chama o servidor.
 */
export function usePipelineBoards() {
  const allowed = useCan("pipelines")
  const { data, error, isLoading, mutate } = useOptionalApi<BoardsResponse>(
    allowed ? PIPELINE_BOARDS_KEY : null,
    EMPTY_RESPONSE,
    { revalidateOnFocus: false }
  )

  return {
    boards: data?.boards ?? NO_BOARDS,
    isLoading,
    error,
    reload: () => mutate(),
  }
}
