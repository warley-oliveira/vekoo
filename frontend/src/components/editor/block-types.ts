import {
  Hash,
  Image,
  List,
  ListOrdered,
  Minus,
  MessageSquareQuote,
  MousePointerClick,
  Quote,
  Table,
  Tag,
  Type,
  type LucideIcon,
} from "lucide-react"

import type { BlockType } from "@/lib/doc"

/**
 * Os blocos, na ordem da barra e dos menus de inserção — dos que carregam
 * texto para os que só estruturam.
 * O nome visível vem de `editor.blocks.<type>` nos locales.
 */
export const BLOCK_TYPES: ReadonlyArray<{
  type: BlockType
  icon: LucideIcon
}> = [
  { type: "text", icon: Type },
  { type: "image", icon: Image },
  { type: "list", icon: List },
  { type: "steps", icon: ListOrdered },
  { type: "stat", icon: Hash },
  { type: "quote", icon: Quote },
  { type: "testimonial", icon: MessageSquareQuote },
  { type: "badge", icon: Tag },
  { type: "divider", icon: Minus },
  { type: "table", icon: Table },
  { type: "button", icon: MousePointerClick },
]
