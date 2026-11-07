import { lazy } from "react"

import type { ChatVariant } from "../chat-variant"
import { MobileThreadHeaderSkeleton } from "./thread-header-skeleton"

const loadThreadHeader = () => import("./thread-header")
const loadComposerBox = () => import("./composer-box")
const loadMessageSheet = () => import("./message-sheet")
const loadSwipeReply = () => import("./swipe-reply")
const loadSelectionChrome = () => import("./selection-chrome")

/** As peças do celular. Módulo constante: o contexto nunca muda de valor e não desenha ninguém. */
export const MOBILE_VARIANT: ChatVariant = {
  ThreadHeader: lazy(loadThreadHeader),
  ThreadHeaderSkeleton: MobileThreadHeaderSkeleton,
  ComposerBox: lazy(loadComposerBox),
  MessageSheet: lazy(loadMessageSheet),
  SwipeReply: lazy(loadSwipeReply),
  SelectionChrome: lazy(loadSelectionChrome),
}

/**
 * A conversa desce antes de ser pedida, com o aparelho à toa: tocar numa linha precisa responder na
 * hora, e não esperar a rede do celular.
 */
export function preloadThreadParts() {
  void import("../thread/chat-thread")
  void loadThreadHeader()
  void loadComposerBox()
  void loadMessageSheet()
  void loadSwipeReply()
}
