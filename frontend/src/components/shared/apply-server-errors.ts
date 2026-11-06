import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form"

import { ApiError } from "@/lib/api"
import i18n from "@/lib/i18n"

/**
 * Coloca o erro do servidor no formulário: cada campo de `ApiError.details` recebe a
 * sua mensagem (a primeira, já no idioma da requisição) e o que não for de campo vai
 * para `root`, que o `FormActions` mostra. Devolve `true` se algum campo foi marcado.
 *
 * Com `useFormSubmit` ou `<Form>` isto já é automático; chame à mão só fora deles.
 */
export function applyServerErrors<TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  {
    fields,
  }: {
    /**
     * Campos que existem na tela. Erro de outro campo vai para `root`, senão ninguém o
     * veria. `endereco.cidade` e `itens.0.nome` contam como `endereco` e `itens`.
     */
    fields?: readonly string[]
  } = {}
): boolean {
  const setRoot = (message: string) =>
    setError("root" as FieldPath<TValues>, { type: "server", message })

  if (!(error instanceof ApiError)) {
    setRoot(i18n.t("kit.form.serverError"))
    return false
  }

  const details: [string, string[]][] = Object.entries(error.details ?? {})
  if (error.field && details.length === 0 && error.serverMessage) {
    details.push([error.field, [error.serverMessage]])
  }

  const known = details.filter(
    ([name]) => !fields || fields.includes(name) || fields.includes(name.split(".")[0])
  )

  known.forEach(([name, messages], index) => {
    setError(
      name as FieldPath<TValues>,
      { type: "server", message: messages[0] },
      { shouldFocus: index === 0 }
    )
  })

  const orphans = details.filter((entry) => !known.includes(entry))
  if (orphans.length > 0) {
    setRoot(orphans[0][1][0])
  } else if (known.length === 0) {
    setRoot(
      error.code === "network"
        ? i18n.t("kit.form.networkError")
        : (error.serverMessage ?? i18n.t("kit.form.serverError"))
    )
  }

  return known.length > 0
}
