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

/** Botão de um aviso. `dismiss` apaga o aviso; os outros levam a `urlPath`. */
export type NotificationAction = {
  action: "open_chat" | "open_calendar" | "navigate" | "external_link" | "dismiss"
  title: string
  urlPath?: string
}

/**
 * Duas famílias na mesma lista de `GET /notifications`
 * (contrato em `docs/migration/api/access.md`):
 *
 * - aviso do produto (`key` preenchido): da organização, com o texto na tela, em
 *   `notifications.<key>.*`. Traz só os quatro primeiros campos;
 * - aviso da pessoa (`key: null`): já vem pronto do servidor, com o resto dos campos.
 */
export type AppNotification = {
  id: string
  key: NotificationKey | null
  at: number
  read: boolean
  title?: string
  description?: string | null
  /** Caminho interno (`/chat/123`) ou endereço externo. */
  url?: string | null
  category?: string
  actions?: NotificationAction[]
  readAt?: number | null
  archivedAt?: number | null
}

export type Credits = {
  total: number
  used: number
  /** `total - used`, calculado pelo servidor — não recalcule na tela. */
  left: number
}
