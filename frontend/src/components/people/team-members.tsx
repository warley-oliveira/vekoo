import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { X } from "lucide-react"
import { toast } from "sonner"

import { InlineError, ListSkeleton, SearchableSelect } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePeople, usePersonMutations } from "@/hooks/people/use-people"
import { useSession } from "@/lib/auth"
import { useMotionPreset } from "@/lib/motion"
import { errorMessage } from "@/lib/people/error-message"
import { firstName } from "@/lib/people/person-rules"
import type { Person, Team } from "@/lib/people/types"
import { PersonIdentity } from "./person-identity"

/**
 * Quem faz parte do departamento. Cada mudança vale na hora e é uma gravação na ficha da
 * pessoa, porque é lá que o vínculo mora (`teamIds` em `PATCH /users/:id`).
 */
export function TeamMembers({ team }: { team: Team }) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const { account: actor } = useSession()
  const { people, error, isLoading, reload } = usePeople()
  const { setPersonTeams } = usePersonMutations()
  // Limpa o campo a cada escolha: ele serve para adicionar, não para guardar um valor.
  const [pickerKey, setPickerKey] = useState(0)

  // Quem foi revogado não atende por departamento nenhum, então não aparece aqui.
  const active = useMemo(() => (people ?? []).filter((person) => !person.revokedAt), [people])
  const members = useMemo(
    () => active.filter((person) => person.teamIds.includes(team.id)),
    [active, team.id]
  )

  const canManage = (person: Person) => person.role !== "owner" || actor.role === "owner"

  const candidates = useMemo(
    () =>
      active
        .filter((person) => !person.teamIds.includes(team.id))
        .map((person) => ({
          value: person.id,
          label: person.name,
          description: person.email,
          disabled: !canManage(person),
        })),
    // `canManage` só depende de `actor.role`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, actor.role, team.id]
  )

  async function add(id: string | null) {
    const person = active.find((candidate) => candidate.id === id)
    setPickerKey((key) => key + 1)
    if (!person) return

    try {
      await setPersonTeams(person, [...person.teamIds, team.id])
      toast.success(
        t("people.teams.members.added", { name: firstName(person.name), team: team.name })
      )
    } catch (cause) {
      toast.error(errorMessage(t, cause))
    }
  }

  async function removeMember(person: Person) {
    try {
      await setPersonTeams(
        person,
        person.teamIds.filter((id) => id !== team.id)
      )
      toast.success(
        t("people.teams.members.removed", { name: firstName(person.name), team: team.name })
      )
    } catch (cause) {
      toast.error(errorMessage(t, cause))
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-5">
      <div>
        <h3 className="text-sm font-medium">{t("people.teams.members.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("people.teams.members.hint")}</p>
      </div>

      {error && !people ? (
        <div className="rounded-lg border border-dashed">
          <InlineError onRetry={reload} />
        </div>
      ) : isLoading ? (
        <ListSkeleton rows={3} avatar twoLines />
      ) : (
        <>
          <SearchableSelect
            key={pickerKey}
            aria-label={t("people.teams.members.add")}
            value={null}
            onChange={(id) => void add(id)}
            options={candidates}
            placeholder={t("people.teams.members.add")}
            emptyLabel={t("people.teams.members.noCandidates")}
          />
          {members.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              {t("people.teams.members.empty")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              <AnimatePresence initial={false}>
                {members.map((person) => (
                  <motion.li
                    key={person.id}
                    layout="position"
                    {...preset.listItem}
                    className="flex items-center gap-2 py-2 pr-1.5 pl-3"
                  >
                    <PersonIdentity
                      name={person.name}
                      email={person.email}
                      avatarUrl={person.avatarUrl}
                      className="flex-1"
                    />
                    {canManage(person) ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("people.teams.members.remove", { name: person.name })}
                              className="text-muted-foreground"
                              onClick={() => void removeMember(person)}
                            />
                          }
                        >
                          <X />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("people.teams.members.remove", { name: firstName(person.name) })}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}
    </section>
  )
}
