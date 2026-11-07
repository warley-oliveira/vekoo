import { CopyButton } from "@/components/shared"

/** Um exemplo para copiar. Em uma cor só: é para colar, e não para ler como editor. */
export function CodeSnippet({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative min-w-0">
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-11 font-mono text-xs leading-relaxed whitespace-pre">
        <code>{code}</code>
      </pre>
      <CopyButton value={code} aria-label={label} className="absolute top-1.5 right-1.5 pointer-coarse:size-10" />
    </div>
  )
}
