import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { Input } from "@/components/ui/input"

/**
 * Uma lista curta de termos (o nome da marca de origem, de quem aparece no
 * post): Enter ou vírgula adiciona, o × tira. É o que a guarda de origem
 * procura na análise.
 */
export function TermsInput({
  label,
  hint,
  value,
  onChange,
  max = 20,
}: {
  label: string
  hint?: string
  value: string[]
  onChange: (terms: string[]) => void
  max?: number
}) {
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState("")

  const add = () => {
    const term = text.replace(/,/g, " ").trim()
    if (term && value.length < max && !value.some((item) => item.toLowerCase() === term.toLowerCase())) {
      onChange([...value, term])
    }
    setText("")
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        {value.map((term) => (
          <span key={term} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
            {term}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== term))}
              aria-label={t("admin.terms.remove", { term })}
              className="rounded text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <Input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault()
              add()
            } else if (event.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={add}
          placeholder={value.length ? "" : t("admin.terms.placeholder")}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-7 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        />
      </div>
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
