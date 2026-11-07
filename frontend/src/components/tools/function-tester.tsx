import { useImperativeHandle, useState, type Ref } from "react"
import { useTranslation } from "react-i18next"
import { Braces, ListChecks, Loader2, Play, X } from "lucide-react"

import type { CodeRunResult } from "@/components/code-editor"
import { RunOutput } from "@/components/code-editor/run-output"
import { Field, SearchableSelect, SelectInput, type LoadOptions } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { lookupChats } from "@/hooks/flows/use-flow-references"
import { useFunctionRun } from "@/hooks/tools/use-function-run"
import { useCan } from "@/hooks/use-can"
import { formatPhone } from "@/lib/format-phone"
import { buildTestArgs } from "@/lib/tools/parameters"
import type { FunctionParameter } from "@/lib/tools/types"

// Rodar a função com valores de verdade. Um campo por parâmetro, para quem não programa; quem prefere escreve o JSON.
// A execução vai para a fila de scripts e a resposta vem por consulta: quem chama cuida disso.

const searchChats: LoadOptions = async (query, signal) => {
  const chats = await lookupChats(query, signal)
  return chats.map((chat) => ({
    value: chat.id,
    label: chat.displayName || chat.userName || formatPhone(chat.externalId),
    description: formatPhone(chat.externalId),
  }))
}

/** Para o botão de executar do editor rodar o mesmo que o daqui. */
export type FunctionTesterHandle = { start: () => void }

export type FunctionTesterProps = {
  ref?: Ref<FunctionTesterHandle>
  parameters: FunctionParameter[]
  values: Record<string, string>
  onValueChange: (name: string, value: string) => void
  running: boolean
  onRun: (args: Record<string, unknown>, chatId: string | null) => void
  onCancel: () => void
  runLabel: string
  /** Sem o editor na tela, o resultado sai aqui. */
  result?: CodeRunResult | null
  showOutput?: boolean
  disabled?: boolean
}

export function FunctionTester({
  ref,
  parameters,
  values,
  onValueChange,
  running,
  onRun,
  onCancel,
  runLabel,
  result,
  showOutput,
  disabled,
}: FunctionTesterProps) {
  const { t } = useTranslation()
  const canSeeChats = useCan("chat")
  const [chatId, setChatId] = useState<string | null>(null)
  const [json, setJson] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string[]>([])
  const [jsonError, setJsonError] = useState<string | null>(null)

  const hasParameters = parameters.length > 0

  const openJson = () => {
    const { args } = buildTestArgs(parameters, values)
    setJson(JSON.stringify(args, null, 2))
    setJsonError(null)
  }

  const start = () => {
    if (json !== null) {
      try {
        const parsed: unknown = JSON.parse(json.trim() || "{}")
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object")
        setJsonError(null)
        onRun(parsed as Record<string, unknown>, chatId)
      } catch {
        setJsonError(t("tools.tester.jsonInvalid"))
      }
      return
    }
    const { args, invalid: wrong } = buildTestArgs(parameters, values)
    setInvalid(wrong)
    if (wrong.length === 0) onRun(args, chatId)
  }

  useImperativeHandle(ref, () => ({ start }))

  return (
    <div
      className="flex flex-col gap-3"
      // O teste mora dentro de um formulário: Enter num campo daqui roda o teste, e não salva o que está em volta.
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return
        if (event.target.getAttribute("role") === "combobox") return
        event.preventDefault()
        if (!running && !disabled) start()
      }}
    >
      {json !== null ? (
        <Field label={t("tools.tester.jsonLabel")} error={jsonError ?? undefined}>
          {(control) => (
            <Textarea
              {...control}
              rows={5}
              value={json}
              className="font-mono md:text-[13px]"
              onChange={(event) => {
                setJson(event.target.value)
                setJsonError(null)
              }}
            />
          )}
        </Field>
      ) : hasParameters ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {parameters.map((parameter) => (
            <ValueField
              key={parameter.name}
              parameter={parameter}
              value={values[parameter.name] ?? ""}
              invalid={invalid.includes(parameter.name)}
              onChange={(value) => {
                setInvalid((current) => current.filter((name) => name !== parameter.name))
                onValueChange(parameter.name, value)
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("tools.tester.noParameters")}</p>
      )}

      {canSeeChats ? (
        <Field label={t("tools.tester.chat")} hint={t("tools.tester.chatHint")}>
          {(control) => (
            <SearchableSelect
              {...control}
              value={chatId}
              clearable
              loadOptions={searchChats}
              placeholder={t("tools.tester.chatPlaceholder")}
              emptyLabel={t("tools.tester.chatEmpty")}
              onChange={(value) => setChatId(value)}
            />
          )}
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" disabled={running || disabled} onClick={start} className="pointer-coarse:h-10">
          {running ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Play />}
          {running ? t("tools.tester.running") : runLabel}
        </Button>
        {running ? (
          <Button type="button" variant="ghost" onClick={onCancel} className="pointer-coarse:h-10">
            <X />
            {t("tools.tester.stopWaiting")}
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={() => (json === null ? openJson() : setJson(null))}
        >
          {json === null ? <Braces /> : <ListChecks />}
          {t(json === null ? "tools.tester.useJson" : "tools.tester.useFields")}
        </Button>
      </div>

      {showOutput ? <RunOutput result={result} running={running} /> : null}
    </div>
  )
}

function ValueField({
  parameter,
  value,
  invalid,
  onChange,
}: {
  parameter: FunctionParameter
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const structured = parameter.type === "array" || parameter.type === "object"

  return (
    <Field
      label={parameter.name}
      hint={parameter.description || undefined}
      error={invalid ? t(structured ? "tools.tester.invalidJsonValue" : "tools.tester.invalidValue") : undefined}
      action={parameter.required ? <span className="text-xs text-muted-foreground">{t("tools.parameters.required")}</span> : undefined}
      className={structured ? "sm:col-span-2" : undefined}
    >
      {(control) =>
        parameter.enum?.length ? (
          <SelectInput
            {...control}
            value={value || null}
            options={parameter.enum.map((option) => ({ value: option, label: option }))}
            clearLabel={t("tools.tester.noValue")}
            placeholder={t("tools.tester.noValue")}
            onChange={(next) => onChange(next ?? "")}
          />
        ) : parameter.type === "boolean" ? (
          <SelectInput
            {...control}
            value={value || null}
            options={[
              { value: "true", label: t("tools.tester.yes") },
              { value: "false", label: t("tools.tester.no") },
            ]}
            clearLabel={t("tools.tester.noValue")}
            placeholder={t("tools.tester.noValue")}
            onChange={(next) => onChange(next ?? "")}
          />
        ) : structured ? (
          <Textarea
            {...control}
            rows={2}
            value={value}
            className="font-mono md:text-[13px]"
            placeholder={t(parameter.type === "array" ? "tools.tester.arrayPlaceholder" : "tools.tester.objectPlaceholder")}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <Input
            {...control}
            value={value}
            type={parameter.type === "number" || parameter.type === "integer" ? "number" : "text"}
            inputMode={parameter.type === "number" || parameter.type === "integer" ? "decimal" : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      }
    </Field>
  )
}

/** A forma pronta para uma função que não se edita: os valores ficam aqui mesmo, e o resultado também. */
export function StandaloneFunctionTester({ fn }: { fn: { id: string; parameters: FunctionParameter[] } }) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fn.parameters.map((parameter) => [parameter.name, parameter.mockValue ?? ""]))
  )
  const { running, result, run, cancel } = useFunctionRun(t("tools.tester.failed"))

  return (
    <FunctionTester
      parameters={fn.parameters}
      values={values}
      onValueChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
      running={running}
      onRun={(args, chatId) => void run(fn.id, args, chatId)}
      onCancel={cancel}
      runLabel={t("tools.tester.run")}
      result={result}
      showOutput
    />
  )
}
