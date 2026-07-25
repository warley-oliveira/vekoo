import { useState, type ReactElement } from "react"
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
  const { state, dispatch } = useStore()
  const [renameOpen, setRenameOpen] = useState(false)

  function duplicate() {
    dispatch({
      type: "carousel/duplicate",
      id: carousel.id,
      newId: newId("car"),
      now: Date.now(),
    })
    toast(`“${carousel.title}” duplicado.`)
  }

  function moveTo(folderId: string | null, folderName?: string) {
    dispatch({ type: "carousel/move", id: carousel.id, folderId })
    toast(
      folderId ? `Movido para “${folderName}”.` : "Carrossel tirado da pasta."
    )
  }

  function moveToTrash() {
    dispatch({ type: "carousel/trash", id: carousel.id, now: Date.now() })
    toast(`“${carousel.title}” foi para a lixeira.`, {
      description: "Itens na lixeira somem após 30 dias.",
      action: {
        label: "Desfazer",
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
            <Pencil /> Renomear
          </DropdownMenuItem>
          <DropdownMenuItem onClick={duplicate}>
            <Copy /> Duplicar
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput /> Mover para pasta
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {state.folders.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Crie uma pasta no menu lateral para organizar seus carrosséis.
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
                    <FolderMinus /> Tirar da pasta
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onClick={() =>
              toast("A exportação chega junto com o editor, na próxima etapa.")
            }
          >
            <Download /> Exportar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={moveToTrash}>
            <Trash2 /> Excluir
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
  const { dispatch } = useStore()
  const [title, setTitle] = useState(carousel.title)
  const valid = title.trim().length > 0

  function submit() {
    if (!valid) return
    dispatch({ type: "carousel/rename", id: carousel.id, title: title.trim() })
    toast("Carrossel renomeado.")
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
          <DialogTitle>Renomear carrossel</DialogTitle>
          <DialogDescription className="sr-only">
            Escolha um novo nome para “{carousel.title}”.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
          }}
          aria-label="Nome do carrossel"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!valid} onClick={submit}>
            Renomear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
