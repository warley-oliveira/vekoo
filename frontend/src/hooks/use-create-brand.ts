import { useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useBrandMutations } from "@/hooks/use-brands"
import { onboardingHref } from "@/lib/onboarding"

/**
 * Abrir uma marca é a porta de entrada do produto. O hook fica aqui para o
 * seletor e o botão visível fazerem exatamente a mesma coisa: cria o rascunho
 * e leva à primeira pergunta do onboarding guiado, nunca ao wizard de oito
 * seções — esse é o modo de edição, não a porta de entrada.
 */
export function useCreateBrand() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { createBrand } = useBrandMutations()
  const [creating, setCreating] = useState(false)

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      const created = await createBrand()
      toast(t("brandSwitcher.createdToast"))
      navigate(onboardingHref(created.id, "intro"))
    } catch {
      toast.error(t("brandSwitcher.createFailed"))
    } finally {
      setCreating(false)
    }
  }

  return { create, creating }
}
