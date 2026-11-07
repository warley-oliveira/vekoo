// A proteção de verdade é do servidor (`SafeHttp`), na hora de chamar: resolve o nome, confere cada endereço e fixa a
// conexão no IP conferido. Aqui é só o aviso antecipado, olhando o que está escrito: quem digita `localhost` não precisa
// esperar a primeira entrega falhar para saber que não vai funcionar. Com variável no endereço, não dá para saber antes.

export type RefusedReason = "scheme" | "credentials" | "internal" | "port"

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"])

function isInternalIpv4(host: string): boolean {
  const parts = host.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true
  if (host.startsWith("[")) {
    const ipv6 = host.slice(1, -1)
    return ipv6 === "::1" || ipv6 === "::" || ipv6.startsWith("fc") || ipv6.startsWith("fd") || ipv6.startsWith("fe8")
  }
  // Um nome sem ponto só existe dentro de uma rede.
  if (!host.includes(".")) return true
  return isInternalIpv4(host)
}

export function refusedReason(url: string): RefusedReason | null {
  const value = url.trim()
  if (!value || value.includes("{{")) return null

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "scheme"
  if (parsed.username || parsed.password) return "credentials"
  if (isInternalHost(parsed.hostname)) return "internal"
  if (!ALLOWED_PORTS.has(parsed.port)) return "port"
  return null
}

/** Um endereço que dá para chamar: começa por http ou https, ou vem de uma variável. */
export function looksLikeUrl(url: string): boolean {
  const value = url.trim()
  if (value.startsWith("{{")) return true
  return /^https?:\/\/\S+/i.test(value)
}
