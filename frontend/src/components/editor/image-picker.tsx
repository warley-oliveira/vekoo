import { useMemo, useRef, useState, type DragEvent } from "react"
import { useTranslation } from "react-i18next"
import { ImageUp, Loader2, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"

import { CardImage } from "@/components/editor/card-image"
import { OptionTile, Section, Swatch } from "@/components/editor/panel-controls"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CENTER_FRAME,
  type CarouselTheme,
  type ImageSource,
  type ImageStyle,
  type ImageTint,
} from "@/lib/doc"
import { ImageError, readImageFile } from "@/lib/image"
import { libraryBackground, useCatalog } from "@/lib/catalog"
import { cn } from "@/lib/utils"

// De onde vem a imagem do card: um arquivo da pessoa, uma peça da biblioteca
// ou arte desenhada na hora. Três naturezas diferentes, um só diálogo.

const ART_STYLES: readonly ImageStyle[] = [
  "blob",
  "arc",
  "waves",
  "dots",
  "grid",
  "beams",
]
const ART_TINTS: readonly ImageTint[] = ["accent", "ink", "bg"]

export function ImagePicker({
  open,
  onOpenChange,
  theme,
  source,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  theme: CarouselTheme
  source: ImageSource
  onPick: (source: ImageSource) => void
}) {
  const { t } = useTranslation()

  function pick(next: ImageSource) {
    onPick(next)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {t("editor.imagePicker.title")}
          </DialogTitle>
          <DialogDescription>
            {t("editor.imagePicker.description")}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={source.kind === "art" ? "art" : source.kind}>
          <TabsList>
            <TabsTrigger value="upload">
              {t("editor.imagePicker.tabs.upload")}
            </TabsTrigger>
            <TabsTrigger value="library">
              {t("editor.imagePicker.tabs.library")}
            </TabsTrigger>
            <TabsTrigger value="art">
              {t("editor.imagePicker.tabs.art")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <UploadPane onPick={pick} />
          </TabsContent>
          <TabsContent value="library">
            <LibraryPane source={source} onPick={pick} />
          </TabsContent>
          <TabsContent value="art">
            <ArtPane theme={theme} source={source} onPick={pick} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function UploadPane({ onPick }: { onPick: (source: ImageSource) => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)

  async function accept(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      onPick(await readImageFile(file))
    } catch (error) {
      const code = error instanceof ImageError ? error.code : "decode"
      toast.error(t(`editor.imagePicker.errors.${code}`))
    } finally {
      setBusy(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    void accept(e.dataTransfer.files[0])
  }

  return (
    <div className="space-y-3 pt-2">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center transition-colors",
          over && "border-primary bg-accent/40"
        )}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <ImageUp className="size-5 text-muted-foreground" />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {t("editor.imagePicker.uploadTitle")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("editor.imagePicker.uploadHint")}
          </p>
        </div>
        <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {t("editor.imagePicker.chooseFile")}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void accept(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("editor.imagePicker.uploadNote")}
      </p>
    </div>
  )
}

function LibraryPane({
  source,
  onPick,
}: {
  source: ImageSource
  onPick: (source: ImageSource) => void
}) {
  const { t } = useTranslation()
  const { imageLibrary } = useCatalog()
  const [query, setQuery] = useState("")

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    return imageLibrary
      .map((piece) => ({
        piece,
        // Peça nova vinda do servidor ainda não tem tradução: mostrar o id é
        // menos ruim do que mostrar a chave crua.
        label: t(`editor.imagePicker.library.${piece.id}`, { defaultValue: piece.id }),
      }))
      .filter((entry) => entry.label.toLowerCase().includes(term))
  }, [imageLibrary, query, t])

  return (
    <div className="space-y-3 pt-2">
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("editor.imagePicker.searchPlaceholder")}
          aria-label={t("editor.imagePicker.searchPlaceholder")}
          className="pl-8"
        />
      </div>

      {results.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("editor.imagePicker.noResults")}
        </p>
      ) : (
        <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto">
          {results.map(({ piece, label }) => (
            <OptionTile
              key={piece.id}
              label={label}
              selected={source.kind === "library" && source.id === piece.id}
              onClick={() => onPick({ kind: "library", id: piece.id })}
              className="aspect-4/5"
            >
              <span
                aria-hidden
                className="block h-full w-full"
                style={{ background: libraryBackground(piece) }}
              />
            </OptionTile>
          ))}
        </div>
      )}
    </div>
  )
}

/** Semente nova para "gerar outra" — a arte muda, o resto do card fica. */
function nextSeed(current: number): number {
  return (current * 1103515245 + 12345) % 100000
}

function ArtPane({
  theme,
  source,
  onPick,
}: {
  theme: CarouselTheme
  source: ImageSource
  onPick: (source: ImageSource) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() =>
    source.kind === "art"
      ? source
      : { kind: "art" as const, style: "blob" as ImageStyle, seed: 7, tint: "accent" as ImageTint }
  )

  return (
    <div className="space-y-4 pt-2">
      <Section label={t("editor.cardPanel.imageStyle")}>
        <div className="grid grid-cols-6 gap-2">
          {ART_STYLES.map((style) => (
            <OptionTile
              key={style}
              label={t(`editor.cardPanel.imageStyles.${style}`)}
              selected={draft.style === style}
              onClick={() => setDraft({ ...draft, style })}
              className="aspect-square"
            >
              <CardImage
                image={{ source: { ...draft, style }, ...CENTER_FRAME }}
                theme={theme}
              />
            </OptionTile>
          ))}
        </div>
      </Section>

      <Section label={t("editor.cardPanel.imageTint")}>
        <div className="flex gap-1.5">
          {ART_TINTS.map((tint) => (
            <Swatch
              key={tint}
              color={
                tint === "accent" ? theme.accent : tint === "ink" ? theme.ink : theme.bg
              }
              label={t(`editor.cardPanel.imageTints.${tint}`)}
              selected={draft.tint === tint}
              onClick={() => setDraft({ ...draft, tint })}
            />
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDraft({ ...draft, seed: nextSeed(draft.seed) })}
        >
          <RefreshCw /> {t("editor.cardPanel.regenerate")}
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => onPick(draft)}>
          {t("editor.imagePicker.useArt")}
        </Button>
      </div>
    </div>
  )
}
