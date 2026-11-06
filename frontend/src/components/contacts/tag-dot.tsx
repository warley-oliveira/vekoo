/** A cor da etiqueta numa lista de opções. É escolha da pessoa, então vem como dado. */
export function TagDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
  )
}
