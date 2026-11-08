import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigationType, useParams, useSearchParams } from "@/lib/router"
import { CalendarClock, Send } from "lucide-react"

import { CampaignWizard } from "@/components/campaigns-wizard/campaign-wizard"
import { EmptyState, ErrorState, PageBody, PageSkeleton } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/use-api"
import { usePageTitle } from "@/hooks/use-header-slot"
import { ApiError } from "@/lib/api"
import { LINKED_EXTRACTION_PARAM } from "@/lib/campaigns-wizard/form"
import type { CampaignResponse } from "@/lib/campaigns-wizard/types"

// `/campaigns/new`, `/campaigns/new?duplicate=<id>`, `/campaigns/new?placeExtraction=<id>` e
// `/campaigns/:campaignId/edit`.
//
// Criar o rascunho troca a URL de `new` para `edit`, sem o formulário perder nada. Quem decide se a URL nova
// é outro formulário é esta página: se ela aponta para o rascunho que este formulário acabou de criar, nada
// muda. Qualquer outra troca abre uma sessão nova, do zero.

type Session = {
  number: number
  /** O que a rota dizia ao abrir. */
  campaignId: string | null
  duplicateId: string | null
  extractionId: string | null
  /** O que a rota diz agora. */
  routeId: string | null
  routeDuplicateId: string | null
  routeExtractionId: string | null
}

function openSession(
  number: number,
  routeId: string | null,
  duplicateId: string | null,
  extractionId: string | null
): Session {
  return {
    number,
    campaignId: routeId,
    duplicateId,
    extractionId,
    routeId,
    routeDuplicateId: duplicateId,
    routeExtractionId: extractionId,
  }
}

function LockedCampaign({ id, name, status }: { id: string; name: string; status: string }) {
  const { t } = useTranslation()
  const scheduled = status === "scheduled"

  usePageTitle(name, { backTo: "/campaigns", parentTitle: t("navigation.campaigns") })

  return (
    <PageBody>
      <EmptyState
        icon={scheduled ? <CalendarClock className="size-5" /> : <Send className="size-5" />}
        title={scheduled ? t("campaignsWizard.locked.scheduledTitle") : t("campaignsWizard.locked.launchedTitle")}
        description={scheduled ? t("campaignsWizard.locked.scheduledHint") : t("campaignsWizard.locked.launchedHint")}
      />
      <Button className="self-center pointer-coarse:h-10" nativeButton={false} render={<Link to={`/campaigns/${id}`} />}>
        {t("campaignsWizard.locked.open")}
      </Button>
    </PageBody>
  )
}

function WizardLoader({
  campaignId,
  duplicateId,
  extractionId,
  onDraftCreated,
}: {
  campaignId: string | null
  duplicateId: string | null
  extractionId: string | null
  onDraftCreated: (id: string) => void
}) {
  const { t } = useTranslation()
  const sourceId = campaignId ?? duplicateId
  // O que chega depois de aberto não pode passar por cima do que está sendo digitado. E um cache antigo
  // também não: o rascunho aberto precisa ser o de agora.
  const { data, error, isLoading, isValidating, mutate } = useApi<CampaignResponse>(
    sourceId ? `/campaigns/${sourceId}` : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
      dedupingInterval: 0,
      keepPreviousData: false,
    }
  )
  const [opened, setOpened] = useState<CampaignResponse["campaign"] | null>(null)

  if (sourceId && !opened) {
    if (isLoading || isValidating) return <PageSkeleton variant="default" />

    if (error) {
      return (
        <PageBody>
          {error instanceof ApiError && error.status === 404 ? (
            <EmptyState
              icon={<Send className="size-5" />}
              title={t("campaignsWizard.notFound.title")}
              description={t("campaignsWizard.notFound.hint")}
            />
          ) : (
            <ErrorState error={error} onRetry={() => void mutate()} />
          )}
          <Button
            variant="outline"
            className="self-center pointer-coarse:h-10"
            nativeButton={false}
            render={<Link to="/campaigns" />}
          >
            {t("campaignsWizard.notFound.back")}
          </Button>
        </PageBody>
      )
    }

    if (data) setOpened(data.campaign)
    return <PageSkeleton variant="default" />
  }

  if (campaignId && opened && opened.status !== "draft") {
    return <LockedCampaign id={opened.id} name={opened.name} status={opened.status} />
  }

  return (
    <CampaignWizard
      campaign={campaignId ? opened : null}
      copyFrom={duplicateId ? opened : null}
      placeExtractionId={extractionId}
      onDraftCreated={onDraftCreated}
    />
  )
}

export default function CampaignWizardPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const [searchParams] = useSearchParams()
  const navigationType = useNavigationType()
  const routeId = campaignId ?? null
  const routeDuplicateId = routeId ? null : searchParams.get("duplicate")
  const routeExtractionId = routeId ? null : searchParams.get(LINKED_EXTRACTION_PARAM)

  const [session, setSession] = useState(() => openSession(0, routeId, routeDuplicateId, routeExtractionId))
  const [createdId, setCreatedId] = useState<string | null>(null)

  // A busca sair da URL é o assistente dizendo que já tratou dela, não outro formulário. Outra busca, sim.
  const otherExtraction = routeExtractionId !== null && routeExtractionId !== session.routeExtractionId

  if (routeId !== session.routeId || routeDuplicateId !== session.routeDuplicateId || otherExtraction) {
    // O voltar do aparelho pode cair num passo de antes de o rascunho existir: ainda é o mesmo formulário,
    // e `RouteSync` devolve a URL para `edit`. Um "Nova campanha" de verdade entra como PUSH.
    const sameDraft = routeId !== null && routeId === createdId
    const backBeforeDraft = routeId === null && createdId !== null && navigationType === "POP"

    if (sameDraft || backBeforeDraft) {
      setSession({
        ...session,
        routeId,
        routeDuplicateId,
        routeExtractionId: routeExtractionId ?? session.routeExtractionId,
      })
    } else {
      setSession(openSession(session.number + 1, routeId, routeDuplicateId, routeExtractionId))
      setCreatedId(null)
    }
  }

  return (
    <WizardLoader
      key={session.number}
      campaignId={session.campaignId}
      duplicateId={session.duplicateId}
      extractionId={session.extractionId}
      onDraftCreated={setCreatedId}
    />
  )
}
