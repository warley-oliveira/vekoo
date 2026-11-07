import { useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ChevronRight, Plus, Trash2 } from "lucide-react"

import {
  ChipsInput,
  NumberInput,
  SearchableSelect,
  SegmentedControl,
  SelectInput,
  type SelectOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toVariableName } from "@/lib/flows/variables"
import { cn } from "@/lib/utils"

import { str, useBlockForm } from "./form-context"
import { VariableField } from "./variable-field"

// As peças de um formulário do inspetor. Cada campo se liga ao bloco pelo nome (`name`), e o texto vem do
// mesmo lugar: `flows.fields.<tipo>.<campo>` ou, se o bloco não disser nada de especial,
// `flows.fields.<campo>`. O inspetor não usa react-hook-form de propósito: cada tecla já vale, porque o
// bloco no quadro acompanha e o salvamento é automático.

/** O texto de um campo: rótulo, dica e exemplo. */
function useFieldCopy(name: string, override?: { label?: string; hint?: string; placeholder?: string }) {
  const { t, i18n } = useTranslation()
  const { type } = useBlockForm()
  const read = (part: "label" | "hint" | "placeholder"): string | undefined => {
    if (override?.[part]) return override[part]
    const own = `flows.fields.${type}.${name}.${part}`
    if (i18n.exists(own)) return t(own)
    const shared = `flows.fields.${name}.${part}`
    return i18n.exists(shared) ? t(shared) : undefined
  }
  return { label: read("label"), hint: read("hint"), placeholder: read("placeholder") }
}

/* ---------- Estrutura ---------- */

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-3.5 px-4 py-4", className)}>
      {title || description ? (
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {title ? <h3 className="text-sm font-semibold tracking-tight">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  )
}

/** O que a maioria não precisa ver. Fica recolhido, e abre sozinho se já tiver algo preenchido. */
export function Advanced({ children, defaultOpen = false }: { children: ReactNode; defaultOpen?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="flex h-10 w-full items-center gap-1.5 px-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        }
      >
        <ChevronRight className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-90")} aria-hidden />
        {t("flows.inspector.advanced")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-3.5 px-4 pt-1 pb-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-pretty text-muted-foreground">{children}</p>
}

export function Field({
  label,
  hint,
  id,
  optional,
  children,
}: {
  label?: string
  hint?: string
  id: string
  optional?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label ? (
        <Label htmlFor={id} className="justify-between font-medium">
          {label}
          {optional ? <span className="text-xs font-normal text-muted-foreground">{t("flows.inspector.optional")}</span> : null}
        </Label>
      ) : null}
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-pretty text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={disabled} className="w-full border-dashed">
      <Plus />
      {label}
    </Button>
  )
}

/** Um item de uma lista editável: uma regra, um botão, uma saída. */
export function RepeaterItem({
  removeLabel,
  onRemove,
  canRemove = true,
  children,
}: {
  removeLabel: string
  onRemove: () => void
  canRemove?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={removeLabel}
        title={removeLabel}
        onClick={onRemove}
        disabled={!canRemove}
        className="-mt-0.5 -mr-0.5 text-muted-foreground hover:text-status-danger"
      >
        <Trash2 />
      </Button>
    </div>
  )
}

/** Poucas opções com título e explicação. */
export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; title: string; description?: string; icon?: ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              selected ? "border-primary bg-accent/50" : "hover:border-foreground/20"
            )}
          >
            {option.icon ? (
              <span className={cn("mt-0.5 shrink-0 [&>svg]:size-4", selected ? "text-primary" : "text-muted-foreground")}>
                {option.icon}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{option.title}</span>
              {option.description ? (
                <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">{option.description}</span>
              ) : null}
            </span>
            <span
              aria-hidden
              className={cn(
                "mt-0.5 size-4 shrink-0 rounded-full border",
                selected ? "border-4 border-primary" : "border-input"
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Campos ligados ao bloco ---------- */

type CopyProps = { label?: string; hint?: string; placeholder?: string; optional?: boolean }

/** Texto com variáveis: é o campo mais comum. */
export function VarField({ name, rows = 1, mono, ...copy }: CopyProps & { name: string; rows?: number; mono?: boolean }) {
  const { data, set } = useBlockForm()
  const id = useId()
  const { label, hint, placeholder } = useFieldCopy(name, copy)
  return (
    <Field id={id} label={label} hint={hint} optional={copy.optional}>
      <VariableField
        id={id}
        value={str(data[name])}
        onChange={(value) => set({ [name]: value })}
        rows={rows}
        singleLine={rows === 1}
        mono={mono}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </Field>
  )
}

export function TextInput({
  name,
  mono,
  variableName,
  ...copy
}: CopyProps & { name: string; mono?: boolean; variableName?: boolean }) {
  const { data, set } = useBlockForm()
  const id = useId()
  const { label, hint, placeholder } = useFieldCopy(name, copy)
  return (
    <Field id={id} label={label} hint={hint} optional={copy.optional}>
      <Input
        id={id}
        value={str(data[name])}
        placeholder={placeholder}
        className={cn(mono && "font-mono md:text-[13px]")}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => set({ [name]: variableName ? toVariableName(event.target.value) : event.target.value })}
      />
    </Field>
  )
}

export function NumberBox({
  name,
  min,
  max,
  fallback,
  ...copy
}: CopyProps & { name: string; min?: number; max?: number; fallback?: number }) {
  const { data, set } = useBlockForm()
  const id = useId()
  const { label, hint, placeholder } = useFieldCopy(name, copy)
  const value = data[name]
  return (
    <Field id={id} label={label} hint={hint} optional={copy.optional}>
      <NumberInput
        id={id}
        value={value === "" || value == null ? (fallback ?? null) : Number(value)}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(next) => set({ [name]: next })}
      />
    </Field>
  )
}

export function SelectBox({
  name,
  options,
  clearLabel,
  onPick,
  ...copy
}: CopyProps & {
  name: string
  options: SelectOption[]
  clearLabel?: string
  /** Para gravar junto o nome do que foi escolhido. */
  onPick?: (value: string | null, option: SelectOption | null) => void
}) {
  const { data, set } = useBlockForm()
  const id = useId()
  const { label, hint, placeholder } = useFieldCopy(name, copy)
  return (
    <Field id={id} label={label} hint={hint} optional={copy.optional}>
      <SelectInput
        id={id}
        value={str(data[name]) || null}
        options={options}
        placeholder={placeholder}
        clearLabel={clearLabel}
        onChange={(value) =>
          onPick ? onPick(value, options.find((option) => option.value === value) ?? null) : set({ [name]: value ?? "" })
        }
      />
    </Field>
  )
}

/** Muitas opções: digita e filtra. */
export function ComboBox({
  name,
  options,
  loading,
  onPick,
  ...copy
}: CopyProps & {
  name: string
  options: SelectOption[]
  loading?: boolean
  onPick?: (value: string | null, option: SelectOption | null) => void
}) {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const id = useId()
  const { label, hint, placeholder } = useFieldCopy(name, copy)
  const value = str(data[name]) || null
  return (
    <Field id={id} label={label} hint={hint} optional={copy.optional}>
      <SearchableSelect
        id={id}
        value={value}
        options={options}
        clearable
        placeholder={loading ? t("flows.inspector.loading") : placeholder}
        selectedOption={options.find((option) => option.value === value) ?? null}
        onChange={(next, option) => (onPick ? onPick(next, option) : set({ [name]: next ?? "" }))}
      />
    </Field>
  )
}

export function Toggle({
  name,
  defaultValue = false,
  ...copy
}: CopyProps & { name: string; defaultValue?: boolean }) {
  const { data, set } = useBlockForm()
  const id = useId()
  const { label, hint } = useFieldCopy(name, copy)
  const checked = data[name] == null ? defaultValue : data[name] !== false
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <p className="mt-1 text-xs text-pretty text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={(next) => set({ [name]: next })} />
    </div>
  )
}

export function ChipsBox({ name, ...copy }: CopyProps & { name: string }) {
  const { data, set } = useBlockForm()
  const id = useId()
  const { label, hint, placeholder } = useFieldCopy(name, copy)
  return (
    <Field id={id} label={label} hint={hint} optional={copy.optional}>
      <ChipsInput
        id={id}
        value={Array.isArray(data[name]) ? (data[name] as string[]) : []}
        placeholder={placeholder}
        onChange={(next) => set({ [name]: next })}
      />
    </Field>
  )
}

export function Segmented<T extends string>({
  name,
  options,
  fallback,
  ...copy
}: CopyProps & { name: string; options: { value: T; label: string }[]; fallback: T }) {
  const { data, set } = useBlockForm()
  const id = useId()
  const { label, hint } = useFieldCopy(name, copy)
  return (
    <Field id={id} label={label} hint={hint}>
      <SegmentedControl<T>
        aria-label={label}
        fullWidth
        value={(str(data[name]) as T) || fallback}
        options={options}
        onChange={(value) => set({ [name]: value })}
      />
    </Field>
  )
}
