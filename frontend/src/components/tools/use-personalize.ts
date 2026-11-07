import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { useToolTexts } from "@/components/tools/tool-texts"
import { useToolCatalog } from "@/hooks/tools/use-tool-catalog"
import { useToolFunctionMutations } from "@/hooks/tools/use-tool-functions"
import type { ToolFunction } from "@/lib/tools/types"

/**
 * Personalizar desvincula a função da ferramenta. Não tem volta sem reinstalar, e a chave guardada na instalação deixa
 * de chegar ao script: a confirmação diz isso quando a ferramenta tem chave.
 */
export function usePersonalize() {
  const { t } = useTranslation()
  const texts = useToolTexts()
  const confirm = useConfirm()
  const { tools } = useToolCatalog()
  const { personalizeFunction } = useToolFunctionMutations()

  return useCallback(
    async (fn: ToolFunction, afterConfirmed?: () => void) => {
      const hasCredentials = Boolean(tools.find((tool) => tool.id === fn.tool?.id)?.credentialsSchema.length)
      const confirmed = await confirm({
        title: t("tools.personalize.title", { name: fn.name }),
        description: t(hasCredentials ? "tools.personalize.descriptionWithKeys" : "tools.personalize.description", {
          tool: fn.tool ? texts.name(fn.tool) : "",
        }),
        confirmLabel: t("tools.personalize.action"),
        onConfirm: () => personalizeFunction(fn.id),
      })
      if (!confirmed) return false
      toast.success(t("tools.personalize.done", { name: fn.name }))
      afterConfirmed?.()
      return true
    },
    [confirm, personalizeFunction, t, texts, tools]
  )
}
