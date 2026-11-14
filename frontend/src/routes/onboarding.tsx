import { useState } from "react"
import { Navigate, useNavigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ErrorState } from "@/components/error-state"
import { OnboardingChat } from "@/components/onboarding/onboarding-chat"
import { OnboardingIntro } from "@/components/onboarding/onboarding-intro"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandCore } from "@/hooks/use-brand-core"
import { useOnboarding, useOnboardingThread } from "@/hooks/use-onboarding"
import { ApiError } from "@/lib/api"
import { brandPath, useActiveBrand } from "@/lib/brand-context"

/**
 * `/brands/:brandId/onboarding` — a marca montada por conversa.
 *
 * É a porta de entrada de toda marca nova. Antes de começar, a intro; depois,
 * a conversa, que persiste no servidor — sair e voltar (inclusive de outro
 * aparelho) retoma de onde parou. O wizard de seções continua em
 * `/setup/:step`, como modo de edição, e não é linkado daqui.
 *
 * Tela cheia, nos tokens do tema como o resto da plataforma (claro e escuro).
 */
export function OnboardingPage() {
  return <OnboardingContent />
}

function OnboardingContent() {
  const { t } = useTranslation()
  const { brandId, path } = useActiveBrand()
  const brand = useBrandCore(brandId)
  const { thread, isLoading, error, reload } = useOnboardingThread(brandId)
  const { start } = useOnboarding(brandId)
  const [starting, setStarting] = useState(false)
  const [justStarted, setJustStarted] = useState(false)
  const navigate = useNavigate()

  // Sair do onboarding é ir para o início da marca, nunca para fora do app: a
  // conversa fica salva no servidor e o card do painel a retoma de onde parou.
  function leave() {
    navigate(brandPath(brandId))
  }

  async function begin() {
    setStarting(true)
    try {
      await start()
      setJustStarted(true)
    } catch (startError) {
      toast.error(
        startError instanceof ApiError && startError.code === "network"
          ? t("onboarding.errors.offline")
          : t("onboarding.errors.modelDown")
      )
    } finally {
      setStarting(false)
    }
  }

  const failure = (error && !thread) || (brand.error && !brand.brandCore)
  if (failure) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <ErrorState
          error={error ?? brand.error}
          onRetry={() => {
            void reload()
            void brand.reload()
          }}
        />
      </div>
    )
  }

  if (isLoading || !thread || !brand.brandCore) return <ChatSkeleton />

  // Marca publicada já passou por aqui: o caminho dela é criar.
  if (brand.brandCore.status === "published") return <Navigate to={path("/create")} replace />

  if (!thread.conversationId) {
    return <OnboardingIntro starting={starting} onStart={() => void begin()} onBack={leave} />
  }

  return <OnboardingChat brandCore={brand.brandCore} thread={thread} justStarted={justStarted} onLeave={leave} />
}

/** O esqueleto tem a forma da conversa: cabeçalho, falas e o campo embaixo. */
function ChatSkeleton() {
  return (
    <div className="flex h-dvh flex-col" aria-busy>
      <div className="shrink-0">
        <div className="mx-auto flex h-12 max-w-160 items-center px-4">
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="h-0.5 bg-vk-faint" />
      </div>
      <div className="mx-auto w-full max-w-160 flex-1 space-y-4 px-4 pt-8">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="ml-auto h-10 w-1/2 rounded-vk-sm" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="mx-auto w-full max-w-160 px-3 pb-3">
        <Skeleton className="h-[3.25rem] w-full rounded-vk" />
      </div>
    </div>
  )
}
