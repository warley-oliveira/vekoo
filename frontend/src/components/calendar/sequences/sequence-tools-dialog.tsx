import { useTranslation } from "react-i18next"
import { CalendarSearch, Tag, UserRound, type LucideIcon } from "lucide-react"

import { CopyButton, ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"

// O nome exato é o que a pessoa escreve na instrução: precisa ser igual ao que a IA chama
// (`Agenda::SequenceToolExecutor`).
const GROUPS: { key: string; icon: LucideIcon; tools: { key: string; name: string }[] }[] = [
  {
    key: "schedule",
    icon: CalendarSearch,
    tools: [{ key: "checkAvailability", name: "check_availability" }],
  },
  {
    key: "contact",
    icon: UserRound,
    tools: [
      { key: "listContactFields", name: "list_contact_fields" },
      { key: "setContactField", name: "set_contact_field" },
      { key: "removeContactField", name: "remove_contact_field" },
    ],
  },
  {
    key: "tags",
    icon: Tag,
    tools: [
      { key: "listTags", name: "list_tags" },
      { key: "addTag", name: "add_tag" },
      { key: "removeTag", name: "remove_tag" },
    ],
  },
]

type SequenceToolsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** O que a IA de um passo consegue fazer, e como pedir: ela só usa o que a instrução citar. */
export function SequenceToolsDialog({ open, onOpenChange }: SequenceToolsDialogProps) {
  const { t } = useTranslation()

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("calendar.sequences.tools.title")}
      description={t("calendar.sequences.tools.description")}
      footer={
        <Button type="button" className="pointer-coarse:h-10" onClick={() => onOpenChange(false)}>
          {t("calendar.sequences.tools.close")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => {
          const Icon = group.icon
          return (
            <section key={group.key} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm leading-snug font-medium">
                <Icon aria-hidden className="size-4 text-muted-foreground" />
                {t(`calendar.sequences.tools.groups.${group.key}`)}
              </h3>
              <ul className="flex flex-col divide-y">
                {group.tools.map((tool) => {
                  const example = t(`calendar.sequences.tools.items.${tool.key}.example`)
                  return (
                    <li key={tool.key} className="space-y-1 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm">{t(`calendar.sequences.tools.items.${tool.key}.name`)}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tool.name}</code>
                      </div>
                      <p className="text-sm text-pretty text-muted-foreground">
                        {t(`calendar.sequences.tools.items.${tool.key}.description`)}
                      </p>
                      <div className="flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
                        <p className="min-w-0 flex-1 text-xs leading-snug text-pretty">
                          <span className="font-medium">{t("calendar.sequences.tools.example")}</span>{" "}
                          {example}
                        </p>
                        <CopyButton value={example} className="-my-1 shrink-0" />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
        <p className="text-xs leading-snug text-pretty text-muted-foreground">
          {t("calendar.sequences.tools.footer")}
        </p>
      </div>
    </ResponsiveDialog>
  )
}
