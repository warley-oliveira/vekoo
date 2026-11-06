import { AlertTriangle, Braces } from "lucide-react"

import { FileTypeIcon } from "@/components/shared"
import type { ExcerptContext } from "@/lib/content/excerpt-context"
import { tokenizeContent } from "@/lib/content/quick-reply-content"

const CHIP =
  "mx-0.5 inline-flex max-w-48 items-center gap-1 rounded bg-muted px-1 align-baseline text-xs text-foreground [&_svg]:size-3 [&_svg]:shrink-0"

/** O texto da mensagem numa linha da lista: anexos e variáveis como blocos, sem código à vista. */
export function ContentExcerpt({
  content,
  context,
}: {
  content: string
  context: ExcerptContext
}) {
  return (
    <>
      {tokenizeContent(content).map((token, index) => {
        if (token.type === "text") {
          return <span key={index}>{token.text.replace(/\s+/g, " ")}</span>
        }
        if (token.type === "variable") {
          return (
            <span key={index} className={CHIP}>
              <Braces aria-hidden />
              <span className="truncate">{context.labelOfVariable(token.key)}</span>
            </span>
          )
        }

        const attachment = context.attachmentsById?.get(token.id)
        // A biblioteca ainda vem: nem nome, nem alarme.
        if (!context.attachmentsById) return null
        if (!attachment) {
          return (
            <span key={index} className={`${CHIP} bg-status-danger-soft text-status-danger`}>
              <AlertTriangle aria-hidden />
              <span className="truncate">{context.missingLabel}</span>
            </span>
          )
        }
        return (
          <span key={index} className={CHIP}>
            <FileTypeIcon mediaType={attachment.file?.contentType} fileName={attachment.file?.filename} />
            <span className="truncate">{attachment.name}</span>
          </span>
        )
      })}
    </>
  )
}
