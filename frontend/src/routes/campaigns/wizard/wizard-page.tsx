import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useParams, useSearchParams } from "react-router"
import { CalendarClock, Send } from "lucide-react"

import { CampaignWizard } from "@/components/campaigns-wizard/campaign-wizard"
import { EmptyState, ErrorState, PageBody, PageSkeleton } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/use-api"
import { ApiError } from "@/lib/api"
import type { CampaignResponse } from "@/lib/campaigns-wizard/types"

// `/campaigns/new`, `/campaigns/new?duplicate=<id>` e `/campaigns/:campaignId/edit`.
//
// Criar o rascunho troca a URL de `new` para `edit`, sem o formulário perder nada. Quem decide se a URL nova
// é outro formulário é esta página: se ela aponta para o rascunho que este formulário acabou de criar, nada
// muda. Qualquer outra troca abre uma sessão nova, do zero.

type Session = {
  number: number
  /** O que a rota dizia ao abrir. */
  campaignId: string | null
  duplicateId: string | null
  /** O que a rota diz agora. */
  routeId: string | null
  routeDuplicateId: string | null
}

function openSession(number: number, routeId: string | null, duplicateId: string | null): Session {
  return { number, campaignId: routeId, duplicateId, routeId, routeDuplicateId: duplicateId }
}

function LockedCampaign({ id, status }: { id: string; status: string }) {
  const { t } = useTranslation()
  const scheduled = status === "scheduled"

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
  onDraftCreated,
}: {
  campaignId: string | null
  duplicateId: string | null
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
    return <LockedCampaign id={opened.id} status={opened.status} />
  }

  return (
    <CampaignWizard
      campaign={campaignId ? opened : null}
      copyFrom={duplicateId ? opened : null}
      onDraftCreated={onDraftCreated}
    />
  )
}

export default function CampaignWizardPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const [searchParams] = useSearchParams()
  const routeId = campaignId ?? null
  const routeDuplicateId = routeId ? null : searchParams.get("duplicate")

  const [session, setSession] = useState(() => openSession(0, routeId, routeDuplicateId))
  const [createdId, setCreatedId] = useState<string | null>(null)

  if (routeId !== session.routeId || routeDuplicateId !== session.routeDuplicateId) {
    if (routeId !== null && routeId === createdId) {
      setSession({ ...session, routeId, routeDuplicateId })
    } else {
      setSession(openSession(session.number + 1, routeId, routeDuplicateId))
      setCreatedId(null)
    }
  }

  return (
    <WizardLoader
      key={session.number}
      campaignId={session.campaignId}
      duplicateId={session.duplicateId}
      onDraftCreated={setCreatedId}
    />
  )
}
