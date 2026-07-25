import {
  Hash,
  Image,
  List,
  Minus,
  MousePointerClick,
  Quote,
  Table,
  Type,
  type LucideIcon,
} from "lucide-react"

import type { BlockType } from "@/lib/doc"

/**
 * Os oito blocos, na ordem da barra e dos menus de inserção.
 * O nome visível vem de `editor.blocks.<type>` nos locales.
 */
export const BLOCK_TYPES: ReadonlyArray<{
  type: BlockType
  icon: LucideIcon
}> = [
  { type: "text", icon: Type },
  { type: "image", icon: Image },
  { type: "list", icon: List },
  { type: "stat", icon: Hash },
  { type: "quote", icon: Quote },
  { type: "divider", icon: Minus },
  { type: "table", icon: Table },
  { type: "button", icon: MousePointerClick },
]
