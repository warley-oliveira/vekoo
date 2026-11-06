import { onlyDigits } from "@/lib/format-phone"

const CNPJ_DIGITS = 14
const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const SECOND_WEIGHTS = [6, ...FIRST_WEIGHTS]

function checkDigit(digits: number[], weights: number[]): number {
  const sum = weights.reduce((total, weight, index) => total + digits[index] * weight, 0)
  const remainder = sum % 11
  return remainder < 2 ? 0 : 11 - remainder
}

/** A API só confere os 14 dígitos; os verificadores pegam o erro de digitação, como na origem. */
export function isValidCnpj(value: string): boolean {
  const clean = onlyDigits(value)
  if (clean.length !== CNPJ_DIGITS) return false
  if (/^(\d)\1{13}$/.test(clean)) return false

  const digits = Array.from(clean, Number)
  return (
    digits[12] === checkDigit(digits, FIRST_WEIGHTS) &&
    digits[13] === checkDigit(digits, SECOND_WEIGHTS)
  )
}

/** "11222333000181" vira "11.222.333/0001-81", também enquanto a pessoa digita. */
export function formatCnpj(value: string | null | undefined): string {
  return onlyDigits(value)
    .slice(0, CNPJ_DIGITS)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}
