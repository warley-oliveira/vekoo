import { useId, type ReactNode } from "react"

/**
 * Parte dos campos do kit só ganha nome por um rótulo ligado ao `id`: `aria-label` não chega ao
 * `input`. Onde o rótulo não aparece na tela, ele existe só para o leitor de tela.
 */
export function HiddenLabel({
  text,
  children,
}: {
  text: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {text}
      </label>
      {children(id)}
    </>
  )
}
