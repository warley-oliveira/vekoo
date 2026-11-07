import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Braces, ChevronRight, CircleAlert, FileUp, Hash, List, Plus, ToggleLeft, Trash2, Type, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { ChipsInput, Field, ResponsiveDialog, SelectInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useOpenCount } from "@/hooks/use-panel-session"
import { changeType, nestedCount, newParameter, ParametersImportError, parseParametersJson, toParameterName } from "@/lib/tools/parameters"
import { ITEM_TYPES, PARAMETER_TYPES, type FunctionParameter, type ParameterType } from "@/lib/tools/types"
import { cn } from "@/lib/utils"

// O que a função recebe. Vira `params` no código, e é o que o modelo lê para saber o que mandar. Recursivo: objeto e
// lista de objetos têm campos, que têm tipo, que podem ser objeto.

const TYPE_ICONS: Record<ParameterType, LucideIcon> = {
  string: Type,
  number: Hash,
  integer: Hash,
  boolean: ToggleLeft,
  array: List,
  object: Braces,
}

/** Ramo de `formState.errors`: o formulário valida a árvore inteira e cada campo procura o seu. */
type Errors = unknown

function childErrors(errors: Errors, key: string | number): Errors {
  return errors && typeof errors === "object" ? (errors as Record<string | number, unknown>)[key] : undefined
}

function messageOf(errors: Errors): string | undefined {
  const message = childErrors(errors, "message")
  return typeof message === "string" ? message : undefined
}

export type ParametersEditorProps = {
  value: FunctionParameter[]
  onChange: (value: FunctionParameter[]) => void
  errors?: Errors
}

export function ParametersEditor({ value, onChange, errors }: ParametersEditorProps) {
  const { t } = useTranslation()
  const [importing, setImporting] = useState(false)
  const importKey = useOpenCount(importing)

  return (
    <div className="flex flex-col gap-3">
      <ParameterList
        value={value}
        onChange={onChange}
        errors={errors}
        depth={0}
        namePrefix="param"
        emptyLabel={t("tools.parameters.empty")}
        addLabel={t("tools.parameters.add")}
        extraAction={
          <Button type="button" variant="ghost" size="sm" className="pointer-coarse:h-10" onClick={() => setImporting(true)}>
            <FileUp />
            {t("tools.parameters.import")}
          </Button>
        }
      />
      <ImportDialog key={importKey} open={importing} onOpenChange={setImporting} current={value} onImport={onChange} />
    </div>
  )
}

function ParameterList({
  value,
  onChange,
  errors,
  depth,
  namePrefix,
  emptyLabel,
  addLabel,
  extraAction,
}: {
  value: FunctionParameter[]
  onChange: (value: FunctionParameter[]) => void
  errors: Errors
  depth: number
  namePrefix: string
  emptyLabel: string
  addLabel: string
  extraAction?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [justAdded, setJustAdded] = useState<number | null>(null)

  const add = () => {
    onChange([...value, newParameter(namePrefix, value.length)])
    setExpanded(value.length)
    setJustAdded(value.length)
  }

  const remove = (index: number) => {
    onChange(value.filter((_, position) => position !== index))
    setExpanded(null)
    setJustAdded(null)
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-pretty text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {value.map((parameter, index) => {
            const branch = childErrors(errors, index)
            return (
              <ParameterCard
                key={index}
                parameter={parameter}
                errors={branch}
                depth={depth}
                expanded={expanded === index || Boolean(branch)}
                autoFocusName={justAdded === index}
                onToggle={() => setExpanded((current) => (current === index ? null : index))}
                onChange={(next) => onChange(value.map((item, position) => (position === index ? next : item)))}
                onRemove={() => remove(index)}
              />
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" className="border-dashed pointer-coarse:h-10" onClick={add}>
          <Plus />
          {addLabel}
        </Button>
        {extraAction}
      </div>
    </div>
  )
}

function ParameterCard({
  parameter,
  errors,
  depth,
  expanded,
  autoFocusName,
  onToggle,
  onChange,
  onRemove,
}: {
  parameter: FunctionParameter
  errors: Errors
  depth: number
  expanded: boolean
  autoFocusName: boolean
  onToggle: () => void
  onChange: (next: FunctionParameter) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const type = (PARAMETER_TYPES as readonly string[]).includes(parameter.type) ? (parameter.type as ParameterType) : "string"
  const Icon = TYPE_ICONS[type]
  const count = nestedCount(parameter)
  const typeOptions = PARAMETER_TYPES.map((value) => ({ value, label: t(`tools.parameters.types.${value}`) }))
  const itemOptions = ITEM_TYPES.map((value) => ({ value, label: t(`tools.parameters.types.${value}`) }))

  return (
    <li className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <div className="flex min-h-10 items-center gap-1 py-1 pr-1 pl-2">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} aria-hidden />
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={t(`tools.parameters.types.${type}`)} />
          <code className="truncate font-mono text-xs font-medium">{parameter.name || t("tools.parameters.unnamed")}</code>
          {count > 0 ? <span className="shrink-0 text-xs text-muted-foreground">{t("tools.parameters.fields", { count })}</span> : null}
          {errors ? <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-label={t("tools.parameters.hasError")} /> : null}
        </button>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <Switch size="sm" checked={Boolean(parameter.required)} onCheckedChange={(required) => onChange({ ...parameter, required })} />
          <span className="max-[380px]:sr-only">{t(parameter.required ? "tools.parameters.required" : "tools.parameters.optional")}</span>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("tools.parameters.remove", { name: parameter.name })}
          className="shrink-0 text-muted-foreground hover:text-status-danger pointer-coarse:size-10"
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>

      {expanded ? (
        <div
          className="flex flex-col gap-3 border-t p-3"
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <Field
              label={t("tools.parameters.name")}
              error={messageOf(childErrors(errors, "name"))}
              hint={depth === 0 ? t("tools.parameters.nameHint", { name: parameter.name || "nome" }) : undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  autoFocus={autoFocusName}
                  onFocus={(event) => {
                    if (autoFocusName) event.target.select()
                  }}
                  value={parameter.name}
                  className="font-mono md:text-[13px]"
                  placeholder={t("tools.parameters.namePlaceholder")}
                  onChange={(event) => onChange({ ...parameter, name: toParameterName(event.target.value) })}
                />
              )}
            </Field>
            <Field label={t("tools.parameters.type")}>
              {(control) => (
                <SelectInput
                  {...control}
                  value={type}
                  options={typeOptions}
                  onChange={(next) => onChange(changeType(parameter, (next ?? "string") as ParameterType))}
                />
              )}
            </Field>
          </div>

          <Field
            label={t("tools.parameters.description")}
            error={messageOf(childErrors(errors, "description"))}
            hint={t("tools.parameters.descriptionHint")}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                value={parameter.description ?? ""}
                placeholder={t("tools.parameters.descriptionPlaceholder")}
                onChange={(event) => onChange({ ...parameter, description: event.target.value })}
              />
            )}
          </Field>

          {type === "string" ? (
            <Field label={t("tools.parameters.enum")} hint={t("tools.parameters.enumHint")}>
              {(control) => (
                <ChipsInput
                  {...control}
                  value={parameter.enum ?? []}
                  placeholder={t("tools.parameters.enumPlaceholder")}
                  onChange={(next) => {
                    const { enum: _previous, ...rest } = parameter
                    onChange(next.length > 0 ? { ...rest, enum: next } : rest)
                  }}
                />
              )}
            </Field>
          ) : null}

          {type === "array" ? (
            <Field label={t("tools.parameters.itemsType")}>
              {(control) => (
                <SelectInput
                  {...control}
                  value={parameter.itemsType ?? "string"}
                  options={itemOptions}
                  onChange={(next) => {
                    const { itemsProperties: _previous, ...rest } = parameter
                    onChange({ ...rest, itemsType: next ?? "string", ...(next === "object" ? { itemsProperties: parameter.itemsProperties } : {}) })
                  }}
                />
              )}
            </Field>
          ) : null}

          {type === "object" ? (
            <NestedFields
              label={t("tools.parameters.objectFields")}
              value={parameter.properties ?? []}
              errors={childErrors(errors, "properties")}
              depth={depth}
              onChange={(properties) => onChange({ ...parameter, properties })}
            />
          ) : null}

          {type === "array" && parameter.itemsType === "object" ? (
            <NestedFields
              label={t("tools.parameters.itemFields")}
              value={parameter.itemsProperties ?? []}
              errors={childErrors(errors, "itemsProperties")}
              depth={depth}
              onChange={(itemsProperties) => onChange({ ...parameter, itemsProperties })}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function NestedFields({
  label,
  value,
  errors,
  depth,
  onChange,
}: {
  label: string
  value: FunctionParameter[]
  errors: Errors
  depth: number
  onChange: (value: FunctionParameter[]) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 border-l-2 pl-3">
      <p className="text-sm font-medium">{label}</p>
      <ParameterList
        value={value}
        onChange={onChange}
        errors={errors}
        depth={depth + 1}
        namePrefix="campo"
        emptyLabel={t("tools.parameters.emptyNested")}
        addLabel={t("tools.parameters.addNested")}
      />
    </div>
  )
}

/* ---------- Importar ---------- */

function ImportDialog({
  open,
  onOpenChange,
  current,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: FunctionParameter[]
  onImport: (value: FunctionParameter[]) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const [replace, setReplace] = useState(current.length === 0)
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const parsed = parseParametersJson(text)
      if (replace) {
        onImport(parsed)
        toast.success(t("tools.parameters.imported", { count: parsed.length }))
      } else {
        const known = new Set(current.map((parameter) => parameter.name))
        const fresh = parsed.filter((parameter) => !known.has(parameter.name))
        if (fresh.length === 0) {
          setError(t("tools.parameters.importErrors.duplicates"))
          return
        }
        onImport([...current, ...fresh])
        toast.success(t("tools.parameters.imported", { count: fresh.length }))
      }
      onOpenChange(false)
    } catch (failure) {
      setError(t(`tools.parameters.importErrors.${failure instanceof ParametersImportError ? failure.code : "invalidJson"}`))
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("tools.parameters.importTitle")}
      description={t("tools.parameters.importDescription")}
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={() => onOpenChange(false)}>
            {t("tools.common.cancel")}
          </Button>
          <Button type="submit" disabled={!text.trim()} className="pointer-coarse:h-10">
            {t("tools.parameters.importAction")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t("tools.parameters.importLabel")} error={error ?? undefined}>
          {(control) => (
            <Textarea
              {...control}
              autoFocus
              rows={10}
              value={text}
              className="font-mono md:text-[13px]"
              placeholder={t("tools.parameters.importPlaceholder")}
              onChange={(event) => {
                setText(event.target.value)
                setError(null)
              }}
            />
          )}
        </Field>
        <div className="flex items-center justify-between gap-4 pointer-coarse:min-h-10">
          <Label htmlFor="import-replace" className="flex-col items-start gap-0.5 font-normal">
            <span className="text-sm font-medium">{t("tools.parameters.importReplace")}</span>
            <span className="text-xs text-muted-foreground">
              {t(replace ? "tools.parameters.importReplaceOn" : "tools.parameters.importReplaceOff")}
            </span>
          </Label>
          <Switch id="import-replace" checked={replace} onCheckedChange={setReplace} />
        </div>
      </div>
    </ResponsiveDialog>
  )
}

/* ---------- Só leitura ---------- */

/** O que uma função de ferramenta recebe, para ler. Sem nada que pareça campo: não dá para mudar aqui. */
export function ParametersSummary({ parameters, nested = false }: { parameters: FunctionParameter[]; nested?: boolean }) {
  const { t } = useTranslation()
  if (parameters.length === 0 && !nested) {
    return <p className="text-sm text-muted-foreground">{t("tools.parameters.noneReadOnly")}</p>
  }
  return (
    <ul className={cn("flex flex-col gap-2", nested && "mt-1.5 border-l-2 pl-3")}>
      {parameters.map((parameter) => {
        const children = parameter.type === "object" ? parameter.properties : parameter.itemsProperties
        const typeKey = (PARAMETER_TYPES as readonly string[]).includes(parameter.type) ? parameter.type : "string"
        return (
          <li key={parameter.name} className="min-w-0 text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <code className="font-mono text-xs font-medium">{parameter.name}</code>
              <span className="text-xs text-muted-foreground">
                {t(`tools.parameters.types.${typeKey}`)}
                {" · "}
                {t(parameter.required ? "tools.parameters.required" : "tools.parameters.optional")}
              </span>
            </p>
            {parameter.description ? <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{parameter.description}</p> : null}
            {parameter.enum?.length ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{t("tools.parameters.enumList", { values: parameter.enum.join(", ") })}</p>
            ) : null}
            {children?.length ? <ParametersSummary parameters={children} nested /> : null}
          </li>
        )
      })}
    </ul>
  )
}
