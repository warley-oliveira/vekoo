import { useState } from "react"
import { ImageOff, Package } from "lucide-react"

import { imageThumbSrc } from "@/lib/products/images"
import type { ProductImage } from "@/lib/products/types"
import { cn } from "@/lib/utils"

type ProductThumbProps = {
  image?: Pick<ProductImage, "thumbUrl" | "alt"> | null
  /** Quando a imagem não traz descrição própria: o nome do item. */
  alt: string
  className?: string
  iconClassName?: string
}

/**
 * A foto de um item: sempre a miniatura, porque a original pode ter 10 MB. Sem foto mostra
 * uma caixa; com link quebrado, avisa pelo ícone, para a pessoa saber que há algo a arrumar.
 */
export function ProductThumb({ image, alt, className, iconClassName }: ProductThumbProps) {
  const src = image ? imageThumbSrc(image) : null
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) {
    const Icon = src ? ImageOff : Package
    return (
      <div
        className={cn(
          "flex size-full items-center justify-center bg-muted text-muted-foreground/60",
          className
        )}
      >
        <Icon aria-hidden className={cn("size-6", iconClassName)} />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={image?.alt ?? alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedSrc(src)}
      className={cn("size-full object-cover", className)}
    />
  )
}
