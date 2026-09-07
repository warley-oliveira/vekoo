import type { CarouselCard, CarouselFormat, CarouselTheme } from "@/lib/doc"

// A forma dos dados que a API devolve.
//
// O Rails serializa em camelCase e com datas em **milissegundos** justamente
// para caber aqui sem tradução — `editedAt: number` alimenta o `Intl` das telas
// direto. Estes tipos são o contrato: se um deles mudar, é porque o serializer
// mudou.

export type Carousel = {
  id: string
  title: string
  format: CarouselFormat
  theme: CarouselTheme
  cards: CarouselCard[]
  /** Legenda do post — o texto que acompanha as imagens no Instagram. */
  caption?: string
  folderId: string | null
  favorite: boolean
  editedAt: number
  trashedAt: number | null
}

/**
 * O que `GET /carousels` devolve: o documento com **só o primeiro card**, que é
 * o que a grade desenha. `cardCount` diz quantos existem de verdade.
 *
 * Quem precisa do documento inteiro (o editor) pede `GET /carousels/:id`.
 */
export type CarouselSummary = Carousel & { cardCount: number }

export type Folder = {
  id: string
  name: string
  color: string
  createdAt: number
  /** Quantos carrosséis ativos a pasta tem — contado pelo servidor. */
  carouselCount: number
}

/** Chave de tradução da notificação (`notifications.<key>.title|body`). */
export type NotificationKey = "templates" | "folders" | "welcome"

export type AppNotification = {
  id: string
  key: NotificationKey
  at: number
  read: boolean
}

export type Credits = {
  total: number
  used: number
  /** `total - used`, calculado pelo servidor — não recalcule na tela. */
  left: number
}
