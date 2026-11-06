import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import { Sparkles, UserRound, X } from "lucide-react"

import { SegmentedControl } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useDetailsPrefs, type DetailsTab } from "@/lib/chat-details/panel-store"
import { ContactDetails } from "./contact-details"
import { DetailsSkeleton } from "./details-skeleton"

// O markdown e o streaming só descem para quem abre o copiloto.
const CopilotPanel = lazy(() => import("../copilot/copilot-panel"))

/**
 * O painel ao lado da conversa, ou por cima dela no celular. Duas abas: quem está do outro lado e o
 * copiloto. O copiloto não depende de conversa aberta, então é o que resta quando não há nenhuma.
 */
export default function DetailsPanel({
  chatId,
  onClose,
}: {
  chatId: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const storedTab = useDetailsPrefs((state) => state.tab)
  const setTab = useDetailsPrefs((state) => state.setTab)
  const tab: DetailsTab = chatId ? storedTab : "copilot"

  return (
    <div
      role="region"
      aria-label={t("chatDetails.panelLabel")}
      className="flex h-full min-h-0 flex-col bg-background max-md:pb-[max(var(--app-bottom-nav-total,0px),var(--kb-inset,0px))]"
    >
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-3">
        {chatId ? (
          <SegmentedControl<DetailsTab>
            aria-label={t("chatDetails.tabsLabel")}
            fullWidth
            className="min-w-0 flex-1"
            value={tab}
            onChange={setTab}
            options={[
              { value: "contact", label: t("chatDetails.tabs.contact"), icon: <UserRound /> },
              { value: "copilot", label: t("chatDetails.tabs.copilot"), icon: <Sparkles /> },
            ]}
          />
        ) : (
          <h2 className="flex min-w-0 flex-1 items-center gap-2 pl-1 font-heading text-base font-semibold tracking-tight">
            <Sparkles aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t("chatDetails.tabs.copilot")}</span>
          </h2>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("chatDetails.close")}
          title={t("chatDetails.close")}
          className="shrink-0 pointer-coarse:size-10"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      {tab === "contact" && chatId ? (
        <ContactDetails key={chatId} chatId={chatId} />
      ) : (
        <Suspense fallback={<DetailsSkeleton />}>
          <CopilotPanel chatId={chatId} />
        </Suspense>
      )}
    </div>
  )
}
