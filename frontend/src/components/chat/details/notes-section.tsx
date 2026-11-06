import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { Pencil, Plus } from "lucide-react"
import { z } from "zod"

import { Form, FormActions, TextareaField } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useChatFields } from "@/hooks/chat-details/use-chat-fields"
import { useIsTouch } from "@/hooks/use-media-query"
import { updateChat } from "@/lib/chat/actions"
import { DetailsSection, SectionEmpty } from "./section"

const FIELDS = ["notes", "partial"] as const
const MAX_NOTES = 5_000

// O texto em edição, por conversa. Trocar de conversa no meio não pode perder o que a pessoa escreveu,
// nem levar o texto para a conversa seguinte. Fica em memória: uma nota pela metade não sobrevive a
// recarregar a página.
const drafts = new Map<string, string>()

type Values = { notes: string | null }

function NotesEditor({
  chatId,
  saved,
  onDone,
}: {
  chatId: string
  saved: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const formElement = useRef<HTMLFormElement>(null)

  const schema = useMemo(
    () =>
      z.object({
        notes: z
          .string()
          .max(MAX_NOTES, t("chatDetails.notes.tooLong", { max: MAX_NOTES }))
          .nullable(),
      }),
    [t]
  )

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { notes: drafts.get(chatId) ?? saved },
  })

  // Digitar não desenha nada além deste campo: o rascunho vai para fora do React.
  useEffect(() => {
    const { unsubscribe } = form.watch((values) => {
      if (values.notes === saved) drafts.delete(chatId)
      else drafts.set(chatId, values.notes ?? "")
    })
    return unsubscribe
  }, [chatId, form, saved])

  const cancel = () => {
    drafts.delete(chatId)
    onDone()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      cancel()
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      formElement.current?.requestSubmit()
    }
  }

  return (
    <Form
      ref={formElement}
      form={form}
      className="flex flex-col gap-2"
      onKeyDown={onKeyDown}
      onSubmit={async (values) => {
        await updateChat(chatId, { notes: values.notes?.trim() || null })
        drafts.delete(chatId)
        onDone()
      }}
    >
      <TextareaField
        control={form.control}
        name="notes"
        label={t("chatDetails.notes.label")}
        hint={isTouch ? undefined : t("chatDetails.notes.shortcut")}
        placeholder={t("chatDetails.notes.placeholder")}
        rows={4}
        maxLength={MAX_NOTES}
        autoFocus={!isTouch}
        textareaClassName="text-sm"
      />
      <FormActions submitLabel={t("chatDetails.notes.save")} onCancel={cancel} />
    </Form>
  )
}

/**
 * As notas ficam à vista, porque costumam ser o que a pessoa veio procurar ("prefere ser chamada de
 * Tê"). Editar é um toque, e salvar é uma ação: uma nota salva sem querer é lida por toda a equipe.
 */
export const NotesSection = memo(function NotesSection({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const chat = useChatFields(chatId, FIELDS)
  // Voltar a uma conversa com rascunho volta para a edição, com o texto.
  const [editing, setEditing] = useState(() => drafts.has(chatId))

  const notes = chat?.notes ?? ""

  return (
    <DetailsSection
      id="notes"
      title={t("chatDetails.notes.title")}
      action={
        notes && !editing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("chatDetails.notes.edit")}
            title={t("chatDetails.notes.edit")}
            className="text-muted-foreground pointer-coarse:size-10"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <NotesEditor chatId={chatId} saved={notes} onDone={() => setEditing(false)} />
      ) : notes ? (
        <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">{notes}</p>
      ) : chat?.partial ? null : (
        <SectionEmpty
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mr-2 pointer-coarse:h-10"
              onClick={() => setEditing(true)}
            >
              <Plus />
              {t("chatDetails.notes.add")}
            </Button>
          }
        >
          {t("chatDetails.notes.empty")}
        </SectionEmpty>
      )}
    </DetailsSection>
  )
})
