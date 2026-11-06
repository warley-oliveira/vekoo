// Telefone trafega como dígitos com o código do país ("5531983794137"), o formato
// que o back-end guarda; a máscara é só de exibição.

const BRAZIL = "55"
/** Teto da numeração internacional (E.164). */
const MAX_DIGITS = 15
const MAX_BRAZIL_DIGITS = 13

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "")
}

function splitBrazilian(national: string) {
  const ddd = national.slice(0, 2)
  const number = national.slice(2)
  const split = number.length >= 9 ? 5 : 4
  return { ddd, head: number.slice(0, split), tail: number.slice(split) }
}

/**
 * "5531983794137" vira "55 31 98379-4137". Número que não dá para interpretar
 * volta como chegou, para a tela nunca esconder o dado.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ""

  const digits = onlyDigits(phone)
  if (digits.length < 10) return phone

  let country = ""
  let rest = digits
  if (digits.length >= 12) {
    country = digits.slice(0, 2)
    rest = digits.slice(2)
  } else if (digits.length === 11 && digits[0] === "1" && digits[2] !== "9") {
    // Onze dígitos costumam ser um celular brasileiro sem o país, inclusive os de
    // DDD 11 a 19, que começam com 1 mas têm o nono dígito na terceira casa. Sem
    // ele, é o país de um dígito (EUA, Canadá).
    country = "1"
    rest = digits.slice(1)
  }

  const ddd = rest.slice(0, 2)
  const number = rest.slice(2)
  if (number.length < 8) return phone

  const split = number.length === 9 ? 5 : number.length - 4
  const local = `${ddd} ${number.slice(0, split)}-${number.slice(split)}`
  return country ? `${country} ${local}` : local
}

/** "5531983794137" vira "(31) 98379-4137". Fora do Brasil, volta como chegou. */
export function formatBrazilianPhone(phone: string | null | undefined): string {
  if (!phone) return ""

  const digits = onlyDigits(phone)
  if (!digits.startsWith(BRAZIL)) return phone

  const national = digits.slice(2)
  if (national.length !== 10 && national.length !== 11) return phone

  const { ddd, head, tail } = splitBrazilian(national)
  return `(${ddd}) ${head}-${tail}`
}

/**
 * Máscara progressiva do `PhoneField`, aplicada a cada tecla: "+55 31 98379-4137"
 * no Brasil, "+<dígitos>" nos demais.
 */
export function formatPhoneInput(digits: string): string {
  if (!digits) return ""
  if (!digits.startsWith(BRAZIL)) return `+${digits}`

  const national = digits.slice(2)
  if (!national) return `+${BRAZIL}`
  if (national.length <= 2) return `+${BRAZIL} ${national}`

  const { ddd, head, tail } = splitBrazilian(national)
  return `+${BRAZIL} ${ddd} ${head}${tail ? `-${tail}` : ""}`
}

/**
 * O inverso da máscara. Quem digita sem "+" está escrevendo um número nacional,
 * que ganha o país padrão; com "+", vale o que a pessoa escreveu.
 */
export function parsePhoneInput(text: string, defaultCountry = BRAZIL): string {
  const digits = onlyDigits(text)
  if (!digits) return ""

  const explicit = text.trimStart().startsWith("+")
  // Colou o número completo, sem o "+".
  const hasCountry = digits.startsWith(defaultCountry) && digits.length >= 12
  const full = explicit || hasCountry ? digits : `${defaultCountry}${digits}`
  return full.slice(0, full.startsWith(BRAZIL) ? MAX_BRAZIL_DIGITS : MAX_DIGITS)
}

/** Brasil: DDD + 8 ou 9 dígitos. Demais países: faixa do E.164. */
export function isValidPhone(digits: string | null | undefined): boolean {
  const value = onlyDigits(digits)
  if (value.startsWith(BRAZIL)) return value.length === 12 || value.length === 13
  return value.length >= 8 && value.length <= MAX_DIGITS
}
