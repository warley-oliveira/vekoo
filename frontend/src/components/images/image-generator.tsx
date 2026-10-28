import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Check, Download, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useBrandCore } from "@/hooks/use-brand-core"
import { useCredits } from "@/hooks/use-credits"
import { useImageGenerationMutations, useImageGenerations } from "@/hooks/use-image-generations"
import { ApiError } from "@/lib/api"
import type { BrandAsset } from "@/lib/brand-core"
import { aspectCss, IMAGE_COUNTS, IMAGE_PROMPT_MAX, isPending, type ImageGeneration } from "@/lib/images"
import type { DocumentFormat } from "@/lib/piece-document"
import { cn } from "@/lib/utils"

const FORMATS: DocumentFormat[] = ["feed_portrait", "feed_square", "story"]

type ImageGeneratorProps = {
  brandId: string
  /** `editor`: dentro do seletor de imagem — formato fixo e clique para usar. */
  origin: "studio" | "editor"
  format?: DocumentFormat
  /** No editor: a foto escolhida entra no slot. */
  onPick?: (asset: BrandAsset) => void
}

/**
 * Descreve a foto e recebe opções — que já entram como fotos da marca (e
 * aparecem em "trocar imagem" do editor). Cada imagem custa créditos; a que
 * o gerador não entregar devolve o crédito sozinha.
 */
export function ImageGenerator({ brandId, origin, format = "feed_portrait", onPick }: ImageGeneratorProps) {
  const { t } = useTranslation()
  const { list, isLoading, error, reload } = useImageGenerations(brandId, origin)
  const { generate, settle } = useImageGenerationMutations(brandId)
  const { credits } = useCredits()
  const { brandCore } = useBrandCore(brandId)
  const compact = origin === "editor"
  const [prompt, setPrompt] = useState("")
  const [chosenFormat, setChosenFormat] = useState<DocumentFormat>(format)
  const [count, setCount] = useState(compact ? 2 : 3)
  const [reference, setReference] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const cost = (list?.costPerImage ?? 2) * count
  const left = credits?.left ?? 0
  const photos = (brandCore?.assets ?? []).filter((asset) => asset.kind === "photo")
  const pending = list?.generations.some(isPending) ?? false

  // Uma geração terminou: os ativos da marca e o saldo acompanham.
  const wasPending = useRef(false)
  useEffect(() => {
    if (wasPending.current && !pending) void settle()
    wasPending.current = pending
  }, [pending, settle])

  async function submit(text = prompt) {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await generate({ prompt: text.trim(), format: compact ? format : chosenFormat, count, referenceAssetId: reference, origin })
      if (text === prompt) setPrompt("")
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : "unknown"
      toast.error(
        code === "noCredits"
          ? t("images.errors.noCredits")
          : code === "costCapReached"
            ? t("images.errors.capReached")
            : failure instanceof ApiError && failure.serverMessage
              ? failure.serverMessage
              : t("images.errors.request")
      )
    } finally {
      setSending(false)
    }
  }

  // Sem gerador ligado no servidor, o formulário dá lugar ao aviso — o que
  // já foi gerado continua à vista embaixo.
  const unavailable = list !== undefined && !list.available

  return (
    <div className="space-y-6">
      {unavailable && (
        <div className="rounded-vk border border-dashed border-vk-border-strong p-6 text-center">
          <p className="text-sm font-medium">{t("images.unavailableTitle")}</p>
          <p className="mt-1 text-sm text-vk-muted">{t("images.unavailableBody")}</p>
        </div>
      )}
      <form
        hidden={unavailable}
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value.slice(0, IMAGE_PROMPT_MAX))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder={t("images.placeholder")}
          aria-label={t("images.promptLabel")}
          className={cn("resize-none bg-vk-input text-sm", compact ? "min-h-20" : "min-h-28")}
        />
        <div className="flex flex-wrap items-center gap-3">
          {!compact && (
            <ToggleGroup
              value={[chosenFormat]}
              onValueChange={(value) => value[0] && setChosenFormat(value[0] as DocumentFormat)}
              variant="outline"
              spacing={0}
              aria-label={t("images.format")}
            >
              {FORMATS.map((option) => (
                <ToggleGroupItem key={option} value={option} className="h-10">
                  {t(`images.formats.${option}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <ToggleGroup
            value={[String(count)]}
            onValueChange={(value) => value[0] && setCount(Number(value[0]))}
            variant="outline"
            spacing={0}
            aria-label={t("images.count")}
          >
            {IMAGE_COUNTS.map((option) => (
              <ToggleGroupItem key={option} value={String(option)} className="h-10 min-w-10">
                {option}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex-1" />
          <p className="font-mono text-[11px] text-vk-muted">{t("images.cost", { count: cost, left })}</p>
          <Button type="submit" className="h-10" disabled={!prompt.trim() || sending || cost > left}>
            {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {t("images.generate", { count })}
          </Button>
        </div>

        {!compact && photos.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-[11px] text-vk-muted">{t("images.reference")}</p>
            <ul className="flex flex-wrap gap-2">
              {photos.slice(0, 12).map((photo) => {
                const selected = reference === photo.id
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() => setReference(selected ? null : photo.id)}
                      aria-pressed={selected}
                      aria-label={t("images.useReference", { name: photo.name })}
                      className={cn(
                        "relative block size-14 overflow-hidden border outline-none focus-visible:ring-2 focus-visible:ring-vk-fg/30",
                        selected ? "border-vk-fg" : "border-vk-border hover:border-vk-border-strong"
                      )}
                    >
                      <img src={photo.url} alt="" className="size-full object-cover" loading="lazy" />
                      {selected && (
                        <span className="absolute inset-0 grid place-items-center bg-vk-fg/40 text-vk-bg">
                          <Check className="size-4" aria-hidden />
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </form>

      {error && !list ? (
        <div className="flex items-center gap-3 rounded-vk border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
          <p className="flex-1">{t("images.errors.load")}</p>
          <Button variant="outline" size="sm" className="h-9" onClick={reload}>
            {t("images.retry")}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-3 gap-3" aria-busy>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="aspect-[4/5] rounded-none" />
          ))}
        </div>
      ) : list && list.generations.length === 0 ? (
        <p className="py-6 text-center text-sm text-vk-muted">{t(compact ? "images.emptyEditor" : "images.empty")}</p>
      ) : (
        <ol className="space-y-6">
          {list?.generations.map((generation) => (
            <GenerationRow
              key={generation.id}
              generation={generation}
              compact={compact}
              onPick={onPick}
              onRetry={() => void submit(generation.prompt)}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

function GenerationRow({
  generation,
  compact,
  onPick,
  onRetry,
}: {
  generation: ImageGeneration
  compact: boolean
  onPick?: (asset: BrandAsset) => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const ratio = aspectCss(generation.aspectRatio)

  return (
    <li className="space-y-2">
      <p className="line-clamp-2 text-sm text-vk-fg">{generation.prompt}</p>
      <p className="font-mono text-[11px] text-vk-muted">
        {generation.aspectRatio} · {t(`images.status.${generation.status}`)}
        {generation.referenceAssetId ? ` · ${t("images.withReference")}` : ""}
      </p>

      {isPending(generation) ? (
        <ul className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
          {Array.from({ length: generation.count }, (_, index) => (
            <li key={index}>
              <Skeleton className="w-full rounded-none" style={{ aspectRatio: ratio }} />
            </li>
          ))}
        </ul>
      ) : generation.status === "failed" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-vk border border-vk-border p-3 text-sm">
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
          <p className="min-w-0 flex-1">{t(`images.errors.${generation.error ?? "failed"}`)}</p>
          {generation.error !== "unavailable" && (
            <Button variant="outline" size="sm" className="h-9" onClick={onRetry}>
              {t("images.retry")}
            </Button>
          )}
        </div>
      ) : (
        <ul className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
          {generation.assets.map((asset) => (
            <li key={asset.id} className="group relative">
              {onPick ? (
                <button
                  type="button"
                  onClick={() => onPick(asset)}
                  className="block w-full overflow-hidden border border-vk-border outline-none hover:border-vk-fg focus-visible:ring-2 focus-visible:ring-vk-fg/30"
                  aria-label={t("images.use")}
                >
                  <img src={asset.url} alt="" className="block w-full object-cover" style={{ aspectRatio: ratio }} />
                </button>
              ) : (
                <img src={asset.url} alt={generation.prompt} className="block w-full border border-vk-border object-cover" style={{ aspectRatio: ratio }} />
              )}
              {!onPick && (
                <a
                  href={asset.url}
                  download={asset.name}
                  className="absolute right-2 bottom-2 inline-flex h-9 items-center gap-1 rounded-md bg-vk-bg/90 px-2.5 font-mono text-[11px] opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-vk-fg/30"
                >
                  <Download className="size-3.5" aria-hidden /> {t("images.download")}
                </a>
              )}
            </li>
          ))}
          {generation.assets.length < generation.count && (
            <li className="flex items-center justify-center border border-dashed border-vk-border p-3 text-center font-mono text-[11px] text-vk-muted" style={{ aspectRatio: ratio }}>
              {t("images.partial", { count: generation.count - generation.assets.length })}
            </li>
          )}
        </ul>
      )}
    </li>
  )
}
