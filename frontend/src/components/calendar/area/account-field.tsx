import { useMemo, type Ref } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  FormField,
  SearchableSelect,
  type FieldControlProps,
  type FormFieldBaseProps,
  type SelectOption,
} from "@/components/shared"
import { usePeople } from "@/hooks/people/use-people"
import type { Person } from "@/lib/people/types"

type AccountOptions = {
  /** Quem não pode ser escolhido de novo: a conta que já é colaborador neste calendário. */
  takenIds?: ReadonlySet<string>
  takenLabel?: string
  /** O nome da conta atual, para aparecer antes da lista chegar ou se ela saiu da organização. */
  currentLabel?: string | null
  placeholder?: string
  onPick?: (person: Person | null) => void
}

type AccountFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> =
  FormFieldBaseProps<TValues, TName> & AccountOptions

/**
 * Escolher uma pessoa da organização. Quem perdeu o acesso não aparece: ela não atende, e quem não
 * administra nem recebe esse nome da API. Só o `id` vai para o formulário; quem quer o resto do
 * cadastro (nome, e-mail) recebe a pessoa em `onPick`.
 */
export function AccountField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  takenIds,
  takenLabel,
  currentLabel,
  placeholder,
  onPick,
  hint,
  ...fieldProps
}: AccountFieldProps<TValues, TName>) {
  const { t } = useTranslation()
  const { people, error, isLoading } = usePeople()

  return (
    <FormField
      {...fieldProps}
      hint={error && !people ? t("calendar.schedule.people.failed") : hint}
    >
      {({ field, controlProps }) => (
        <AccountSelect
          {...controlProps}
          inputRef={field.ref}
          value={field.value}
          people={people}
          loading={isLoading}
          takenIds={takenIds}
          takenLabel={takenLabel}
          currentLabel={currentLabel}
          placeholder={placeholder}
          onBlur={field.onBlur}
          onChange={field.onChange}
          onPick={onPick}
        />
      )}
    </FormField>
  )
}

function AccountSelect({
  value,
  people,
  loading,
  takenIds,
  takenLabel,
  currentLabel,
  placeholder,
  onChange,
  onBlur,
  onPick,
  inputRef,
  ...controlProps
}: Partial<FieldControlProps> &
  AccountOptions & {
    value: string | null
    people: Person[] | undefined
    loading: boolean
    onChange: (value: string | null) => void
    onBlur: () => void
    inputRef: Ref<HTMLInputElement>
  }) {
  const { t } = useTranslation()

  const options = useMemo<SelectOption[]>(
    () =>
      (people ?? [])
        .filter((person) => !person.revokedAt)
        .map((person) => {
          const taken = takenIds?.has(person.id) ?? false
          return {
            value: person.id,
            label: person.name,
            description: taken ? takenLabel : person.email,
            disabled: taken,
          }
        }),
    [people, takenIds, takenLabel]
  )

  // Memorizado: um objeto novo a cada render faria o campo reescrever o texto a cada tecla.
  const selectedOption = useMemo(
    () => (value && currentLabel ? { value, label: currentLabel } : null),
    [currentLabel, value]
  )

  return (
    <SearchableSelect
      {...controlProps}
      inputRef={inputRef}
      value={value}
      options={options}
      clearable
      selectedOption={selectedOption}
      placeholder={loading ? t("calendar.schedule.people.loading") : placeholder}
      emptyLabel={t("calendar.schedule.people.empty")}
      onBlur={onBlur}
      onChange={(next) => {
        onChange(next)
        onPick?.(people?.find((person) => person.id === next) ?? null)
      }}
    />
  )
}
