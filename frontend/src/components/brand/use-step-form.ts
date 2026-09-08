import { useCallback, useEffect, useRef, useState } from "react"
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { ZodType } from "zod"

import type { SaveStatus } from "@/components/brand/save-indicator"
import { useBrandCoreMutations } from "@/hooks/use-brand-core"
import { ApiError } from "@/lib/api"
import type { BrandDocument, BrandSection, BrandStep } from "@/lib/brand-core"

const AUTOSAVE_DELAY = 900

export type StepProgress = { visitedSteps?: BrandStep[]; lastStep?: BrandStep }

/** Valida a etapa e salva. `false` quando algo impede de seguir. */
export type CommitStep = (progress?: StepProgress) => Promise<boolean>

type Options<S extends BrandSection> = {
  section: S
  defaults: BrandDocument[S]
  schema: ZodType
  /** Recebe cada mudança (para o cartão da marca acompanhar ao vivo). */
  onChange?: (values: BrandDocument[S]) => void
}

/**
 * O formulário de uma etapa: react-hook-form + zod, salvando o rascunho
 * sozinho (com atraso curto depois da última tecla) e validando só quando a
 * pessoa quer seguir. O rascunho nunca é bloqueado por validação — é o
 * servidor que normaliza; aqui só se decide se dá para "Continuar".
 */
export function useStepForm<S extends BrandSection>({
  section,
  defaults,
  schema,
  onChange,
}: Options<S>) {
  type Values = BrandDocument[S] & FieldValues

  const form = useForm<Values>({
    resolver: zodResolver(schema as unknown as ZodType<Values, Values>) as unknown as Resolver<Values>,
    defaultValues: defaults as DefaultValues<Values>,
    mode: "onBlur",
  })
  const { saveSection } = useBrandCoreMutations()
  const [status, setStatus] = useState<SaveStatus>("idle")

  const timer = useRef<number | undefined>(undefined)
  const dirty = useRef(false)
  const lastSaved = useRef(JSON.stringify(defaults))
  const change = useRef(onChange)
  change.current = onChange

  const persist = useCallback(
    async (values: Values, progress?: StepProgress): Promise<boolean> => {
      const snapshot = JSON.stringify(values)
      if (snapshot === lastSaved.current && !progress) {
        setStatus((current) => (current === "idle" ? "idle" : "saved"))
        return true
      }
      setStatus("saving")
      try {
        await saveSection(section, values, progress)
        lastSaved.current = snapshot
        dirty.current = false
        setStatus("saved")
        return true
      } catch (error) {
        setStatus("error")
        applyServerErrors(form.setError, section, error)
        return false
      }
    },
    [form.setError, saveSection, section]
  )

  // Salvamento automático: espera a pessoa parar de digitar.
  useEffect(() => {
    const subscription = form.watch(() => {
      dirty.current = true
      change.current?.(form.getValues() as BrandDocument[S])
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        if (dirty.current) void persist(form.getValues())
      }, AUTOSAVE_DELAY)
    })
    return () => subscription.unsubscribe()
  }, [form, persist])

  // Sair da etapa com algo pendente: salva antes de ir.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (dirty.current) void persist(form.getValues())
    },
    [form, persist]
  )

  const commit = useCallback<CommitStep>(
    async (progress) => {
      window.clearTimeout(timer.current)
      const valid = await form.trigger()
      if (!valid) return false
      return persist(form.getValues(), progress)
    },
    [form, persist]
  )

  const retry = useCallback(() => persist(form.getValues()), [form, persist])

  return { form, status, commit, retry }
}

/**
 * O 422 do servidor vem com caminhos completos (`palette.colors.2.hex`); o
 * formulário só conhece o trecho depois da seção (`colors.2.hex`).
 */
function applyServerErrors<Values extends FieldValues>(
  setError: (name: Path<Values>, error: { message: string }) => void,
  section: BrandSection,
  error: unknown
) {
  if (!(error instanceof ApiError) || !error.details) return
  for (const [path, messages] of Object.entries(error.details)) {
    if (!path.startsWith(`${section}.`)) continue
    const local = path.slice(section.length + 1) as Path<Values>
    if (messages[0]) setError(local, { message: messages[0] })
  }
}
