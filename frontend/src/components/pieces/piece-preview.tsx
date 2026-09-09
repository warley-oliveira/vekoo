import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Loader2 } from "lucide-react"

import { usePieceMutations } from "@/hooks/use-pieces"
import { ApiError } from "@/lib/api"
import { compactValues, validateValues, type EngineManifest, type PieceFormat, type PieceValues } from "@/lib/engines"
import { cn } from "@/lib/utils"

const DEBOUNCE = 700

type PiecePreviewProps = {
  brandId: string
  engine: EngineManifest
  values: PieceValues
  format: PieceFormat
  className?: string
}

/**
 * A prévia da peça com os valores em edição: espera a pessoa parar de
 * digitar, pede o PNG do primeiro quadro e mostra. Só pede quando os
 * campos obrigatórios estão preenchidos — antes disso não há o que ver.
 */
export function PiecePreview({ brandId, engine, values, format, className }: PiecePreviewProps) {
  const { t } = useTranslation()
  const { preview } = usePieceMutations(brandId)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const controller = useRef<AbortController | null>(null)

  const complete = Object.values(validateValues(engine, values)).every((code) => code !== "required")
  const snapshot = JSON.stringify(compactValues(values))

  useEffect(() => {
    if (!complete) {
      setUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setError(null)
      return
    }

    const timer = window.setTimeout(async () => {
      controller.current?.abort()
      const abort = new AbortController()
      controller.current = abort
      setLoading(true)
      try {
        const blob = await preview(engine.id, JSON.parse(snapshot) as PieceValues, format, abort.signal)
        if (abort.signal.aborted) return
        const next = URL.createObjectURL(blob)
        setUrl((current) => {
          if (current) URL.revokeObjectURL(current)
          return next
        })
        setError(null)
      } catch (caught) {
        if (abort.signal.aborted) return
        setError(caught instanceof ApiError ? caught : new ApiError({ status: 0, code: "unknown" }))
      } finally {
        if (!abort.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE)

    return () => window.clearTimeout(timer)
  }, [complete, snapshot, format, engine.id, preview])

  // Ao sair, solta a URL e cancela o que estiver em voo.
  useEffect(
    () => () => {
      controller.current?.abort()
      setUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
    },
    []
  )

  const ratio = format === "story" ? "aspect-[9/16]" : "aspect-[4/5]"

  return (
    <section aria-label={t("pieces.preview.title")} className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t("pieces.preview.title")}</h2>
        {loading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" /> {t("pieces.preview.loading")}
          </span>
        )}
      </div>
      <div className={cn("relative w-full overflow-hidden border bg-muted", ratio)}>
        {url ? (
          <img src={url} alt={t("pieces.preview.alt")} className={cn("size-full object-contain transition-opacity", loading && "opacity-60")} />
        ) : (
          <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {loading ? <Loader2 className="size-6 animate-spin" /> : !complete ? t("pieces.preview.empty") : null}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-medium">{t("pieces.preview.blockedTitle")}. </span>
            {error.serverMessage ?? t("pieces.errors.unknown")}
          </span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("pieces.preview.hint")}</p>
    </section>
  )
}
