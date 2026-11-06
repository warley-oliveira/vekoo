import { useTranslation } from "react-i18next"

import { StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import {
  BLANK_PERMISSIONS,
  CHAT_LIST_LEVELS,
  FULL_PERMISSIONS,
  PERMISSION_SECTIONS,
  chatListLevel,
  isGranted,
  type PermissionResource,
} from "@/lib/people/permissions"
import type { AccessRolePermissions } from "@/lib/people/types"

type PermissionEditorProps = {
  value: AccessRolePermissions
  onChange: (value: AccessRolePermissions) => void
  error?: string
}

/**
 * O mapa de permissões em linguagem de gente: cada linha é uma área do menu e diz o que ela
 * libera. Fica na ordem do menu lateral, que é como a pessoa conhece o produto.
 */
export function PermissionEditor({ value, onChange, error }: PermissionEditorProps) {
  const { t } = useTranslation()

  function setLevel(resource: PermissionResource, granted: boolean) {
    onChange({ ...value, [resource]: granted ? "all" : "none" })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">{t("people.roles.editor.title")}</h3>
        <div className="-mr-2 flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:h-10"
            onClick={() => onChange({ ...FULL_PERMISSIONS, chat_list_to: value.chat_list_to })}
          >
            {t("people.roles.editor.grantAll")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:h-10"
            onClick={() => onChange({ ...BLANK_PERMISSIONS, chat_list_to: value.chat_list_to })}
          >
            {t("people.roles.editor.revokeAll")}
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {PERMISSION_SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={`permissions-${section.id}`}>
          <h4
            id={`permissions-${section.id}`}
            className="mb-1.5 text-xs font-medium text-muted-foreground"
          >
            {t(`navigation.groups.${section.id}`)}
          </h4>
          <ul className="flex flex-col divide-y rounded-lg border">
            {section.resources.map((resource) => {
              const level = value[resource]
              const granted = isGranted(level)

              return (
                <li key={resource}>
                  <label className="flex cursor-pointer items-center justify-between gap-4 px-3 py-2.5 transition-colors hover:bg-muted/40">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                        {t(`people.roles.resources.${resource}.label`)}
                        {/* `own` vem da API, mas nada na plataforma faz diferença entre ele e
                            `all`. A tela não oferece, e também não apaga em silêncio. */}
                        {level === "own" ? (
                          <StatusBadge tone="neutral" dot={false} className="font-normal">
                            {t("people.roles.editor.ownLevel")}
                          </StatusBadge>
                        ) : null}
                      </span>
                      <span className="block text-xs leading-snug text-muted-foreground">
                        {t(`people.roles.resources.${resource}.description`)}
                      </span>
                    </span>
                    <Switch
                      checked={granted}
                      onCheckedChange={(checked) => setLevel(resource, checked)}
                    />
                  </label>

                  {resource === "chat" ? (
                    <Collapsible open={granted}>
                      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
                        <ChatVisibility
                          value={chatListLevel(value)}
                          onChange={(next) => onChange({ ...value, chat_list_to: next })}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ChatVisibility({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const labelId = "permissions-chat-visibility"

  return (
    <div className="border-t border-dashed px-3 py-2.5">
      <p id={labelId} className="mb-2 text-xs font-medium text-muted-foreground">
        {t("people.roles.chatList.title")}
      </p>
      <RadioGroup
        value={value}
        aria-labelledby={labelId}
        onValueChange={(next) => onChange(String(next))}
        className="gap-1"
      >
        {CHAT_LIST_LEVELS.map((level) => (
          <label
            key={level}
            className="flex cursor-pointer items-start gap-2.5 rounded-md py-1 pointer-coarse:min-h-10"
          >
            <RadioGroupItem value={level} className="mt-0.5 border-muted-foreground/40" />
            <span className="min-w-0">
              <span className="block text-sm leading-snug">
                {t(`people.roles.chatList.${level}.label`)}
              </span>
              <span className="block text-xs leading-snug text-muted-foreground">
                {t(`people.roles.chatList.${level}.description`)}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}
