import { useTranslation } from "react-i18next"

import { useHeaderSlot, usePageTitle } from "@/hooks/use-header-slot"
import { useIsMobile } from "@/hooks/use-is-mobile"

import { HeaderActions } from "./editor-header"
import { useFlowContext } from "./flow-context"

// O que o editor põe na barra superior. A barra mora fora da árvore do editor, então o elemento só recebe valores
// simples, e o resto lê dos stores globais.

export function useEditorHeader() {
  const { t } = useTranslation()
  const { flow } = useFlowContext()
  const isMobile = useIsMobile()

  usePageTitle(flow.name, { backTo: "/flows", parentTitle: t("navigation.flows") })

  const actions = <HeaderActions flowId={flow.id} flowName={flow.name} status={flow.status} published={flow.published} triggerType={flow.triggerType} compact={false} />
  const mobileActions = <HeaderActions flowId={flow.id} flowName={flow.name} status={flow.status} published={flow.published} triggerType={flow.triggerType} compact />

  useHeaderSlot(actions, { mobileNode: mobileActions, mobilePlacement: isMobile ? "inline" : "overflow" })
}

