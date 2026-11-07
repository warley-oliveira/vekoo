import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { MessageSquareText, Plus, Trash2 } from "lucide-react"
import { z } from "zod"

import { ResponsivePopover, TextareaField, useFormSubmit } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { formatDateTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { newWidgetId } from "@/lib/custom-dashboards/layout"
import type { DashboardWidget } from "@/lib/custom-dashboards/types"

import { useWidgetActions } from "./widget-actions"

const MAX_NOTE = 500

function buildSchema(t: (key: string) => string) {
  return z.object({ text: z.string().trim().min(1, t("customDashboards.notes.required")).max(MAX_NOTE) })
}

/**
 * As notas de um card: o que aconteceu naquela semana, por que o número caiu. Ler é para todos; escrever e apagar, como na
 * origem, só em edição, porque elas moram no card e vão junto ao salvar.
 */
export function WidgetNotesPopover({ widget, editing }: { widget: DashboardWidget; editing: boolean }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const actions = useWidgetActions()
  const author = useAuth().session?.account.name
  const notes = widget.visualConfig.annotations ?? []

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { text: "" },
    mode: "onSubmit",
  })

  const add = useFormSubmit(form, ({ text }) => {
    actions?.setNotes(widget.id, [
      ...notes,
      { id: newWidgetId(), text, createdAt: new Date().toISOString(), ...(author ? { author } : {}) },
    ])
    form.reset({ text: "" })
  })

  return (
    <ResponsivePopover
      title={t("customDashboards.notes.title")}
      align="end"
      showTitle
      className="w-80 gap-3 p-3"
      trigger={
        <Button
          type="button"
          variant="ghost"
          size={notes.length ? "xs" : "icon-xs"}
          aria-label={t("customDashboards.notes.openOf", { count: notes.length, title: widget.title })}
          title={t("customDashboards.notes.open", { count: notes.length })}
          className="gap-1 text-muted-foreground"
        >
          <MessageSquareText />
          {notes.length ? <span className="tabular-nums">{notes.length}</span> : null}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(editing ? "customDashboards.notes.emptyEditing" : "customDashboards.notes.empty")}
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto [scrollbar-width:thin]">
            {notes.map((note) => (
              <li key={note.id} className="flex items-start gap-2 rounded-lg bg-muted/50 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm break-words whitespace-pre-wrap">{note.text}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[formatDateTime(note.createdAt, language), note.author].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {editing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("customDashboards.notes.remove")}
                    className="text-muted-foreground"
                    onClick={() => actions?.setNotes(widget.id, notes.filter((item) => item.id !== note.id))}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {editing ? (
          <form onSubmit={add} noValidate className="flex flex-col gap-2">
            <TextareaField control={form.control} name="text" label={t("customDashboards.notes.newLabel")} maxLength={MAX_NOTE} />
            <Button type="submit" size="sm" variant="outline" className="self-end pointer-coarse:h-10">
              <Plus />
              {t("customDashboards.notes.add")}
            </Button>
          </form>
        ) : null}
      </div>
    </ResponsivePopover>
  )
}
