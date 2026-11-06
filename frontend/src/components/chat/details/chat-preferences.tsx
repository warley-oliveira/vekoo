import { useId, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { ResponsiveDialog } from "@/components/shared"
import { Switch } from "@/components/ui/switch"
import { useChatSettings } from "@/hooks/chat-details/use-chat-settings"
import { useChatListPrefs } from "@/lib/chat-details/list-prefs"

function PreferenceRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()

  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer space-y-0.5">
        <span className="block text-sm leading-snug font-medium">{label}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        className="mt-0.5"
        onCheckedChange={onChange}
      />
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[0.8125rem] font-medium">{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="mt-1 divide-y">{children}</div>
    </section>
  )
}

/**
 * Preferências do chat. O que muda só neste aparelho vem separado do que vale para a organização
 * inteira: a pessoa precisa saber o alcance antes de mexer. Tudo vale na hora.
 */
export default function ChatPreferences({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const showTags = useChatListPrefs((state) => state.showTags)
  const showPhone = useChatListPrefs((state) => state.showPhone)
  const setShowTags = useChatListPrefs((state) => state.setShowTags)
  const setShowPhone = useChatListPrefs((state) => state.setShowPhone)
  const { settings, update } = useChatSettings()

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("chatDetails.preferences.title")}
      size="md"
    >
      <div className="flex flex-col gap-5 pt-1">
        <Group
          title={t("chatDetails.preferences.listGroup")}
          hint={t("chatDetails.preferences.listGroupHint")}
        >
          <PreferenceRow
            label={t("chatDetails.preferences.showTags")}
            hint={t("chatDetails.preferences.showTagsHint")}
            checked={showTags}
            onChange={setShowTags}
          />
          <PreferenceRow
            label={t("chatDetails.preferences.showPhone")}
            hint={t("chatDetails.preferences.showPhoneHint")}
            checked={showPhone}
            onChange={setShowPhone}
          />
        </Group>

        <Group
          title={t("chatDetails.preferences.orgGroup")}
          hint={t("chatDetails.preferences.orgGroupHint")}
        >
          <PreferenceRow
            label={t("chatDetails.preferences.autoRemove")}
            hint={t("chatDetails.preferences.autoRemoveHint")}
            checked={Boolean(settings.autoRemoveWaitingOperatorTag)}
            onChange={(checked) => void update({ autoRemoveWaitingOperatorTag: checked })}
          />
          <PreferenceRow
            label={t("chatDetails.preferences.reopen")}
            hint={t("chatDetails.preferences.reopenHint")}
            checked={Boolean(settings.reopenConversationOnInboundEnabled)}
            onChange={(checked) => void update({ reopenConversationOnInboundEnabled: checked })}
          />
        </Group>
      </div>
    </ResponsiveDialog>
  )
}
