import { Fragment, type ReactNode } from "react"

import type { CarouselTheme, TextSpan } from "@/lib/doc"

// Renderiza trechos com marcas. Espelha exatamente o vocabulário de
// lib/rich-text.ts — o que o editor no lugar escreve é o que sai aqui.

function withBreaks(text: string): ReactNode {
  const lines = text.split("\n")
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ))
}

function SpanView({ span, theme }: { span: TextSpan; theme: CarouselTheme }) {
  let node: ReactNode = withBreaks(span.text)

  if (span.bold) node = <b className="font-bold">{node}</b>
  if (span.italic) node = <i className="italic">{node}</i>
  if (span.underline) node = <u className="underline underline-offset-[0.22em]">{node}</u>
  if (span.href) {
    // Link é parte da arte (a pessoa lê e digita), não um alvo clicável.
    node = <span className="underline underline-offset-[0.22em]">{node}</span>
  }
  if (span.color) {
    node = (
      <span
        className={span.color === "muted" ? "opacity-75" : undefined}
        style={span.color === "accent" ? { color: theme.accent } : undefined}
      >
        {node}
      </span>
    )
  }
  return <>{node}</>
}

export function SpansView({
  spans,
  theme,
}: {
  spans: TextSpan[]
  theme: CarouselTheme
}) {
  return (
    <>
      {spans.map((span, index) => (
        <SpanView key={index} span={span} theme={theme} />
      ))}
    </>
  )
}
