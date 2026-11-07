import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronRight, GripVertical, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"
import type { ReceivedGroup } from "@/lib/webhooks/fields"
import { LITERAL } from "@/lib/webhooks/literal"
import type { WebhookStatus } from "@/lib/webhooks/types"

// O que chegou na última requisição em teste. Arrastar para um campo escreve a variável lá; o "+" já cria a ação que
// grava o valor na ficha do contato, que é o que quase todo mundo quer fazer com um campo novo.

export function ReceivedFields({
  groups,
  status,
  onCreateUserField,
}: {
  groups: ReceivedGroup[]
  status: WebhookStatus
  onCreateUserField: (key: string) => void
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(!isMobile)
  const total = groups.reduce((sum, group) => sum + group.fields.length, 0)

  if (total === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3 text-sm">
        {status === "test" ? (
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            {t("webhooks.fields.waiting")}
          </p>
        ) : (
          <p className="font-medium">{t("webhooks.fields.none")}</p>
        )}
        <p className="text-xs text-pretty text-muted-foreground">
          {t(status === "test" ? "webhooks.fields.waitingHint" : "webhooks.fields.noneHint", LITERAL)}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
      >
        <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
        {t("webhooks.fields.title", { count: total })}
      </button>
      {open ? (
        <>
          <p className="text-xs text-pretty text-muted-foreground">{t(isMobile ? "webhooks.fields.hintTouch" : "webhooks.fields.hint")}</p>
          <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1">
            {groups.map((group) => (
              <div key={group.group} className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">{t(`webhooks.fields.groups.${group.group}`, { defaultValue: group.group })}</p>
                <ul className="flex flex-col gap-1">
                  {group.fields.map((field) => (
                    <li
                      key={field.key}
                      draggable={!isMobile}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", `{{${field.key}}}`)
                        event.dataTransfer.effectAllowed = "copy"
                      }}
                      className="group/field flex items-center gap-1 rounded-md py-1 pr-0.5 pl-1 ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 md:cursor-grab md:active:cursor-grabbing"
                    >
                      <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60 max-md:hidden" aria-hidden />
                      <span className="min-w-0 flex-1 px-0.5" title={`{{${field.key}}}: ${field.value}`}>
                        <code className="block truncate font-mono text-xs font-medium">{field.name}</code>
                        <span className="block truncate text-xs text-muted-foreground">{field.value || t("webhooks.fields.empty")}</span>
                      </span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={t("webhooks.fields.createUserField", { name: field.name })}
                              className="shrink-0 text-muted-foreground hover:text-foreground pointer-coarse:size-10"
                              onClick={() => onCreateUserField(field.key)}
                            />
                          }
                        >
                          <Plus />
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("webhooks.fields.createUserFieldHint")}</TooltipContent>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
