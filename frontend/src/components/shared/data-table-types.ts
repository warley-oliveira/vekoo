import type { ReactNode } from "react"
import type { ColumnDef, RowData } from "@tanstack/react-table"

import type { PaginationMeta } from "@/lib/api"
import type { EmptyStateProps } from "@/components/empty-state"
import type { RowAction } from "./actions-menu"
import type { BulkLabelAmount } from "./bulk-actions-bar"
import type { FacetOption } from "./faceted-filter"

export type ColumnFilterConfig =
  /** Texto livre: contém, sem diferenciar acento nem caixa. */
  | { type: "text"; placeholder?: string }
  /** Uma ou mais opções. */
  | { type: "select"; options: FacetOption[] }
  /** Período; o valor da coluna precisa ser data, ms ou ISO. */
  | { type: "dateRange" }

/** Como a coluna aparece na lista empilhada do celular. */
export type ColumnMobileRole =
  /** O título da linha. Sem nenhuma marcada, é a primeira coluna de dados. */
  | "primary"
  /** Linha de apoio logo abaixo do título, sem rótulo. */
  | "secondary"
  /** Par rótulo e valor abaixo. É o padrão. */
  | "meta"
  /** Só aparece na tabela do desktop. */
  | "hidden"

declare module "@tanstack/react-table" {
  // Os nomes dos parâmetros precisam ser idênticos aos da biblioteca para o `merge`.
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Nome da coluna em filtros, no celular e para leitores de tela. */
    label?: string
    align?: "left" | "right" | "center"
    /** Filtro no cabeçalho. Com API, a tela aplica; sem API, o `DataTable` aplica. */
    filter?: ColumnFilterConfig
    mobile?: ColumnMobileRole
    /** Como dizer a ordem no celular: "Mais recentes" diz mais que "decrescente". */
    sortLabels?: { asc: string; desc: string }
    /** Classes do `th` e do `td`: largura, `whitespace-normal`. */
    className?: string
    /** Sobre `TData` e `TValue`: só para o TypeScript aceitar a extensão. */
    __types?: [TData, TValue]
  }
}

export type TableDensity = "comfortable" | "compact"

export type BulkActionsContext<TData> = {
  /** Ids selecionados, inclusive de outras páginas. */
  ids: string[]
  /** Linhas selecionadas que estão carregadas. Numa API paginada, só as da página atual. */
  rows: TData[]
  /** A pessoa escolheu "todos os resultados": a ação vale para o filtro, não para `ids`. */
  allMatching: boolean
  /** Desfaz a seleção; chame depois que a ação terminar. */
  clear: () => void
}

export type DataTableProps<TData> = {
  /** Defina fora do componente ou em `useMemo`. */
  columns: ColumnDef<TData, any>[]
  data: TData[]
  /** Padrão: `row.id`. Precisa ser estável, para a seleção sobreviver à troca de página. */
  getRowId?: (row: TData) => string

  /* Estados */
  /** Primeira carga: esqueleto no lugar das linhas. */
  isLoading?: boolean
  /** Buscando a próxima página ou revalidando: as linhas atuais ficam, esmaecidas. */
  isFetching?: boolean
  error?: unknown
  onRetry?: () => void
  /** Conteúdo do estado vazio, quando não há nada mesmo. */
  empty?: EmptyStateProps
  /** Há filtro aplicado de fora (`FilterBar`): vazio aqui é "sem resultado", não "sem dados". */
  isFiltered?: boolean
  onClearFilters?: () => void

  /* Paginação: com `meta` ou `onPageChange`, tudo (ordem e filtro) vem do servidor */
  meta?: PaginationMeta
  onPageChange?: (page: number) => void
  onPerPageChange?: (perPage: number) => void
  /** Tamanho inicial da página, no modo local. */
  pageSize?: number
  perPageOptions?: number[]

  /* Ordenação e filtro por coluna: controlados ou por conta do componente */
  sorting?: { id: string; desc: boolean }[]
  onSortingChange?: (sorting: { id: string; desc: boolean }[]) => void
  defaultSorting?: { id: string; desc: boolean }[]
  columnFilters?: { id: string; value: unknown }[]
  onColumnFiltersChange?: (filters: { id: string; value: unknown }[]) => void
  /** Texto da busca do `FilterBar`, para filtrar no próprio navegador. */
  globalFilter?: string

  /* Seleção */
  selectable?: boolean
  rowSelection?: Record<string, boolean>
  onRowSelectionChange?: (selection: Record<string, boolean>) => void
  canSelectRow?: (row: TData) => boolean
  /** Botões da barra de ações em lote, que aparece ao selecionar. */
  bulkActions?: (context: BulkActionsContext<TData>) => ReactNode
  /** O que está selecionado, com gênero e plural: `(amount) => t("x.selected", amount)`. */
  bulkLabel?: (amount: BulkLabelAmount) => string
  /** Oferece "selecionar todos os N resultados" além da página. Só com `meta`. */
  selectAllMatching?: boolean

  /* Linhas */
  /** Menu "..." de cada linha. */
  rowActions?: (row: TData) => RowAction[]
  /** A linha inteira responde ao clique e ao Enter. */
  onRowClick?: (row: TData) => void
  rowClassName?: (row: TData) => string | undefined

  /* Aparência */
  /** Fixa a densidade e esconde o botão de alternar. */
  density?: TableDensity
  /** Altura máxima antes de rolar por dentro, mantendo cabeçalho e rodapé à vista. */
  maxHeight?: string
  "aria-label"?: string
  className?: string
}
