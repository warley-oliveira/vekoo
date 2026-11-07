import { memo, type ComponentProps } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { CardEmpty } from "@/components/dashboard/chart-card"
import { resolveColor } from "@/lib/custom-dashboards/palette"
import type { VisualConfig } from "@/lib/custom-dashboards/types"

const DEFAULT_TEXT_SIZE = 14

// Texto da pessoa, em markdown. Sem HTML cru: a origem escrevia com `dangerouslySetInnerHTML`, e aqui o texto é só texto.
const MARKDOWN = {
  h1: (props: ComponentProps<"h1">) => <h3 {...props} className="font-heading text-[1.3em] font-semibold" />,
  h2: (props: ComponentProps<"h2">) => <h3 {...props} className="font-heading text-[1.2em] font-semibold" />,
  h3: (props: ComponentProps<"h3">) => <h4 {...props} className="font-heading text-[1.1em] font-semibold" />,
  p: (props: ComponentProps<"p">) => <p {...props} className="text-muted-foreground" />,
  strong: (props: ComponentProps<"strong">) => <strong {...props} className="font-semibold text-foreground" />,
  a: (props: ComponentProps<"a">) => (
    <a {...props} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2" />
  ),
  ul: (props: ComponentProps<"ul">) => <ul {...props} className="list-disc pl-5 text-muted-foreground" />,
  ol: (props: ComponentProps<"ol">) => <ol {...props} className="list-decimal pl-5 text-muted-foreground" />,
  hr: () => <hr className="my-1 border-border" />,
  code: (props: ComponentProps<"code">) => <code {...props} className="rounded bg-muted px-1 py-0.5 text-[0.9em]" />,
}

export const RichTextWidget = memo(function RichTextWidget({
  config,
  emptyTitle,
  emptyHint,
}: {
  config: VisualConfig
  emptyTitle: string
  emptyHint: string
}) {
  if (!config.content?.trim()) return <CardEmpty title={emptyTitle} description={emptyHint} />

  return (
    <div
      className="flex h-full flex-col gap-2 overflow-y-auto leading-relaxed [scrollbar-width:thin]"
      style={{ fontSize: config.fontSize ?? DEFAULT_TEXT_SIZE }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
        {config.content}
      </ReactMarkdown>
    </div>
  )
})

/** Separa os assuntos do painel: um título e um fio, sem moldura. A cor escolhida fica no fio, e o texto, em tinta. */
export const SectionDividerWidget = memo(function SectionDividerWidget({
  title,
  config,
}: {
  title: string
  config: VisualConfig
}) {
  return (
    <div className="flex h-full items-end gap-3 pb-1">
      <h3 className="font-heading font-semibold whitespace-nowrap" style={{ fontSize: config.fontSize ?? 15 }}>
        {title}
      </h3>
      <span
        aria-hidden
        className="mb-2 h-px flex-1"
        style={{ backgroundColor: resolveColor(config.color, "var(--border)") }}
      />
    </div>
  )
})
