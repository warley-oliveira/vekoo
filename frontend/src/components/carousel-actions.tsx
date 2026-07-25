import { useState, type ReactElement } from "react"
import { useTranslation } from "react-i18next"
import {
  Copy,
  Download,
  FolderInput,
  FolderMinus,
  Pencil,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { Carousel } from "@/lib/mock-data"
import { newId, useStore } from "@/lib/store"

// Menu de ações de um carrossel — o mesmo na grade, na lista e onde mais
// aparecer. Excluir manda para a lixeira sem confirmação (é reversível, e o
// toast traz "Desfazer"); só a exclusão definitiva, na Lixeira, confirma.

type CarouselActionsMenuProps = {
  carousel: Carousel
  trigger: ReactElement
  align?: "start" | "end"
}

export function CarouselActionsMenu({
  carousel,
  trigger,
  align = "end",
}: CarouselActionsMenuProps) {
  const { t } = useTranslation()
  const { state, dispatch } = useStore()
  const [renameOpen, setRenameOpen] = useState(false)

  function duplicate() {
    dispatch({
      type: "carousel/duplicate",
      id: carousel.id,
      newId: newId("car"),
      title: `${carousel.title} (${t("carousels.actions.copySuffix")})`,
      now: Date.now(),
    })
    toast(t("carousels.actions.duplicatedToast", { title: carousel.title }))
  }

  function moveTo(folderId: string | null, folderName?: string) {
    dispatch({ type: "carousel/move", id: carousel.id, folderId })
    toast(
      folderId
        ? t("carousels.actions.movedToast", { name: folderName })
        : t("carousels.actions.removedFromFolderToast")
    )
  }

  function moveToTrash() {
    dispatch({ type: "carousel/trash", id: carousel.id, now: Date.now() })
    toast(t("carousels.actions.trashedToast", { title: carousel.title }), {
      description: t("carousels.actions.trashedDescription"),
      action: {
        label: t("common.undo"),
        onClick: () =>
          dispatch({ type: "carousel/restore", id: carousel.id }),
      },
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />
        <DropdownMenuContent align={align} className="w-52">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Pencil /> {t("common.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={duplicate}>
            <Copy /> {t("common.duplicate")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput /> {t("carousels.actions.moveToFolder")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {state.folders.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("carousels.actions.noFolders")}
                </p>
              ) : (
                state.folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    disabled={carousel.folderId === folder.id}
                    onClick={() => moveTo(folder.id, folder.name)}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: folder.color }}
                    />
                    {folder.name}
                  </DropdownMenuItem>
                ))
              )}
              {carousel.folderId !== null && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => moveTo(null)}>
                    <FolderMinus /> {t("carousels.actions.removeFromFolder")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onClick={() =>
              toast(t("carousels.actions.exportToast"))
            }
          >
            <Download /> {t("common.export")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={moveToTrash}>
            <Trash2 /> {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        carousel={carousel}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
    </>
  )
}

function RenameDialog({
  carousel,
  open,
  onOpenChange,
}: {
  carousel: Carousel
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { dispatch } = useStore()
  const [title, setTitle] = useState(carousel.title)
  const valid = title.trim().length > 0

  function submit() {
    if (!valid) return
    dispatch({ type: "carousel/rename", id: carousel.id, title: title.trim() })
    toast(t("carousels.actions.renamedToast"))
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setTitle(carousel.title)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("carousels.actions.renameTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("carousels.actions.renameDescription", { title: carousel.title })}
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
          }}
          aria-label={t("carousels.actions.renameFieldAria")}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid} onClick={submit}>
            {t("common.rename")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
