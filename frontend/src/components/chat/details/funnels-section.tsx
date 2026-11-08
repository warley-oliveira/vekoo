import { memo, useId, useMemo, useState } from "react"
import { Link } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { Filter } from "lucide-react"
import { toast } from "sonner"

import { SearchableSelect, type SelectOption } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCan } from "@/hooks/use-can"
import { useFunnels } from "@/hooks/chat-details/use-chat-details-data"
import { useChatFields } from "@/hooks/chat-details/use-chat-fields"
import { ApiError } from "@/lib/api"
import { moveToFunnelStage } from "@/lib/chat-details/actions"
import type { Funnel } from "@/lib/chat-details/types"
import {
  DetailsSection,
  PropertyRow,
  QUIET_FIELD,
  SectionEmpty,
  SectionError,
  SectionRowsSkeleton,
  ShowMoreButton,
} from "./section"

const FIELDS = ["funnelStages", "partial"] as const

/** Com muitos funis, ficam à vista os que têm esta conversa, e o resto a um toque. */
const ALWAYS_VISIBLE = 3

function FunnelRow({
  chatId,
  funnel,
  stageId,
  disabled,
}: {
  chatId: string
  funnel: Funnel
  stageId: string | null
  disabled: boolean
}) {
  const { t } = useTranslation()
  const fieldId = useId()

  const options = useMemo<SelectOption[]>(
    () =>
      [...funnel.stages]
        .sort((a, b) => a.position - b.position)
        .map((stage) => ({ value: stage.id, label: stage.name })),
    [funnel.stages]
  )

  return (
    <PropertyRow label={funnel.name} htmlFor={fieldId}>
      <SearchableSelect
        id={fieldId}
        options={options}
        value={stageId}
        disabled={disabled}
        onChange={(next) => {
          moveToFunnelStage(chatId, funnel.id, next).catch((error: unknown) => {
            toast.error(
              error instanceof ApiError && error.serverMessage
                ? error.serverMessage
                : t("chatDetails.funnels.failed")
            )
          })
        }}
        placeholder={t("chatDetails.funnels.noStage")}
        emptyLabel={t("chatDetails.assignment.noMatch")}
        clearable
        className={QUIET_FIELD}
      />
    </PropertyRow>
  )
}

/** A etapa da conversa em cada funil. Sem a permissão `funnel`, a seção nem existe. */
export const FunnelsSection = memo(function FunnelsSection({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const canManageFunnels = useCan("funnel")
  const chat = useChatFields(chatId, FIELDS)
  const { allowed, funnels, error, isLoading, retry } = useFunnels()
  const [expanded, setExpanded] = useState(false)

  if (!allowed) return null

  const placement = (chat?.funnelStages ?? {}) as Record<string, string | undefined>
  const placed = funnels.filter((funnel) => placement[funnel.id])
  const others = funnels.filter((funnel) => !placement[funnel.id])

  const fixed = funnels.length <= ALWAYS_VISIBLE ? funnels : placed
  const rest = funnels.length <= ALWAYS_VISIBLE ? [] : others

  return (
    <DetailsSection id="funnels" title={t("chatDetails.funnels.title")}>
      {error ? (
        <SectionError message={t("chatDetails.funnels.loadFailed")} onRetry={retry} />
      ) : isLoading ? (
        <SectionRowsSkeleton />
      ) : funnels.length === 0 ? (
        <SectionEmpty
          action={
            canManageFunnels ? (
              <Button
                variant="ghost"
                size="sm"
                className="-mr-2 pointer-coarse:h-10"
                nativeButton={false}
                render={<Link to="/funnels" />}
              >
                <Filter />
                {t("chatDetails.funnels.create")}
              </Button>
            ) : undefined
          }
        >
          {t("chatDetails.funnels.empty")}
        </SectionEmpty>
      ) : (
        <>
          {[...fixed, ...(expanded ? rest : [])].map((funnel) => (
            <FunnelRow
              key={funnel.id}
              chatId={chatId}
              funnel={funnel}
              stageId={placement[funnel.id] ?? null}
              disabled={Boolean(chat?.partial)}
            />
          ))}
          {rest.length > 0 ? (
            <ShowMoreButton
              expanded={expanded}
              hiddenCount={rest.length}
              onToggle={() => setExpanded((value) => !value)}
            />
          ) : null}
        </>
      )}
    </DetailsSection>
  )
})
