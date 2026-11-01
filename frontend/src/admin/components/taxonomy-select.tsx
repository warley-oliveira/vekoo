import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// O valor do item "nenhum" (o campo volta a vazio).
const NONE = "__none"

type Props<T extends string> = {
  value: T | null
  options: readonly T[]
  labelFor: (code: T) => string
  onChange: (value: T | null) => void
  placeholder: string
  /** Texto do item que limpa o campo; sem ele o campo não volta a vazio. */
  noneLabel?: string
  id?: string
  ariaLabel?: string
  ariaDescribedBy?: string
  invalid?: boolean
  size?: "sm" | "default"
  className?: string
}

/** Um select de uma lista da taxonomia, com rótulo traduzido por código. */
export function TaxonomySelect<T extends string>({
  value,
  options,
  labelFor,
  onChange,
  placeholder,
  noneLabel,
  id,
  ariaLabel,
  ariaDescribedBy,
  invalid,
  size,
  className,
}: Props<T>) {
  const items: Record<string, string> = Object.fromEntries(options.map((code) => [code, labelFor(code)]))
  if (noneLabel) items[NONE] = noneLabel

  return (
    <Select
      value={(value ?? null) as string | null}
      items={items}
      onValueChange={(next) => onChange(next === null || next === NONE ? null : (next as T))}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid}
        className={className ?? "w-full"}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((code) => (
          <SelectItem key={code} value={code}>
            {items[code]}
          </SelectItem>
        ))}
        {noneLabel && value !== null && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
      </SelectContent>
    </Select>
  )
}
