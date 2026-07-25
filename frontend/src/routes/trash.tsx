import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Info, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { CardArt } from "@/components/editor/card-art"
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
import { daysLeftInTrash, formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { useStore } from "@/lib/store"

export function TrashPage() {
  const { t } = useTranslation()
  const language = useLanguage()
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
    toast(t("trash.restoredToast", { title }), {
      description: t("trash.restoredDescription"),
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="size-4 shrink-0" />
          {t("trash.notice")}
        </p>
        {trashed.length > 0 && (
          <EmptyTrashButton
            count={trashed.length}
            onConfirm={() => {
              dispatch({ type: "trash/empty" })
              toast(t("trash.emptiedToast"))
            }}
          />
        )}
      </div>

      {trashed.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="size-6" />}
          title={t("trash.emptyTitle")}
          description={t("trash.emptyDescription")}
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {trashed.map((carousel) => {
            const daysLeft = daysLeftInTrash(carousel.trashedAt ?? 0)
            return (
              <li key={carousel.id} className="flex items-center gap-4 p-3">
                <div className="w-12 shrink-0 opacity-70">
                  <CardArt
                    card={carousel.cards[0]}
                    theme={carousel.theme}
                    format={carousel.format}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{carousel.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("carousels.cardCount", { count: carousel.cards.length })}{" "}
                    ·{" "}
                    {t("trash.deletedAt", {
                      when: formatRelative(carousel.trashedAt ?? 0, language),
                    })}{" "}
                    ·{" "}
                    {daysLeft <= 5 ? (
                      <span className="text-destructive">
                        {t("trash.expiresIn", { count: daysLeft })}
                      </span>
                    ) : (
                      t("trash.expiresIn", { count: daysLeft })
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restore(carousel.id, carousel.title)}
                  >
                    <RotateCcw /> {t("common.restore")}
                  </Button>
                  <DeleteForeverButton
                    title={carousel.title}
                    onConfirm={() => {
                      dispatch({
                        type: "carousel/delete-forever",
                        id: carousel.id,
                      })
                      toast(
                        t("trash.deletedForeverToast", {
                          title: carousel.title,
                        })
                      )
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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={t("trash.deleteForeverAria", { title })}
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("trash.deleteForeverTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("trash.deleteForeverDescription", { title })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            {t("trash.deleteForever")}
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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="outline" size="sm" />}
      >
        <Trash2 /> {t("trash.empty")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("trash.emptyConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("trash.emptyConfirmDescription", { count })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost">
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            {t("trash.empty")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
