// O que dá para dizer de um aparelho a partir do navegador. Nomes próprios, sem tradução.

export type BrowserFamily = "ios" | "android" | "firefox" | "safari" | "chromium"

function browserName(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return "Edge"
  if (/OPR\//.test(userAgent)) return "Opera"
  if (/SamsungBrowser/.test(userAgent)) return "Samsung Internet"
  if (/Firefox\/|FxiOS/.test(userAgent)) return "Firefox"
  if (/Chrome\/|CriOS/.test(userAgent)) return "Chrome"
  if (/Safari\//.test(userAgent)) return "Safari"
  return null
}

function systemName(userAgent: string): string | null {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS"
  if (/Android/.test(userAgent)) return "Android"
  if (/Windows/.test(userAgent)) return "Windows"
  if (/Mac OS X/.test(userAgent)) return "macOS"
  if (/CrOS/.test(userAgent)) return "ChromeOS"
  if (/Linux/.test(userAgent)) return "Linux"
  return null
}

export function describeUserAgent(userAgent: string | null | undefined): {
  browser: string | null
  system: string | null
} {
  if (!userAgent) return { browser: null, system: null }
  return { browser: browserName(userAgent), system: systemName(userAgent) }
}

/** Qual passo a passo mostrar a quem bloqueou as notificações. */
export function browserFamily(userAgent: string): BrowserFamily {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios"
  if (/Android/.test(userAgent)) return "android"
  if (/Firefox\//.test(userAgent)) return "firefox"
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return "safari"
  return "chromium"
}

/** iPhone e iPad só recebem com o app na Tela de Início: o navegador nem oferece. */
export function isIosBrowser(userAgent: string): boolean {
  return browserFamily(userAgent) === "ios"
}
