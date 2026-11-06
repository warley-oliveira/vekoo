import { memo, useId, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { RelativeTime, SearchableSelect, UserAvatar, type SelectOption } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useChatPeople, useChatTeams } from "@/hooks/chat/use-chat-refs"
import { useChatFields } from "@/hooks/chat-details/use-chat-fields"
import { ApiError, apiAssetUrl } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { updateChat, type ChatChanges } from "@/lib/chat/actions"
import { PropertyRow, QUIET_FIELD } from "./section"

const FIELDS = [
  "assignedAccountId",
  "teamId",
  "automationEnabled",
  "automationResumeAt",
  "partial",
] as const

function RowsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-1 border-t border-border/70 px-4 py-2">
      {["w-2/5", "w-1/2", "w-1/4"].map((width) => (
        <div key={width} className="grid h-9 grid-cols-[6.25rem_minmax(0,1fr)] items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  )
}

/**
 * Quem cuida da conversa: pessoa, departamento e automação. Fica logo abaixo do contato, em uma linha
 * cada, e muda ali mesmo. Na origem eram três seletores numa seção dobrável, no meio da rolagem.
 */
export const AssignmentRows = memo(function AssignmentRows({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const chat = useChatFields(chatId, FIELDS)
  const { people, byId: peopleById } = useChatPeople()
  const { teams } = useChatTeams()
  const accountId = useAuth().session?.account.id
  const personField = useId()
  const teamField = useId()
  const automationField = useId()

  // `setupOnly` configura, mas não atende: a API recusaria. Já chega filtrado, e vale conferir aqui.
  const personOptions = useMemo<SelectOption[]>(
    () =>
      people
        .filter((person) => !person.setupOnly)
        .map((person) => ({
          value: person.id,
          label: person.name,
          description: person.email,
          icon: (
            <UserAvatar
              name={person.name}
              src={person.avatarUrl ? apiAssetUrl(person.avatarUrl) : null}
              size="sm"
              className="shrink-0"
            />
          ),
        })),
    [people]
  )

  const teamOptions = useMemo<SelectOption[]>(
    () => teams.map((team) => ({ value: team.id, label: team.name })),
    [teams]
  )

  if (!chat || chat.partial) return <RowsSkeleton />

  const save = (changes: ChatChanges) => {
    updateChat(chatId, changes).catch((error: unknown) => {
      toast.error(
        error instanceof ApiError && error.serverMessage
          ? error.serverMessage
          : t("chatDetails.assignment.failed")
      )
    })
  }

  const toggleAutomation = (enabled: boolean) => {
    updateChat(chatId, { automationEnabled: enabled })
      .then(() => toast.success(enabled ? t("chat.automation.resumedDone") : t("chat.automation.pausedDone")))
      .catch(() => toast.error(t("chat.automation.failed")))
  }

  const assigned = chat.assignedAccountId ? peopleById.get(chat.assignedAccountId) : undefined
  // Quem foi atribuído e depois saiu da lista (virou `setupOnly`, foi revogado) continua na conversa.
  const assignedOption =
    chat.assignedAccountId && !assigned && people.length > 0
      ? { value: chat.assignedAccountId, label: t("chatDetails.assignment.unknownPerson") }
      : undefined
  // Enquanto a lista não chega, "ninguém" seria uma afirmação falsa sobre quem cuida da conversa.
  const personPlaceholder = chat.assignedAccountId
    ? t("chatDetails.loading")
    : t("chatDetails.assignment.noPerson")
  const teamPlaceholder = chat.teamId ? t("chatDetails.loading") : t("chatDetails.assignment.noTeam")

  return (
    <div className="border-t border-border/70 px-4 py-1.5">
      <PropertyRow label={t("chatDetails.assignment.person")} htmlFor={personField}>
        {/* "Assumir" fica sobre o campo: ao lado, encolheria também a lista que abre dele. */}
        <div className="group/person relative min-w-0 flex-1">
          <SearchableSelect
            id={personField}
            options={personOptions}
            selectedOption={assignedOption}
            value={chat.assignedAccountId}
            onChange={(value) => save({ assignedAccountId: value })}
            placeholder={personPlaceholder}
            emptyLabel={t("chatDetails.assignment.noMatch")}
            clearable
            className={QUIET_FIELD}
          />
          {!chat.assignedAccountId && accountId ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="absolute top-1/2 right-8 -translate-y-1/2 text-primary group-focus-within/person:hidden pointer-coarse:h-8"
              onClick={() => save({ assignedAccountId: accountId })}
            >
              {t("chatDetails.assignment.takeOver")}
            </Button>
          ) : null}
        </div>
      </PropertyRow>

      <PropertyRow label={t("chatDetails.assignment.team")} htmlFor={teamField}>
        <SearchableSelect
          id={teamField}
          options={teamOptions}
          value={chat.teamId}
          onChange={(value) => save({ teamId: value })}
          placeholder={teamPlaceholder}
          emptyLabel={t("chatDetails.assignment.noMatch")}
          clearable
          className={QUIET_FIELD}
        />
      </PropertyRow>

      <PropertyRow label={t("chatDetails.assignment.automation")} htmlFor={automationField}>
        <span className="min-w-0 flex-1 truncate pl-2.5 text-sm">
          {chat.automationEnabled ? (
            t("chatDetails.assignment.automationOn")
          ) : chat.automationResumeAt ? (
            <>
              {t("chatDetails.assignment.automationBack")}{" "}
              <RelativeTime value={chat.automationResumeAt} />
            </>
          ) : (
            t("chatDetails.assignment.automationOff")
          )}
        </span>
        <Switch
          id={automationField}
          checked={chat.automationEnabled}
          aria-label={t("chatDetails.assignment.automation")}
          className="mr-1"
          onCheckedChange={toggleAutomation}
        />
      </PropertyRow>
    </div>
  )
})
