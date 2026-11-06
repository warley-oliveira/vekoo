import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"

import { SettingsSection } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/use-api"
import type { InstagramConnector } from "@/lib/connectors/types"
import { cn } from "@/lib/utils"
import { InstagramProfile } from "./instagram-profile"

const ONE_HOUR_MS = 60 * 60 * 1000

type ProfileResponse = {
  connector: InstagramConnector
  /** Texto técnico, em inglês: só apoio, ao lado de "mostrando o que estava guardado". */
  refreshError?: string
}

/**
 * O perfil do Instagram. A leitura vai até a Meta, que limita chamadas: como na origem,
 * uma por hora e sob demanda. Canal desligado não tem como ler, e fica com o que está
 * guardado.
 */
export function InstagramSection({ connector }: { connector: InstagramConnector }) {
  const { t } = useTranslation()
  const live = connector.status === "active"

  const { data, error, isValidating, mutate } = useApi<ProfileResponse>(
    live ? `/connectors/${connector.id}/instagram-profile` : null,
    {
      dedupingInterval: ONE_HOUR_MS,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  )

  return (
    <SettingsSection
      title={t("connectors.instagram.profile.title")}
      description={t("connectors.instagram.profile.description")}
    >
      <InstagramProfile connector={data?.connector ?? connector} />

      {data?.refreshError || error ? (
        <p className="rounded-lg bg-status-warning-soft px-3 py-2 text-sm text-pretty text-status-warning">
          {t("connectors.instagram.profile.stale")}{" "}
          {data?.refreshError ? (
            <span className="text-xs break-words opacity-80">{data.refreshError}</span>
          ) : null}
        </p>
      ) : null}

      {live ? (
        <Button
          variant="outline"
          size="sm"
          className="w-fit pointer-coarse:h-10"
          disabled={isValidating}
          onClick={() => void mutate()}
        >
          <RefreshCw className={cn(isValidating && "animate-spin")} />
          {t("connectors.instagram.profile.refresh")}
        </Button>
      ) : null}
    </SettingsSection>
  )
}
