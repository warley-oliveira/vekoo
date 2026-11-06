import { useTranslation } from "react-i18next"
import { Columns3 } from "lucide-react"

import { ResponsivePopover } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { BASE_COLUMNS, DEFAULT_COLUMNS, customColumnId } from "@/lib/contacts/columns"
import type { CustomField } from "@/lib/contacts/types"

export type ColumnPickerProps = {
  visible: string[]
  onChange: (next: string[]) => void
  customFields: CustomField[] | undefined
}

const COLUMN_LABELS: Record<(typeof BASE_COLUMNS)[number], string> = {
  connector: "contacts.columns.connector",
  status: "contacts.columns.status",
  tags: "contacts.columns.tags",
  assignee: "contacts.columns.assignee",
  team: "contacts.columns.team",
  last_message_at: "contacts.columns.lastMessage",
  session: "contacts.columns.session",
  automation: "contacts.columns.automation",
  unread_messages: "contacts.columns.unread",
  created_at: "contacts.columns.createdAt",
  notes: "contacts.columns.notes",
}

function ColumnOption({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm hover:bg-muted/50 pointer-coarse:min-h-10">
      <Checkbox
        className="border-muted-foreground/40"
        checked={checked}
        onCheckedChange={onToggle}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  )
}

/** Comparar colunas é o trabalho desta tela, e cada um compara o que interessa. A escolha fica neste navegador. */
export function ColumnPicker({ visible, onChange, customFields }: ColumnPickerProps) {
  const { t } = useTranslation()

  const toggle = (id: string) =>
    onChange(visible.includes(id) ? visible.filter((item) => item !== id) : [...visible, id])

  const isDefault =
    visible.length === DEFAULT_COLUMNS.length &&
    DEFAULT_COLUMNS.every((id) => visible.includes(id))

  return (
    <ResponsivePopover
      title={t("contacts.columns.title")}
      align="end"
      className="w-64 gap-0 overflow-hidden p-0"
      sheetClassName="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      trigger={
        <Button type="button" variant="outline" className="pointer-coarse:h-10">
          <Columns3 />
          {t("contacts.columns.title")}
        </Button>
      }
    >
      <div
        role="group"
        aria-label={t("contacts.columns.title")}
        className="flex max-h-[min(60dvh,26rem)] flex-col overflow-y-auto md:p-2"
      >
        {BASE_COLUMNS.map((id) => (
          <ColumnOption
            key={id}
            label={t(COLUMN_LABELS[id])}
            checked={visible.includes(id)}
            onToggle={() => toggle(id)}
          />
        ))}

        {customFields && customFields.length > 0 ? (
          <>
            <Separator className="my-1.5" />
            <p className="px-1 py-1 text-xs font-medium text-muted-foreground">
              {t("contacts.columns.customFields")}
            </p>
            {customFields.map((field) => {
              const id = customColumnId(field.key)
              return (
                <ColumnOption
                  key={field.id}
                  label={field.name}
                  checked={visible.includes(id)}
                  onToggle={() => toggle(id)}
                />
              )
            })}
          </>
        ) : null}
      </div>
      <div className="border-t pt-1 md:p-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isDefault}
          className="w-full pointer-coarse:h-10"
          onClick={() => onChange(DEFAULT_COLUMNS)}
        >
          {t("contacts.columns.reset")}
        </Button>
      </div>
    </ResponsivePopover>
  )
}
