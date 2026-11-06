import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ActionsMenu,
  ColorField,
  FormActions,
  ResponsiveDialog,
  ResponsivePopover,
  TagChip,
  TextareaField,
  TextField,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useChatMutations, useChatTagMutations, useChatTags } from "@/hooks/insights/use-funnel-chat"
import { matchesSearch } from "@/lib/search-text"
import { COLOR_SWATCHES } from "@/lib/tag-color"
import { cn } from "@/lib/utils"
import { funnelErrorMessage } from "./error-message"
import type { ChatTag } from "./types"

type ChatTagsEditorProps = {
  chatId: string
  tagIds: string[]
  /** As etiquetas da conversa mudaram: o cartão acompanha. */
  onChange: (tagIds: string[]) => void
  /** Uma etiqueta mudou de nome ou de cor, ou saiu: outros cartões do quadro podem usá-la. */
  onCatalogChange: () => void
}

/** As etiquetas da conversa: aplicar, tirar, criar na hora e cuidar do cadastro, como na origem. */
export function ChatTagsEditor({ chatId, tagIds, onChange, onCatalogChange }: ChatTagsEditorProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { tags } = useChatTags()
  const { applyTag, removeTag } = useChatMutations(chatId)
  const { createTag, deleteTag, countTagUses } = useChatTagMutations()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [busyTag, setBusyTag] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [editing, setEditing] = useState<ChatTag | null>(null)

  const catalog = useMemo(() => tags ?? [], [tags])
  const selected = useMemo(() => catalog.filter((tag) => tagIds.includes(tag.id)), [catalog, tagIds])
  const matches = useMemo(
    () => (query ? catalog.filter((tag) => matchesSearch(tag.name, query)) : catalog),
    [catalog, query]
  )
  const trimmed = query.trim()
  const hasExactMatch = catalog.some((tag) => tag.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())

  async function toggle(tag: ChatTag) {
    setBusyTag(tag.id)
    try {
      const next = tagIds.includes(tag.id) ? await removeTag(tag.id) : await applyTag(tag.id)
      onChange(next)
    } catch (cause) {
      toast.error(funnelErrorMessage(t, cause))
    } finally {
      setBusyTag(null)
    }
  }

  async function create() {
    if (!trimmed || isCreating) return
    setIsCreating(true)
    try {
      const tag = await createTag({
        name: trimmed,
        // Uma cor para começar, em ordem. Dá para trocar depois, em "Editar".
        color: COLOR_SWATCHES[catalog.length % COLOR_SWATCHES.length],
      })
      onChange(await applyTag(tag.id))
      setQuery("")
      toast.success(t("funnels.tags.created", { name: tag.name }))
    } catch (cause) {
      toast.error(funnelErrorMessage(t, cause))
    } finally {
      setIsCreating(false)
    }
  }

  async function remove(tag: ChatTag) {
    let count = 0
    try {
      count = await countTagUses(tag.id)
    } catch (cause) {
      toast.error(funnelErrorMessage(t, cause))
      return
    }
    const confirmed = await confirm({
      title: t("funnels.tags.deleteTitle", { name: tag.name }),
      description: t(count > 0 ? "funnels.tags.deleteHint" : "funnels.tags.deleteHintEmpty", { count }),
      confirmLabel: t("funnels.tags.delete"),
      destructive: true,
      onConfirm: () => deleteTag(tag.id),
    })
    if (confirmed) {
      toast.success(t("funnels.tags.deleted", { name: tag.name }))
      onChange(tagIds.filter((id) => id !== tag.id))
      onCatalogChange()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((tag) => (
        <TagChip
          key={tag.id}
          color={tag.color}
          removeLabel={t("funnels.tags.remove", { name: tag.name })}
          onRemove={() => void toggle(tag)}
        >
          {tag.name}
        </TagChip>
      ))}

      <ResponsivePopover
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={t("funnels.tags.pick")}
        className="w-72 gap-0 p-0"
        sheetClassName="px-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        trigger={
          <Button type="button" variant="ghost" size="xs" className="text-muted-foreground pointer-coarse:h-8">
            <Plus />
            {t("funnels.tags.add")}
          </Button>
        }
      >
        <div className="px-2 pt-2 pb-1">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("funnels.tags.search")}
            aria-label={t("funnels.tags.search")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                if (trimmed && !hasExactMatch) void create()
              }
            }}
          />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1">
          {matches.map((tag) => {
            const active = tagIds.includes(tag.id)
            return (
              <li key={tag.id} className="flex items-center gap-1 rounded-md hover:bg-muted">
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={busyTag === tag.id}
                  className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
                  onClick={() => void toggle(tag)}
                >
                  <span className={cn("flex size-4 shrink-0 items-center justify-center", !active && "invisible")}>
                    {busyTag === tag.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-4" />}
                  </span>
                  <TagChip color={tag.color} className="max-w-full truncate">
                    {tag.name}
                  </TagChip>
                </button>
                <ActionsMenu
                  label={t("funnels.tags.actionsOf", { name: tag.name })}
                  actions={[
                    {
                      label: t("funnels.tags.edit"),
                      icon: <Pencil />,
                      onSelect: () => setEditing(tag),
                    },
                    {
                      label: t("funnels.tags.delete"),
                      icon: <Trash2 />,
                      destructive: true,
                      separatorBefore: true,
                      onSelect: () => void remove(tag),
                    },
                  ]}
                />
              </li>
            )
          })}
          {matches.length === 0 && !trimmed ? (
            <li className="px-2 py-4 text-center text-xs text-muted-foreground">{t("funnels.tags.empty")}</li>
          ) : null}
        </ul>
        {trimmed && !hasExactMatch ? (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start pointer-coarse:h-10"
              disabled={isCreating}
              onClick={() => void create()}
            >
              {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
              <span className="truncate">{t("funnels.tags.createNamed", { name: trimmed })}</span>
            </Button>
          </div>
        ) : null}
      </ResponsivePopover>

      {editing ? (
        <TagFormDialog
          tag={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onCatalogChange()
          }}
        />
      ) : null}
    </div>
  )
}

function TagFormDialog({ tag, onClose, onSaved }: { tag: ChatTag; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const { updateTag } = useChatTagMutations()

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("funnels.tags.nameRequired")),
        color: z.string().min(1, t("funnels.tags.colorRequired")),
        description: z.string().trim(),
      }),
    [t]
  )
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: tag.name,
      color: tag.color ?? COLOR_SWATCHES[0],
      description: tag.description ?? "",
    },
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async (values) => {
    const saved = await updateTag(tag.id, { ...values, description: values.description || null })
    toast.success(t("funnels.tags.updated", { name: saved.name }))
    onSaved()
  })

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      size="sm"
      title={t("funnels.tags.editTitle")}
      onSubmit={submit}
      footer={<FormActions form={form} submitLabel={t("funnels.tags.save")} onCancel={onClose} requireChanges />}
    >
      <div className="flex flex-col gap-4">
        <TextField control={form.control} name="name" label={t("funnels.tags.name")} hint={t("funnels.tags.nameHint")} autoFocus />
        <ColorField control={form.control} name="color" label={t("funnels.tags.color")} />
        <TextareaField control={form.control} name="description" label={t("funnels.tags.description")} optional />
      </div>
    </ResponsiveDialog>
  )
}
