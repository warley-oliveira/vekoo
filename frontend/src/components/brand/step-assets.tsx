import { useEffect, useRef, useState, type DragEvent } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Check, HelpCircle, ImagePlus, Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

import { useWizard } from "@/components/brand/brand-wizard-context"
import { PhotoViewer } from "@/components/brand/photo-viewer"
import { EmptyState } from "@/components/empty-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useBrandCoreMutations } from "@/hooks/use-brand-core"
import { ApiError } from "@/lib/api"
import { formatBytes, primaryLogo, type BrandAsset, type BrandAssetKind, type BrandCore } from "@/lib/brand-core"
import { useLanguage } from "@/lib/i18n"
import { inspectPngTransparency } from "@/lib/png-transparency"
import { cn } from "@/lib/utils"

// Os mesmos tetos de `BrandAsset` no Rails.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_LOGO_BYTES = 5 * 1024 * 1024
// JPEG e WebP entram e o servidor guarda como PNG (fundo chapado gera o alerta).
const IMAGE_ACCEPT = "image/png,image/svg+xml,image/jpeg,image/webp"
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp"

const SLOTS = [
  { kind: "logo", variant: "light", key: "logoLight" },
  { kind: "logo", variant: "dark", key: "logoDark" },
  { kind: "glyph", variant: "light", key: "glyphLight" },
  { kind: "glyph", variant: "dark", key: "glyphDark" },
] as const

export function StepAssets() {
  const { t } = useTranslation()
  const { brandCore, registerCommit, reportStatus } = useWizard()
  // Sem formulário: o commit da etapa é só seguir. O progresso é do shell.
  useEffect(() => {
    registerCommit(null)
    reportStatus("idle")
  }, [registerCommit, reportStatus])

  const photos = brandCore.assets.filter((a) => a.kind === "photo")
  const [viewing, setViewing] = useState<number | null>(null)

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">{t("brand.assets.intro")}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {SLOTS.map((slot) => (
          <AssetSlot
            key={slot.key}
            kind={slot.kind}
            variant={slot.variant}
            label={t(`brand.assets.slots.${slot.key}`)}
            asset={slotAsset(brandCore, slot.kind, slot.variant)}
            onDark={slot.variant === "dark"}
          />
        ))}
      </div>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">{t("brand.assets.photos")}</h3>
          <p className="text-xs text-muted-foreground">{t("brand.assets.photosHint")}</p>
        </div>
        {photos.length === 0 ? (
          <EmptyState icon={<ImagePlus className="size-6" />} title={t("brand.assets.empty")} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo, index) => (
              <li key={photo.id} className="group relative aspect-square overflow-hidden border bg-muted">
                <button
                  type="button"
                  onClick={() => setViewing(index)}
                  aria-label={t("brand.assets.viewer.open", { name: photo.name })}
                  className="block size-full cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <img
                    src={photo.url}
                    alt=""
                    className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </button>
                <RemoveAssetButton asset={photo} variant="secondary" className="absolute top-1.5 right-1.5" />
              </li>
            ))}
          </ul>
        )}
        <UploadButton kind="photo" variant={null} accept={PHOTO_ACCEPT} label={t("brand.assets.addPhoto")} />
        <PhotoViewer
          photos={photos}
          index={viewing}
          onIndexChange={setViewing}
          actions={(photo) => <RemoveAssetButton asset={photo} variant="secondary" />}
        />
      </section>
    </div>
  )
}

/**
 * O arquivo de um slot. Logo é a variante da **principal** — a marca guarda
 * várias, e é a principal que o wizard edita; glifo é o de sempre.
 */
function slotAsset(brandCore: BrandCore, kind: "logo" | "glyph", variant: "light" | "dark"): BrandAsset | undefined {
  if (kind === "glyph") return brandCore.assets.find((a) => a.kind === kind && a.variant === variant)
  const id = primaryLogo(brandCore)?.variants[variant]
  return brandCore.assets.find((a) => a.id === id)
}

/* ---------- upload ---------- */

function useAssetUpload(kind: BrandAssetKind, variant: string | null) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { brandCore } = useWizard()
  const { uploadAsset } = useBrandCoreMutations(brandCore.id)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    const max = kind === "logo" ? MAX_LOGO_BYTES : MAX_IMAGE_BYTES
    if (file.size > max) {
      toast.error(t("brand.assets.tooLarge", { max: formatBytes(max, language) }))
      return
    }
    // Logo pelo wizard: a variante entra na logo enviada que é a principal
    // (a escura ao lado da clara) e continua sendo a principal.
    const primary = primaryLogo(brandCore)
    const logoOptions =
      kind === "logo" ? { logoId: primary?.source === "uploaded" ? primary.id : undefined, primary: true } : {}
    setUploading(true)
    try {
      // A conferência local só antecipa o alerta; a que vale é a do servidor.
      const [asset, localTransparent] = await Promise.all([
        uploadAsset(kind, variant, file, logoOptions),
        kind === "photo" ? Promise.resolve(null) : inspectPngTransparency(file),
      ])
      const transparent = asset.transparent ?? localTransparent
      if (transparent === false) {
        toast.warning(t("brand.assets.opaqueTitle"), { description: t("brand.assets.opaqueWarning") })
      }
    } catch (error) {
      const message =
        error instanceof ApiError && error.field === "file" && error.serverMessage
          ? error.serverMessage
          : t("brand.assets.uploadFailed")
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }

  return { upload, uploading }
}

type UploadButtonProps = { kind: BrandAssetKind; variant: string | null; accept: string; label: string }

function UploadButton({ kind, variant, accept, label }: UploadButtonProps) {
  const { t } = useTranslation()
  const { upload, uploading } = useAssetUpload(kind, variant)
  const input = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          e.target.value = ""
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
        {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
        {uploading ? t("brand.assets.uploading") : label}
      </Button>
    </>
  )
}

/* ---------- logo e glifo ---------- */

type AssetSlotProps = {
  kind: "logo" | "glyph"
  variant: "light" | "dark"
  label: string
  asset?: BrandAsset
  onDark: boolean
}

function AssetSlot({ kind, variant, label, asset, onDark }: AssetSlotProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { upload, uploading } = useAssetUpload(kind, variant)
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    if (!IMAGE_ACCEPT.split(",").includes(file.type)) {
      toast.error(t("brand.assets.invalidType"))
      return
    }
    void upload(file)
  }

  // A prévia fica sozinha na área de cima; selo e ações vão numa barra
  // embaixo — botão por cima da logo esconde justamente o que se quer ver.
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "overflow-hidden rounded-lg border bg-card transition-colors",
          dragging && "border-primary ring-3 ring-ring/30",
          !asset && "border-dashed"
        )}
      >
        <div
          className="flex aspect-[5/3] items-center justify-center p-5"
          style={{ backgroundColor: onDark ? "var(--foreground)" : "var(--card)" }}
        >
          {asset ? (
            <img
              src={asset.url}
              alt={asset.name}
              className="max-h-full max-w-full object-contain"
              style={
                asset.transparent === false
                  ? undefined
                  : { backgroundImage: "repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%)", backgroundSize: "12px 12px" }
              }
            />
          ) : (
            <div className={cn("text-center text-sm", onDark ? "text-background/80" : "text-muted-foreground")}>
              {uploading ? (
                <Loader2 className="mx-auto size-5 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="mx-auto mb-2 size-5" aria-hidden />
                  {t("brand.assets.drop")}{" "}
                  <button
                    type="button"
                    onClick={() => input.current?.click()}
                    className="rounded font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {t("brand.assets.browse")}
                  </button>
                  <p className="mt-1 text-xs opacity-80">
                    {t("brand.assets.slotHint", { max: formatBytes(MAX_IMAGE_BYTES, language) })}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        {asset && (
          // Quebra em vez de cortar: na coluna estreita selo + "Trocar" já
          // ocupam a largura, e a lixeira sumia atrás do `overflow-hidden`.
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t px-2 py-1.5">
            <TransparencyBadge asset={asset} />
            <div className="ml-auto flex shrink-0 gap-1">
              <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />} {t("brand.assets.replace")}
              </Button>
              <RemoveAssetButton asset={asset} />
            </div>
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          aria-label={label}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
            e.target.value = ""
          }}
        />
      </div>
      {asset?.transparent === false && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {t("brand.assets.opaqueWarning")}
        </p>
      )}
    </section>
  )
}

function TransparencyBadge({ asset }: { asset: BrandAsset }) {
  const { t } = useTranslation()
  if (asset.transparent === true) {
    return <Badge variant="secondary"><Check /> {t("brand.assets.transparentOk")}</Badge>
  }
  if (asset.transparent === false) {
    return <Badge variant="destructive"><AlertTriangle /> {t("brand.assets.opaqueTitle")}</Badge>
  }
  return <Badge variant="outline"><HelpCircle /> {t("brand.assets.unknownTransparency")}</Badge>
}

/** Na barra do slot, discreto; por cima de uma foto, `secondary` para não sumir nela. */
function RemoveAssetButton({
  asset,
  variant = "ghost",
  className,
}: {
  asset: BrandAsset
  variant?: "ghost" | "secondary"
  className?: string
}) {
  const { t } = useTranslation()
  const { brandCore } = useWizard()
  const { deleteAsset } = useBrandCoreMutations(brandCore.id)
  const [open, setOpen] = useState(false)

  async function remove() {
    try {
      await deleteAsset(asset.id)
      toast(t("brand.assets.removed"))
    } catch {
      toast.error(t("brand.assets.removeFailed"))
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="icon-sm"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={t("brand.assets.remove")}
      >
        <Trash2 />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("brand.assets.confirmRemoveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("brand.assets.confirmRemoveDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              {t("brand.assets.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
