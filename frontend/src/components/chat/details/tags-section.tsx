import { lazy, memo, Suspense, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

import { ResponsivePopover, TagChip } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useChatTags } from "@/hooks/chat/use-chat-refs"
import { useChatFields } from "@/hooks/chat-details/use-chat-fields"
import { useIsTouch } from "@/hooks/use-media-query"
import { ApiError } from "@/lib/api"
import { applyTag, removeTag } from "@/lib/chat-details/actions"
import type { ChatTag } from "@/lib/chat/types"
import { normalizeSearchText } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { DetailsSection, SectionEmpty } from "./section"

const TagFormDialog = lazy(() => import("./tag-form-dialog"))

const FIELDS = ["tagIds", "partial"] as const
const NO_TAGS: string[] = []

type FormState = { tag: ChatTag | null; name?: string } | null

function TagPicker({
  applied,
  onToggle,
  onCreate,
  onEdit,
}: {
  applied: Set<string>
  onToggle: (tag: ChatTag) => void
  onCreate: (name: string) => void
  onEdit: (tag: ChatTag) => void
}) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const { tags, isLoading, error } = useChatTags()
  const [query, setQuery] = useState("")

  const key = normalizeSearchText(query)
  const found = useMemo(
    () => (key ? tags.filter((tag) => normalizeSearchText(tag.name).includes(key)) : tags),
    [key, tags]
  )
  const exact = tags.some((tag) => normalizeSearchText(tag.name) === key)

  return (
    <div className="flex flex-col gap-1">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("chatDetails.tags.search")}
        aria-label={t("chatDetails.tags.search")}
        autoFocus={!isTouch}
        className="h-8 pointer-coarse:h-10"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          if (found.length > 0) onToggle(found[0])
          else if (query.trim()) onCreate(query.trim())
        }}
      />

      <ul className="-mx-1 max-h-64 overflow-y-auto pt-1 pointer-coarse:max-h-[50dvh]">
        {found.map((tag) => {
          const on = applied.has(tag.id)
          return (
            <li key={tag.id} className="group/tag flex items-center gap-0.5">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(tag)}
                className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <Check
                  aria-hidden
                  className={cn("size-4 shrink-0 text-primary", on ? "opacity-100" : "opacity-0")}
                />
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("chatDetails.tags.edit", { name: tag.name })}
                className="shrink-0 text-muted-foreground opacity-0 group-hover/tag:opacity-100 focus-visible:opacity-100 pointer-coarse:size-10 pointer-coarse:opacity-100"
                onClick={() => onEdit(tag)}
              >
                <Pencil />
              </Button>
            </li>
          )
        })}

        {found.length === 0 && !query.trim() ? (
          <li className="px-2 py-3 text-center text-sm text-muted-foreground">
            {isLoading
              ? t("chatDetails.loading")
              : error
                ? t("chatDetails.tags.loadFailed")
                : t("chatDetails.tags.none")}
          </li>
        ) : null}
      </ul>

      {!exact ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start pointer-coarse:h-10"
          onClick={() => onCreate(query.trim())}
        >
          <Plus />
          {query.trim()
            ? t("chatDetails.tags.createNamed", { name: query.trim() })
            : t("chatDetails.tags.create")}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * As etiquetas à vista, com o X na própria etiqueta. Aplicar e criar ficam no mesmo botão, e o seletor
 * continua aberto: é comum aplicar mais de uma de uma vez.
 */
export const TagsSection = memo(function TagsSection({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const chat = useChatFields(chatId, FIELDS)
  const { byId, isLoading } = useChatTags()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [form, setForm] = useState<FormState>(null)

  const tagIds = chat?.tagIds ?? NO_TAGS
  const applied = useMemo(() => new Set(tagIds), [tagIds])
  const tags = tagIds.flatMap((id) => byId.get(id) ?? [])

  const fail = (error: unknown) =>
    toast.error(
      error instanceof ApiError && error.serverMessage
        ? error.serverMessage
        : t("chatDetails.tags.failed")
    )

  const toggle = (tag: ChatTag) => {
    const run = applied.has(tag.id) ? removeTag(chatId, tag.id) : applyTag(chatId, tag.id)
    run.catch(fail)
  }

  const openForm = (next: NonNullable<FormState>) => {
    setPickerOpen(false)
    setForm(next)
  }

  return (
    <DetailsSection
      id="tags"
      title={t("chatDetails.tags.title")}
      count={tags.length}
      action={
        <ResponsivePopover
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={t("chatDetails.tags.add")}
          align="end"
          className="w-72 p-2"
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("chatDetails.tags.add")}
              title={t("chatDetails.tags.add")}
              disabled={chat?.partial}
              className="text-muted-foreground pointer-coarse:size-10"
            >
              <Plus />
            </Button>
          }
        >
          <TagPicker
            applied={applied}
            onToggle={toggle}
            onCreate={(name) => openForm({ tag: null, name })}
            onEdit={(tag) => openForm({ tag })}
          />
        </ResponsivePopover>
      }
    >
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              color={tag.color}
              title={tag.description ?? undefined}
              onRemove={() => removeTag(chatId, tag.id).catch(fail)}
              removeLabel={t("chatDetails.tags.remove", { name: tag.name })}
            >
              {tag.name}
            </TagChip>
          ))}
        </div>
      ) : isLoading || chat?.partial ? null : (
        <SectionEmpty>{t("chatDetails.tags.empty")}</SectionEmpty>
      )}

      {form ? (
        <Suspense fallback={null}>
          <TagFormDialog
            chatId={chatId}
            tag={form.tag}
            initialName={form.name}
            onClose={() => setForm(null)}
          />
        </Suspense>
      ) : null}
    </DetailsSection>
  )
})
