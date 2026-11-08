import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "@/lib/router"
import { Code2, Loader2, Lock, Trash2, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { FunctionTester, StandaloneFunctionTester, type FunctionTesterHandle } from "@/components/tools/function-tester"
import { GatedCodeEditor } from "@/components/tools/gated-code-editor"
import { ParametersEditor, ParametersSummary } from "@/components/tools/parameters-editor"
import { useToolTexts } from "@/components/tools/tool-texts"
import { FunctionEditorSkeleton } from "@/components/tools/tools-skeletons"
import { usePersonalize } from "@/components/tools/use-personalize"
import {
  ActionsMenu,
  Callout,
  EmptyState,
  ErrorState,
  FormError,
  FormField,
  PageBody,
  PageHeader,
  SettingsSection,
  TextareaField,
  UnsavedChangesDialog,
  applyServerErrors,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useFunctionRun } from "@/hooks/tools/use-function-run"
import { useToolFunction, useToolFunctionMutations, useToolFunctions } from "@/hooks/tools/use-tool-functions"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { ApiError } from "@/lib/api"
import { FUNCTION_NAME_PATTERN, newParameter, PARAMETER_NAME_PATTERN, toFunctionName } from "@/lib/tools/parameters"
import type { FunctionParameter, ToolFunction } from "@/lib/tools/types"

// Uma função. Quem programa escreve aqui: dados de um lado, código do outro, e o teste logo abaixo do código. A função
// que veio de uma ferramenta só mostra o que faz e o que recebe: o código é da ferramenta, até alguém personalizar.

const LIST_PATH = "/tools/functions"
const NEW_ID = "new"

type T = (key: string, options?: Record<string, unknown>) => string

/** A árvore inteira de uma vez: nome sem repetir no mesmo nível e descrição, que é o que o modelo lê. */
function checkParameters(list: FunctionParameter[], path: (string | number)[], ctx: z.RefinementCtx, t: T) {
  const seen = new Set<string>()
  list.forEach((parameter, index) => {
    const at = [...path, index]
    const name = parameter.name?.trim() ?? ""
    if (!name) {
      ctx.addIssue({ code: "custom", path: [...at, "name"], message: t("tools.editor.errors.parameterName") })
    } else if (!PARAMETER_NAME_PATTERN.test(name)) {
      ctx.addIssue({ code: "custom", path: [...at, "name"], message: t("tools.editor.errors.parameterNameInvalid") })
    } else if (seen.has(name)) {
      ctx.addIssue({ code: "custom", path: [...at, "name"], message: t("tools.editor.errors.parameterNameTaken") })
    }
    seen.add(name)
    if (!parameter.description?.trim()) {
      ctx.addIssue({ code: "custom", path: [...at, "description"], message: t("tools.editor.errors.parameterDescription") })
    }
    if (parameter.properties) checkParameters(parameter.properties, [...at, "properties"], ctx, t)
    if (parameter.itemsProperties) checkParameters(parameter.itemsProperties, [...at, "itemsProperties"], ctx, t)
  })
}

function buildSchema(t: T, takenNames: Set<string>) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("tools.editor.errors.name"))
      .regex(FUNCTION_NAME_PATTERN, t("tools.editor.errors.nameInvalid"))
      .refine((value) => !takenNames.has(value), t("tools.editor.errors.nameTaken")),
    description: z.string().trim().min(1, t("tools.editor.errors.description")),
    jsCode: z.string().refine((value) => value.trim().length > 0, t("tools.editor.errors.code")),
    parameters: z.custom<FunctionParameter[]>().superRefine((list, ctx) => checkParameters(list ?? [], [], ctx, t)),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

function toValues(fn: ToolFunction | null, starter: string): FormValues {
  return {
    name: fn?.name ?? "",
    description: fn?.description ?? "",
    jsCode: fn?.jsCode ?? starter,
    parameters: fn?.parameters ?? [],
  }
}

export default function FunctionEditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { functionId } = useParams()
  const id = functionId && functionId !== NEW_ID ? functionId : null
  const { fn, error, isLoading, reload } = useToolFunction(id)

  // Criar troca o endereço de `new` para o id, e o formulário continua o mesmo. Abrir outra função nasce do zero.
  const [formKey, setFormKey] = useState(id ?? NEW_ID)
  const [previousId, setPreviousId] = useState(id)
  if (id !== previousId) {
    setPreviousId(id)
    if (previousId !== null) setFormKey(id ?? NEW_ID)
  }

  if (id && !fn) {
    return (
      <PageBody>
        <PageHeader backTo={LIST_PATH} parentTitle={t("tools.nav.functions")} />
        {isLoading ? (
          <FunctionEditorSkeleton />
        ) : error instanceof ApiError && error.status === 404 ? (
          <EmptyState
            icon={<Code2 className="size-5" />}
            title={t("tools.editor.notFoundTitle")}
            description={t("tools.editor.notFoundDescription")}
            action={{ label: t("tools.editor.backToList"), onClick: () => navigate(LIST_PATH) }}
          />
        ) : (
          <ErrorState error={error} onRetry={() => void reload()} />
        )}
      </PageBody>
    )
  }

  if (fn?.locked) return <LockedFunction fn={fn} />
  return <FunctionForm key={formKey} fn={fn} />
}

/* ---------- Veio de uma ferramenta ---------- */

function LockedFunction({ fn }: { fn: ToolFunction }) {
  const { t } = useTranslation()
  const texts = useToolTexts()
  const personalize = usePersonalize()
  const [busy, setBusy] = useState(false)

  const start = async () => {
    setBusy(true)
    try {
      await personalize(fn)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageBody>
      <PageHeader title={fn.name} backTo={LIST_PATH} parentTitle={t("tools.nav.functions")} />

      <Callout
        icon={<Lock />}
        title={fn.tool ? t("tools.editor.lockedTitle", { name: texts.name(fn.tool) }) : t("tools.editor.lockedTitleUnknown")}
        action={
          <Button type="button" variant="outline" size="sm" disabled={busy} className="pointer-coarse:h-10" onClick={() => void start()}>
            {t("tools.personalize.action")}
          </Button>
        }
      >
        {t("tools.editor.lockedDescription")}
      </Callout>

      <div className="flex flex-col gap-6">
        <SettingsSection title={t("tools.editor.whatItDoes")}>
          <p className="text-sm text-pretty whitespace-pre-line">{fn.description}</p>
        </SettingsSection>
        <SettingsSection title={t("tools.editor.parameters")} description={t("tools.editor.parametersHintLocked")}>
          <ParametersSummary parameters={fn.parameters} />
        </SettingsSection>
        <SettingsSection title={t("tools.editor.testTitle")} description={t("tools.editor.testHintLocked")}>
          <StandaloneFunctionTester fn={fn} />
        </SettingsSection>
      </div>
    </PageBody>
  )
}

/* ---------- Editar ---------- */

function FunctionForm({ fn }: { fn: ToolFunction | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const isMobile = useIsMobile()
  const { functions } = useToolFunctions()
  const { createFunction, updateFunction, deleteFunction } = useToolFunctionMutations()
  const { running, result, run, cancel } = useFunctionRun(t("tools.tester.failed"))

  // Fica aqui, e não vem de `fn`: criar a função no meio do teste não pode desmontar o que está na tela.
  const [savedId, setSavedId] = useState(fn?.id ?? null)
  const [redirect, setRedirect] = useState<string | null>(null)

  const takenNames = useMemo(
    () => new Set(functions.filter((other) => other.id !== savedId).map((other) => other.name)),
    [functions, savedId]
  )
  const schema = useMemo(() => buildSchema(t, takenNames), [t, takenNames])
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(fn, t("tools.editor.starter")),
    mode: "onBlur",
  })
  const { isDirty, isSubmitting, errors } = form.formState
  const parameters = useWatch({ control: form.control, name: "parameters" })

  const persist = useCallback(
    async (values: FormValues) => {
      const saved = savedId ? await updateFunction(savedId, values) : await createFunction(values)
      form.reset(toValues(saved, ""))
      if (!savedId) {
        setSavedId(saved.id)
        // Só depois de o formulário ficar limpo: a guarda de "sair sem salvar" ainda está de pé neste instante.
        setRedirect(`${LIST_PATH}/${saved.id}`)
      }
      return saved.id
    },
    [createFunction, form, savedId, updateFunction]
  )

  useEffect(() => {
    if (redirect && !isDirty) {
      navigate(redirect, { replace: true })
      setRedirect(null)
    }
  }, [isDirty, navigate, redirect])

  const submit = useFormSubmit(form, async (values) => {
    await persist(values)
    toast.success(t("tools.editor.saved"))
  })

  // O teste roda o que está salvo: por isso salva antes, e o botão diz isso.
  const requestRun = (args: Record<string, unknown>, chatId: string | null) => {
    void form.handleSubmit(
      async (values) => {
        try {
          const id = form.formState.isDirty || !savedId ? await persist(values) : savedId
          void run(id, args, chatId)
        } catch (error) {
          applyServerErrors(error, form.setError, { fields: Object.keys(form.getValues()) })
        }
      },
      // O erro pode estar longe do botão, na outra coluna.
      () => toast.error(t("tools.editor.fixErrors"))
    )()
  }

  // O botão do editor roda o mesmo que o do teste, com o que estiver preenchido lá.
  const tester = useRef<FunctionTesterHandle>(null)

  // Ctrl+S salva, de dentro do código também: o Monaco não usa esse atalho.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (form.formState.isDirty) void submit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [form, submit])

  const remove = async () => {
    if (!savedId) return
    const confirmed = await confirm({
      title: t("tools.functions.deleteTitle", { name: form.getValues("name") }),
      description: t("tools.functions.deleteDescription"),
      confirmLabel: t("tools.functions.delete"),
      destructive: true,
      onConfirm: async () => {
        await deleteFunction(savedId)
        form.reset()
      },
    })
    if (confirmed) {
      toast.success(t("tools.functions.deleted", { name: form.getValues("name") }))
      navigate(LIST_PATH)
    }
  }

  const setMockValue = (name: string, value: string) => {
    form.setValue(
      "parameters",
      parameters.map((parameter) => {
        if (parameter.name !== name) return parameter
        const { mockValue: _previous, ...rest } = parameter
        return value ? { ...rest, mockValue: value } : rest
      }),
      { shouldDirty: true }
    )
  }

  const testValues = useMemo(
    () => Object.fromEntries((parameters ?? []).map((parameter) => [parameter.name, parameter.mockValue ?? ""])),
    [parameters]
  )

  const addFromCode = useCallback(
    (name: string) => {
      const current = form.getValues("parameters") ?? []
      if (current.some((parameter) => parameter.name === name)) {
        toast.error(t("tools.editor.parameterExists", { name }))
        return
      }
      form.setValue("parameters", [...current, { ...newParameter("param", current.length), name }], { shouldDirty: true })
      toast.success(t("tools.editor.parameterAdded", { name }))
    },
    [form, t]
  )

  const title = useWatch({ control: form.control, name: "name" })

  return (
    <PageBody variant="wide">
      <PageHeader
        title={savedId ? title || t("tools.editor.routeTitle") : t("tools.editor.newTitle")}
        backTo={LIST_PATH}
        parentTitle={t("tools.nav.functions")}
        mobilePlacement="inline"
        actions={
          <div className="flex items-center gap-1.5">
            {isDirty ? (
              <Button type="button" variant="ghost" size="sm" className="pointer-coarse:h-10" onClick={() => form.reset()}>
                <Undo2 />
                <span className="max-md:sr-only">{t("tools.editor.discard")}</span>
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={!isDirty || isSubmitting} className="pointer-coarse:h-10" onClick={() => void submit()}>
              {isSubmitting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              <span className="max-md:hidden">{t("tools.editor.save")}</span>
              <span className="md:hidden">{t("tools.editor.saveShort")}</span>
            </Button>
            {savedId ? (
              <ActionsMenu
                className="pointer-coarse:size-10"
                label={t("tools.editor.moreActions")}
                actions={[
                  {
                    label: t("tools.functions.delete"),
                    icon: <Trash2 />,
                    destructive: true,
                    onSelect: () => void remove(),
                  },
                ]}
              />
            ) : null}
          </div>
        }
      />

      <form onSubmit={submit} noValidate className="grid gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <FormError form={form} />
          <FormField control={form.control} name="name" label={t("tools.editor.name")} hint={t("tools.editor.nameHint")}>
            {({ field, controlProps }) => (
              <Input
                {...controlProps}
                ref={field.ref}
                name={field.name}
                value={field.value}
                autoFocus={!savedId}
                autoComplete="off"
                spellCheck={false}
                className="font-mono md:text-[13px]"
                placeholder={t("tools.editor.namePlaceholder")}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(toFunctionName(event.target.value))}
              />
            )}
          </FormField>
          <TextareaField
            control={form.control}
            name="description"
            label={t("tools.editor.description")}
            hint={t("tools.editor.descriptionHint")}
            placeholder={t("tools.editor.descriptionPlaceholder")}
            rows={3}
          />
          <section className="flex flex-col gap-2">
            <div>
              <h2 className="text-sm font-medium">{t("tools.editor.parameters")}</h2>
              <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{t("tools.editor.parametersHint")}</p>
            </div>
            <ParametersEditor
              value={parameters ?? []}
              errors={errors.parameters}
              onChange={(next) => form.setValue("parameters", next, { shouldDirty: true, shouldValidate: Boolean(errors.parameters) })}
            />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <FormField control={form.control} name="jsCode" label={t("tools.editor.code")} hint={t("tools.editor.codeHint")}>
            {({ field }) => (
              <GatedCodeEditor
                value={field.value}
                onChange={field.onChange}
                height={440}
                parameters={parameters}
                onAddParameter={addFromCode}
                onRun={() => tester.current?.start()}
                running={running}
                result={result}
                aria-label={t("tools.editor.code")}
              />
            )}
          </FormField>

          <section className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
            <div>
              <h2 className="font-heading text-base font-medium">{t("tools.editor.testTitle")}</h2>
              <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{t("tools.editor.testHint")}</p>
            </div>
            <FunctionTester
              ref={tester}
              parameters={parameters ?? []}
              values={testValues}
              onValueChange={setMockValue}
              running={running}
              disabled={isSubmitting}
              onRun={requestRun}
              onCancel={cancel}
              runLabel={t("tools.editor.saveAndRun")}
              result={result}
              // No celular, o editor pode nem estar aberto: o resultado sai aqui.
              showOutput={isMobile}
            />
          </section>
        </div>
      </form>

      <UnsavedChangesDialog when={isDirty} />
    </PageBody>
  )
}
