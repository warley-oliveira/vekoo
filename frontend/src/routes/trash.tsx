import { useMemo, useState } from "react"
import { Info, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { CarouselCover } from "@/components/carousel-cover"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { daysLeftInTrash, formatCardCount, formatRelative } from "@/lib/format"
import { useStore } from "@/lib/store"

export function TrashPage() {
  const { state, dispatch } = useStore()

  const trashed = useMemo(
    () =>
      state.carousels
        .filter((c) => c.trashedAt !== null)
        .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
    [state.carousels]
  )

  function restore(id: string, title: string) {
    dispatch({ type: "carousel/restore", id })
    toast(`“${title}” restaurado.`, {
      description: "Ele voltou para Meus carrosséis.",
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Itens na lixeira somem definitivamente após 30 dias.
        </p>
        {trashed.length > 0 && (
          <EmptyTrashButton
            count={trashed.length}
            onConfirm={() => {
              dispatch({ type: "trash/empty" })
              toast("Lixeira esvaziada.")
            }}
          />
        )}
      </div>

      {trashed.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="size-6" />}
          title="A lixeira está vazia"
          description="Carrosséis excluídos ficam aqui por 30 dias antes de sumirem de vez."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {trashed.map((carousel) => {
            const daysLeft = daysLeftInTrash(carousel.trashedAt ?? 0)
            return (
              <li key={carousel.id} className="flex items-center gap-4 p-3">
                <div className="w-12 shrink-0 opacity-70">
                  <CarouselCover cover={carousel.cover} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{carousel.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCardCount(carousel.cards.length)} · excluído{" "}
                    {formatRelative(carousel.trashedAt ?? 0)} ·{" "}
                    {daysLeft <= 5 ? (
                      <span className="text-destructive">
                        some em {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
                      </span>
                    ) : (
                      `some em ${daysLeft} dias`
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restore(carousel.id, carousel.title)}
                  >
                    <RotateCcw /> Restaurar
                  </Button>
                  <DeleteForeverButton
                    title={carousel.title}
                    onConfirm={() => {
                      dispatch({
                        type: "carousel/delete-forever",
                        id: carousel.id,
                      })
                      toast(`“${carousel.title}” excluído definitivamente.`)
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function DeleteForeverButton({
  title,
  onConfirm,
}: {
  title: string
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Excluir “${title}” definitivamente`}
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir definitivamente?</AlertDialogTitle>
          <AlertDialogDescription>
            “{title}” será apagado para sempre. Essa ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            Excluir definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function EmptyTrashButton({
  count,
  onConfirm,
}: {
  count: number
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="outline" size="sm" />}
      >
        <Trash2 /> Esvaziar lixeira
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Esvaziar a lixeira?</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1
              ? "O item na lixeira será apagado para sempre."
              : `Os ${count} itens na lixeira serão apagados para sempre.`}{" "}
            Essa ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            Esvaziar lixeira
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
