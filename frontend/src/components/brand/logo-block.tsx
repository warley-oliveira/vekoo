import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandCoreMutations } from "@/hooks/use-brand-core"
import { ApiError } from "@/lib/api"
import {
  formatBytes,
  logoAsset,
  primaryLogo,
  type BrandCore,
  type BrandLogo,
  type LogoDownload,
  type LogoVariant,
} from "@/lib/brand-core"
import { formatDayMonth } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// A logo da marca dentro do cartão do brandcore: a principal, de onde veio e
// as três ações — baixar, trocar, regenerar. Toda logo fica guardada; trocar
// e regenerar só mudam qual é a principal, no rascunho, como qualquer outra
// mudança da marca (vale para o motor depois de publicar).

/** O teto de `BrandAsset::MAX_LOGO_BYTES` no Rails. */
const MAX_LOGO_BYTES = 5 * 1024 * 1024
const LOGO_ACCEPT = "image/png,image/svg+xml"

/** O xadrez de transparência, nos tokens do site. */
const CHECKER: CSSProperties = {
  backgroundImage: "repeating-conic-gradient(var(--vk-faint) 0% 25%, transparent 0% 50%)",
  backgroundSize: "12px 12px",
}

/** O link mono das ações ("baixar", "trocar"). */
const ACTION =
  "rounded-sm font-mono text-xs text-vk-fg underline decoration-vk-border-strong underline-offset-4 outline-none transition-colors hover:decoration-vk-fg focus-visible:ring-2 focus-visible:ring-vk-fg/30 disabled:opacity-50"

export function LogoBlock({ brandCore }: { brandCore: BrandCore }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [generateOnOpen, setGenerateOnOpen] = useState(false)

  const logo = primaryLogo(brandCore)
  const image = logoAsset(brandCore, logo, "light")

  function openSheet(generate: boolean) {
    setGenerateOnOpen(generate)
    setSheetOpen(true)
  }

  return (
    <section>
      <h4 className="mb-2 font-mono text-[11px] tracking-[0.08em] text-vk-muted uppercase">{t("brand.logo.label")}</h4>

      {logo && image ? (
        <div className="flex items-start gap-4">
          <LogoFrame src={image.url} alt={t("brand.logo.alt", { name: brandCore.document.identity.name })} />
          <div className="min-w-0 space-y-1 pt-1 font-mono text-xs text-vk-muted">
            <p>{logo.formats.join(" · ")}</p>
            <p className="truncate">{originLine(logo, t, language)}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-2">
              <DownloadMenu brandCore={brandCore} logo={logo} />
              <span aria-hidden>·</span>
              <button type="button" className={ACTION} onClick={() => openSheet(false)}>
                {t("brand.logo.actions.swap")}
              </button>
              <span aria-hidden>·</span>
              <button type="button" className={ACTION} onClick={() => openSheet(true)}>
                {t("brand.logo.actions.regenerate")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="grid size-24 shrink-0 place-items-center rounded-vk-sm border border-dashed border-vk-border-strong font-mono text-[11px] text-vk-muted">
            {t("brand.logo.empty")}
          </div>
          <button type="button" className={ACTION} onClick={() => openSheet(true)}>
            {t("brand.logo.actions.createNow")}
          </button>
        </div>
      )}

      <LogoSheet
        brandCore={brandCore}
        open={sheetOpen}
        generateOnOpen={generateOnOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setGenerateOnOpen(false)
        }}
      />
    </section>
  )
}

function LogoFrame({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={cn("grid size-24 shrink-0 place-items-center overflow-hidden rounded-vk-sm border border-vk-border p-2", className)}
      style={CHECKER}
    >
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  )
}

function originLine(logo: BrandLogo, t: (key: string, options?: Record<string, unknown>) => string, language: string) {
  const when = formatDayMonth(logo.createdAt, language)
  return t(`brand.logo.origin.${logo.origin}`, { when })
}

/* ---------- baixar ---------- */

function DownloadMenu({ brandCore, logo }: { brandCore: BrandCore; logo: BrandLogo }) {
  const { t } = useTranslation()
  const { downloadLogo } = useBrandCoreMutations(brandCore.id)
  const [busy, setBusy] = useState<string | null>(null)

  const groups = (["light", "dark"] as LogoVariant[])
    .map((variant) => ({ variant, options: logo.downloads.filter((option) => option.variant === variant) }))
    .filter((group) => group.options.length > 0)

  async function download(option: LogoDownload) {
    const key = optionKey(option)
    setBusy(key)
    try {
      await downloadLogo(logo.id, option, `logo-${option.variant}.${option.format}`)
    } catch (error) {
      toast.error(error instanceof ApiError && error.code === "network" ? t("brand.logo.offline") : t("brand.logo.downloadFailed"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Popover>
      <PopoverTrigger render={<button type="button" className={ACTION} />}>{t("brand.logo.actions.download")}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {groups.map((group) => (
          <div key={group.variant} className="py-1">
            <p className="px-2 pb-1 font-mono text-[11px] tracking-[0.08em] text-vk-muted uppercase">
              {t(`brand.logo.variants.${group.variant}`)}
            </p>
            <ul>
              {group.options.map((option) => {
                const key = optionKey(option)
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => void download(option)}
                      disabled={busy !== null}
                      className="flex h-10 w-full items-center justify-between gap-3 rounded-md px-2 font-mono text-xs outline-none transition-colors enabled:hover:bg-vk-faint focus-visible:ring-2 focus-visible:ring-vk-fg/30 disabled:opacity-60"
                    >
                      <span>
                        {option.format.toUpperCase()}{" "}
                        <span className="text-vk-muted">
                          {option.size ? t("brand.logo.size", { size: option.size }) : t("brand.logo.original")}
                        </span>
                      </span>
                      {busy === key ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span aria-hidden>↓</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function optionKey(option: LogoDownload) {
  return `${option.variant}-${option.format}-${option.size ?? "original"}`
}

/* ---------- trocar e regenerar ---------- */

type LogoSheetProps = {
  brandCore: BrandCore
  open: boolean
  /** Aberto pelo "regenerar" (ou "criar agora"): já começa desenhando. */
  generateOnOpen: boolean
  onOpenChange: (open: boolean) => void
}

function LogoSheet({ brandCore, open, generateOnOpen, onOpenChange }: LogoSheetProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const reduced = useReducedMotion()
  const { chooseLogo, generateLogos, uploadAsset } = useBrandCoreMutations(brandCore.id)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [choosing, setChoosing] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)

  const generate = useCallback(async () => {
    setGenerating(true)
    try {
      const ids = await generateLogos()
      setFresh(ids)
      toast(t("brand.logo.generated"))
    } catch (error) {
      toast.error(error instanceof ApiError && error.serverMessage ? error.serverMessage : t("brand.logo.generateFailed"))
    } finally {
      setGenerating(false)
    }
  }, [generateLogos, t])

  // "regenerar" (e "criar agora") abre a galeria já desenhando.
  useEffect(() => {
    if (open && generateOnOpen) void generate()
    // Só ao abrir: `generate` muda de identidade com o idioma, e não deve
    // disparar outra rodada de desenho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, generateOnOpen])

  async function choose(logo: BrandLogo) {
    if (logo.primary) return
    setChoosing(logo.id)
    try {
      await chooseLogo(logo.id)
      toast(t("brand.logo.chosen"))
    } catch {
      toast.error(t("brand.logo.chooseFailed"))
    } finally {
      setChoosing(null)
    }
  }

  async function upload(file: File) {
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t("brand.assets.tooLarge", { max: formatBytes(MAX_LOGO_BYTES, language) }))
      return
    }
    setUploading(true)
    try {
      const asset = await uploadAsset("logo", "light", file, { primary: true })
      if (asset.logoId) setFresh([asset.logoId])
      toast(t("brand.logo.uploaded"))
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.field === "file" && error.serverMessage
          ? error.serverMessage
          : t("brand.assets.uploadFailed")
      )
    } finally {
      setUploading(false)
    }
  }

  const busy = generating || uploading || choosing !== null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-vk-border">
          <SheetTitle>{t("brand.logo.sheet.title")}</SheetTitle>
          <SheetDescription>{t("brand.logo.sheet.description")}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ul className="grid grid-cols-2 gap-3" aria-busy={generating}>
            <AnimatePresence initial={false}>
              {generating &&
                [0, 1, 2].map((index) => (
                  <motion.li
                    key={`skeleton-${index}`}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduced ? undefined : { opacity: 0 }}
                  >
                    <Skeleton className="aspect-[4/3] w-full rounded-vk-sm" />
                    <Skeleton className="mt-2 h-3 w-2/3" />
                  </motion.li>
                ))}
            </AnimatePresence>
            {brandCore.logos.map((logo) => (
              <LogoTile
                key={logo.id}
                brandCore={brandCore}
                logo={logo}
                isNew={fresh.includes(logo.id)}
                choosing={choosing === logo.id}
                disabled={busy}
                onChoose={() => void choose(logo)}
              />
            ))}
          </ul>
          {brandCore.logos.length === 0 && !generating && (
            <p className="py-10 text-center text-sm text-vk-muted">{t("brand.logo.sheet.empty")}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-vk-border p-4">
          <input
            ref={input}
            type="file"
            accept={LOGO_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
              event.target.value = ""
            }}
          />
          <Button
            variant="outline"
            className="h-10 flex-1 border-vk-border-strong bg-transparent"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            {uploading && <Loader2 className="animate-spin" aria-hidden />}
            {t("brand.logo.sheet.upload")}
          </Button>
          <Button className="h-10 flex-1" onClick={() => void generate()} disabled={busy}>
            {generating && <Loader2 className="animate-spin" aria-hidden />}
            {generating ? t("brand.logo.sheet.generating") : t("brand.logo.sheet.generate")}
          </Button>
          <p className="w-full font-mono text-[11px] text-vk-muted">{t("brand.logo.sheet.uploadHint")}</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

type LogoTileProps = {
  brandCore: BrandCore
  logo: BrandLogo
  isNew: boolean
  choosing: boolean
  disabled: boolean
  onChoose: () => void
}

function LogoTile({ brandCore, logo, isNew, choosing, disabled, onChoose }: LogoTileProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const light = logoAsset(brandCore, logo, "light")
  const dark = logo.variants.dark ? logoAsset(brandCore, logo, "dark") : undefined

  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        disabled={disabled && !logo.primary}
        aria-pressed={logo.primary}
        aria-label={t(logo.primary ? "brand.logo.sheet.isPrimary" : "brand.logo.sheet.makePrimary")}
        className={cn(
          "group relative block w-full overflow-hidden rounded-vk-sm border text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-vk-fg/30",
          logo.primary ? "border-vk-fg" : "border-vk-border enabled:hover:border-vk-border-strong"
        )}
      >
        <span className="grid aspect-[4/3] place-items-center p-3" style={CHECKER}>
          {light && <img src={light.url} alt="" className="max-h-full max-w-full object-contain" />}
        </span>
        {dark && (
          <span className="grid h-10 place-items-center bg-vk-fg px-3">
            <img src={dark.url} alt="" className="max-h-6 max-w-full object-contain" />
          </span>
        )}
        {logo.primary && (
          <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-vk-fg text-vk-bg">
            <Check className="size-3" aria-hidden />
          </span>
        )}
        {choosing && (
          <span className="absolute inset-0 grid place-items-center bg-vk-bg/60">
            <Loader2 className="size-4 animate-spin" aria-hidden />
          </span>
        )}
      </button>
      <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-vk-muted">
        {logo.primary && <span className="text-vk-fg">{t("brand.logo.sheet.primary")}</span>}
        {isNew && !logo.primary && <span className="text-vk-fg">{t("brand.logo.sheet.new")}</span>}
        <span className="truncate">
          {logo.style ? t(`brand.logo.styles.${logo.style}`) : originLine(logo, t, language)}
        </span>
      </p>
    </li>
  )
}
