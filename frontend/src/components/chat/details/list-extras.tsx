import { lazy, memo, Suspense, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { CheckSquare, MoreHorizontal, Settings2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { disconnectCopilot } from "@/lib/chat-details/copilot-store"
import { openCopilot } from "@/lib/chat-details/panel-store"
import { useChatSelection } from "@/lib/chat-details/selection"

const ChatPreferences = lazy(() => import("./chat-preferences"))

/**
 * Copiloto à mão, e o resto num menu: escolher conversas e preferências são coisas de vez em quando.
 * Esta linha vive enquanto a pessoa estiver no chat, então é ela quem solta o canal do copiloto.
 */
export const ListActions = memo(function ListActions() {
  const { t } = useTranslation()
  const enterSelection = useChatSelection((state) => state.enter)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [preferencesEverOpen, setPreferencesEverOpen] = useState(false)

  useEffect(() => disconnectCopilot, [])

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("chatDetails.copilot.open")}
        title={t("chatDetails.copilot.open")}
        className="shrink-0 pointer-coarse:size-10"
        onClick={openCopilot}
      >
        <Sparkles />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("chatDetails.list.more")}
              title={t("chatDetails.list.more")}
              className="shrink-0 pointer-coarse:size-10"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-52">
          <DropdownMenuItem onClick={enterSelection}>
            <CheckSquare />
            {t("chatDetails.list.select")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setPreferencesEverOpen(true)
              setPreferencesOpen(true)
            }}
          >
            <Settings2 />
            {t("chatDetails.list.preferences")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {preferencesEverOpen ? (
        <Suspense fallback={null}>
          <ChatPreferences open={preferencesOpen} onOpenChange={setPreferencesOpen} />
        </Suspense>
      ) : null}
    </>
  )
})
