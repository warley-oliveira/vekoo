import { useMemo } from "react"
import { useTranslation } from "react-i18next"

// O catálogo vem da API em português, e com o texto que o modelo lê: "CRUD em tabelas dinâmicas", "LEAD ATUAL",
// "idempotente". Quem instala não precisa disso. Cada ferramenta e função conhecida tem aqui um nome e uma frase de
// gente, nas duas línguas, pelo `slug` e pelo nome da função, que não mudam. Ferramenta nova sai com o texto da API
// até entrar em `tools.catalogCopy`.

export function useToolTexts() {
  const { t, i18n } = useTranslation()

  return useMemo(() => {
    const copy = (key: string, fallback: string) => (i18n.exists(key) ? t(key) : fallback)
    return {
      name: (tool: { slug?: string | null; name: string }) => copy(`tools.catalogCopy.${tool.slug}.name`, tool.name),
      description: (tool: { slug?: string | null; description: string }) =>
        copy(`tools.catalogCopy.${tool.slug}.description`, tool.description),
      functionLabel: (name: string, fallback: string) => copy(`tools.functionCopy.${name}`, fallback),
    }
  }, [i18n, t])
}
