import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, ImagePlus, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { ResponsiveDialog } from "@/components/shared"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ImageGenerator } from "@/components/images/image-generator"
import { useBrandCoreMutations } from "@/hooks/use-brand-core"
import { ApiError } from "@/lib/api"
import { formatBytes, type BrandAsset } from "@/lib/brand-core"
import { useLanguage } from "@/lib/i18n"
import type { DocumentFormat } from "@/lib/piece-document"
import { cn } from "@/lib/utils"

/** O teto de `BrandAsset::MAX_IMAGE_BYTES` no Rails. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const PHOTO_ACCEPT = "image/png,image/jpeg,image/svg+xml"

type ImagePickerSheetProps = {
  brandId: string
  /** O formato da peça — a foto gerada sai na proporção dela. */
  format: DocumentFormat
  photos: BrandAsset[]
  currentAssetId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (asset: BrandAsset) => void
}

/**
 * De onde a foto de um slot pode vir: os ativos da marca ou um arquivo novo
 * (que entra nos ativos e fica para as próximas peças).
 *
 * A terceira aba gera uma foto nova pelo gerador de imagens (Gemini), já na
 * proporção da peça: o resultado vira foto da marca e um clique o põe no
 * slot. O resto do editor não muda — ele só conhece `onPick`. (Na conversa
 * da etapa 7, a operação `request_image` continua reservada no servidor.)
 */
export function ImagePickerSheet({ brandId, format, photos, currentAssetId, open, onOpenChange, onPick }: ImagePickerSheetProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { uploadAsset } = useBrandCoreMutations(brandId)
  const [uploading, setUploading] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error(t("brand.assets.tooLarge", { max: formatBytes(MAX_PHOTO_BYTES, language) }))
      return
    }
    setUploading(true)
    try {
      const asset = await uploadAsset("photo", null, file)
      onPick(asset)
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.field === "file" && error.serverMessage ? error.serverMessage : t("brand.assets.uploadFailed")
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("pieceEditor.image.pickTitle")}
      description={t("pieceEditor.image.pickDescription")}
      size="xl"
      bodyClassName="p-0"
    >
        <Tabs defaultValue="assets" className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-4 mt-4">
            <TabsTrigger value="assets">{t("pieceEditor.image.tabAssets")}</TabsTrigger>
            <TabsTrigger value="upload">{t("pieceEditor.image.tabUpload")}</TabsTrigger>
            <TabsTrigger value="generate">{t("pieceEditor.image.tabGenerate")}</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="min-h-0 overflow-y-auto p-4">
            <ImageGenerator
              brandId={brandId}
              origin="editor"
              format={format}
              onPick={(asset) => {
                onPick(asset)
                onOpenChange(false)
              }}
            />
          </TabsContent>

          <TabsContent value="assets" className="min-h-0 overflow-y-auto p-4">
            {photos.length === 0 ? (
              <p className="py-10 text-center text-sm text-vk-muted">{t("pieceEditor.image.noAssets")}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3">
                {photos.map((photo) => {
                  const current = photo.id === currentAssetId
                  return (
                    <li key={photo.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onPick(photo)
                          onOpenChange(false)
                        }}
                        aria-pressed={current}
                        className={cn(
                          "relative block aspect-square w-full overflow-hidden border outline-none focus-visible:ring-2 focus-visible:ring-vk-fg/30",
                          current ? "border-vk-fg" : "border-vk-border hover:border-vk-border-strong"
                        )}
                      >
                        <img src={photo.url} alt={photo.name} className="size-full object-cover" loading="lazy" />
                        {current && (
                          <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-vk-fg text-vk-bg">
                            <Check className="size-3" aria-hidden />
                          </span>
                        )}
                      </button>
                      <p className="mt-1 truncate font-mono text-[11px] text-vk-muted">{photo.name}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="upload" className="p-4">
            <input
              ref={input}
              type="file"
              accept={PHOTO_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
                event.target.value = ""
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={uploading}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const file = event.dataTransfer.files?.[0]
                if (file) void upload(file)
              }}
              className="flex h-48 w-full flex-col items-center justify-center gap-2 border border-dashed border-vk-border-strong text-sm text-vk-muted outline-none hover:text-vk-fg focus-visible:ring-2 focus-visible:ring-vk-fg/30"
            >
              {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
              {uploading ? t("pieceEditor.image.uploading") : t("pieceEditor.image.drop")}
            </button>
            <p className="mt-2 font-mono text-[11px] text-vk-muted">{t("pieceEditor.image.uploadHint")}</p>
          </TabsContent>
        </Tabs>
    </ResponsiveDialog>
  )
}
