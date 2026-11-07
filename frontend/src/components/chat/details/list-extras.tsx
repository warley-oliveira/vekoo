import { memo } from "react"
import { useTranslation } from "react-i18next"
import { CheckSquare, MoreHorizontal, Settings2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useChatPreferencesPanel, useListCleanup } from "@/hooks/chat-details/use-list-extras"
import { toggleCopilot } from "@/lib/chat-details/panel-store"
import { useChatSelection } from "@/lib/chat-details/selection"

/**
 * Copiloto à mão, e o resto num menu: escolher conversas e preferências são coisas de vez em quando.
 * Esta linha vive enquanto a pessoa estiver no chat, então é ela quem solta o canal do copiloto.
 */
export const ListActions = memo(function ListActions() {
  const { t } = useTranslation()
  const enterSelection = useChatSelection((state) => state.enter)
  const preferences = useChatPreferencesPanel()
  useListCleanup()

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("chatDetails.copilot.open")}
        title={t("chatDetails.copilot.open")}
        className="shrink-0 pointer-coarse:size-10"
        onClick={toggleCopilot}
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
          <DropdownMenuItem onClick={preferences.open}>
            <Settings2 />
            {t("chatDetails.list.preferences")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {preferences.panel}
    </>
  )
})
