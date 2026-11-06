// A mesma regra de `Products.web_url?` no servidor: http(s), com host e sem espaço.
const WEB_URL = /^https?:\/\/[^\s/?#]+\S*$/i
// "loja.com.br/produto", como a pessoa costuma colar: sem o esquema, mas sem dúvida um site.
const BARE_DOMAIN = /^[^\s/:@]+\.[^\s/:@]+(\/\S*)?$/

export function isWebUrl(value: string): boolean {
  return WEB_URL.test(value.trim())
}

/** Completa o esquema do que claramente é um site. O resto segue como veio, para a validação dizer. */
export function normalizeWebUrl(value: string): string {
  const text = value.trim()
  if (!text || /^[a-z][a-z0-9+.-]*:/i.test(text)) return text
  return BARE_DOMAIN.test(text) ? `https://${text}` : text
}
