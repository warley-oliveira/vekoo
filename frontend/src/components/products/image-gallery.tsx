import { useState } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import { useTranslation } from "react-i18next"
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  ImagePlus,
  Link2,
  Loader2,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { ActionsMenu, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import type { useImageQueue } from "@/hooks/products/use-image-queue"
import { useImageMutations } from "@/hooks/products/use-products"
import { formatFileSize } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  imageOriginalSrc,
} from "@/lib/products/images"
import type { ProductImage } from "@/lib/products/types"
import { isWebUrl, normalizeWebUrl } from "@/lib/products/url"
import { cn } from "@/lib/utils"
import { ProductThumb } from "./product-thumb"
import { SortableArea, useSortableEntry } from "./sortable"

const GRID_CLASS = "grid grid-cols-3 gap-2 sm:grid-cols-4 md:gap-3 lg:grid-cols-5"

type ImageGalleryProps = {
  /** Sem id, o item ainda não foi salvo: as fotos esperam na fila. */
  itemId: string | null
  /** Para o texto alternativo das fotos sem descrição. */
  title: string
  images: readonly ProductImage[]
  queue: ReturnType<typeof useImageQueue>
}

/**
 * As fotos do item, no lugar: enviar, arrastar para reordenar, escolher a principal,
 * excluir e adicionar por link. Salvo o item, cada ação vale na hora, sem depender do
 * "Salvar" do formulário.
 */
export function ImageGallery({ itemId, title, images, queue }: ImageGalleryProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { reorderImages } = useImageMutations()
  const [rejections, setRejections] = useState<string[]>([])

  const maxSize = formatFileSize(IMAGE_MAX_BYTES, language)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: IMAGE_ACCEPT,
    maxSize: IMAGE_MAX_BYTES,
    multiple: true,
    onDrop: (accepted: File[], rejected: FileRejection[]) => {
      setRejections(
        rejected.map(({ file, errors }) =>
          errors[0]?.code === "file-too-large"
            ? t("products.images.tooLarge", { name: file.name, max: maxSize })
            : t("products.images.invalidType", { name: file.name })
        )
      )
      if (accepted.length > 0) queue.addFiles(accepted)
    },
  })

  async function reorder(ordered: ProductImage[]) {
    if (!itemId) return
    try {
      await reorderImages(itemId, ordered)
    } catch {
      toast.error(t("products.images.reorderFailed"))
    }
  }

  const isEmpty = images.length === 0 && queue.pending.length === 0

  const addTile = (
    <div
      {...getRootProps({
        role: "button",
        "aria-label": t("products.images.add"),
      })}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        isDragActive && "border-primary bg-accent/50",
        isEmpty ? "px-4 py-8" : "aspect-square p-2"
      )}
    >
      <input {...getInputProps()} />
      <ImagePlus aria-hidden className="size-5 text-muted-foreground" />
      <span className={cn("font-medium", isEmpty ? "text-sm" : "text-xs")}>
        {isDragActive ? t("products.images.dropHere") : t("products.images.add")}
      </span>
      {isEmpty ? (
        <span className="max-w-sm text-xs text-pretty text-muted-foreground">
          {t("products.images.hint", { max: maxSize })}
        </span>
      ) : null}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {isEmpty ? (
        addTile
      ) : (
        <SortableArea
          items={images}
          layout="grid"
          disabled={!itemId}
          nameOf={(image) =>
            t("products.images.position", { position: images.indexOf(image) + 1 })
          }
          onReorder={(ordered) => void reorder(ordered)}
        >
          <ul className={GRID_CLASS}>
            {images.map((image, index) => (
              <SavedTile
                key={image.id}
                itemId={itemId}
                image={image}
                index={index}
                images={images}
                title={title}
                onReorder={(ordered) => void reorder(ordered)}
              />
            ))}
            {queue.pending.map((entry) => (
              <PendingTile key={entry.id} entry={entry} itemId={itemId} queue={queue} />
            ))}
            <li>{addTile}</li>
          </ul>
        </SortableArea>
      )}

      {rejections.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-0.5 text-xs text-destructive">
          {rejections.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      ) : null}

      <AddByLink onAdd={queue.addUrl} />

      {isEmpty ? null : (
        <p className="text-xs text-pretty text-muted-foreground">
          {t(itemId ? "products.images.savedHint" : "products.images.pendingHint", { max: maxSize })}
        </p>
      )}
    </div>
  )
}

function SavedTile({
  itemId,
  image,
  index,
  images,
  title,
  onReorder,
}: {
  itemId: string | null
  image: ProductImage
  index: number
  images: readonly ProductImage[]
  title: string
  onReorder: (ordered: ProductImage[]) => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { deleteImage } = useImageMutations()
  const { setNodeRef, style, handleProps, isDragging } = useSortableEntry(image.id)

  function moveTo(target: number) {
    const ordered = [...images]
    ordered.splice(index, 1)
    ordered.splice(target, 0, image)
    onReorder(ordered)
  }

  async function remove() {
    if (!itemId) return
    const confirmed = await confirm({
      title: t("products.images.deleteTitle"),
      description: t("products.images.deleteHint"),
      confirmLabel: t("products.images.delete"),
      destructive: true,
      onConfirm: () => deleteImage(itemId, image.id),
    })
    if (confirmed) toast.success(t("products.images.deleted"))
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn("group/tile relative min-w-0", isDragging && "opacity-80")}
    >
      <div
        {...handleProps}
        // A linha do tempo do toque: segurar pega a foto, e deslizar sem segurar rola a página.
        aria-label={t("products.images.reorder", { position: index + 1, total: images.length })}
        className={cn(
          "aspect-square cursor-grab overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/5 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
          isDragging && "shadow-lg"
        )}
      >
        <ProductThumb image={image} alt={title} className="pointer-events-none" />
      </div>

      {index === 0 ? (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex h-5 items-center gap-1 rounded-full bg-background/90 px-1.5 text-xs font-medium shadow-xs">
          <Star aria-hidden className="size-3" />
          {t("products.images.primary")}
        </span>
      ) : null}

      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover/tile:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100">
        <ActionsMenu
          label={t("products.images.actionsOf", { position: index + 1 })}
          className="bg-background/90 text-foreground shadow-xs hover:bg-background"
          actions={[
            {
              label: t("products.images.makePrimary"),
              icon: <Star />,
              hidden: index === 0,
              onSelect: () => moveTo(0),
            },
            {
              label: t("products.images.moveBefore"),
              icon: <ArrowLeft />,
              disabled: index === 0,
              onSelect: () => moveTo(index - 1),
            },
            {
              label: t("products.images.moveAfter"),
              icon: <ArrowRight />,
              disabled: index === images.length - 1,
              onSelect: () => moveTo(index + 1),
            },
            {
              label: t("products.images.open"),
              icon: <ExternalLink />,
              onSelect: () =>
                window.open(imageOriginalSrc(image), "_blank", "noopener,noreferrer"),
            },
            {
              label: t("products.images.delete"),
              icon: <Trash2 />,
              destructive: true,
              separatorBefore: true,
              onSelect: () => void remove(),
            },
          ]}
        />
      </div>
    </li>
  )
}

function PendingTile({
  entry,
  itemId,
  queue,
}: {
  entry: ReturnType<typeof useImageQueue>["pending"][number]
  itemId: string | null
  queue: ReturnType<typeof useImageQueue>
}) {
  const { t } = useTranslation()

  return (
    <li className="relative min-w-0">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/5">
        <img
          src={entry.previewUrl}
          alt=""
          className={cn("size-full object-cover", entry.status !== "queued" && "opacity-60")}
        />
        {entry.status === "uploading" ? (
          <div className="absolute inset-x-1.5 bottom-1.5">
            <Progress
              value={Math.round(entry.progress * 100)}
              aria-label={t("products.images.uploading", { name: entry.name })}
              className="gap-0"
            />
          </div>
        ) : null}
        {entry.status === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/85 p-1.5 text-center">
            <p role="alert" className="line-clamp-3 text-xs text-destructive">
              {entry.error}
            </p>
            {itemId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => queue.retry(entry.id)}
              >
                <RotateCcw />
                {t("products.images.retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {entry.status === "uploading" ? (
          <Loader2 aria-hidden className="absolute top-2 left-2 size-4 animate-spin" />
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("products.images.cancel", { name: entry.name })}
        className="absolute top-1.5 right-1.5 bg-background/90 shadow-xs hover:bg-background"
        onClick={() => queue.remove(entry.id)}
      >
        <X />
      </Button>
    </li>
  )
}

function AddByLink({ onAdd }: { onAdd: (url: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const url = normalizeWebUrl(value)
    if (!isWebUrl(url)) {
      setError(t("products.item.errors.urlInvalid"))
      return
    }
    onAdd(url)
    setValue("")
    setError(null)
    setOpen(false)
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit text-muted-foreground pointer-coarse:h-10"
        onClick={() => setOpen(true)}
      >
        <Link2 />
        {t("products.images.addByLink")}
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          type="url"
          inputMode="url"
          autoCapitalize="off"
          enterKeyHint="done"
          aria-label={t("products.images.linkLabel")}
          aria-invalid={Boolean(error)}
          placeholder={t("products.images.linkPlaceholder")}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            // Enter aqui adiciona a foto, e não salva o item.
            if (event.key === "Enter") {
              event.preventDefault()
              submit()
            }
            if (event.key === "Escape") {
              event.stopPropagation()
              setOpen(false)
            }
          }}
        />
        <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={submit}>
          {t("products.images.addLink")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("kit.actions.cancel")}
          className="pointer-coarse:size-10"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
        >
          <X />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("products.images.linkHint")}</p>
      )}
    </div>
  )
}
