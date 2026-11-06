import { useCallback, useState, type Dispatch, type SetStateAction } from "react"

export type UseBooleanReturn = {
  value: boolean
  onTrue: () => void
  onFalse: () => void
  onToggle: () => void
  setValue: Dispatch<SetStateAction<boolean>>
}

/** Liga e desliga com callbacks estáveis, para diálogos e painéis. */
export function useBoolean(defaultValue = false): UseBooleanReturn {
  const [value, setValue] = useState(defaultValue)

  const onTrue = useCallback(() => setValue(true), [])
  const onFalse = useCallback(() => setValue(false), [])
  const onToggle = useCallback(() => setValue((prev) => !prev), [])

  return { value, onTrue, onFalse, onToggle, setValue }
}
