// A paleta do widget é da loja que o instala, não do Vekoo: é a exceção à regra de não ter
// hex em tela. Os padrões repetem os do próprio bundle (`widget/styles.ts`), para a prévia
// bater com o que aparece no site quando uma cor fica em branco.

export const WIDGET_DEFAULTS = {
  primaryColor: "#5B93FF",
  headerTextColor: "#FFFFFF",
  userBubbleTextColor: "#FFFFFF",
  assistantBubbleColor: "#FFFFFF",
  assistantBubbleTextColor: "#1C1F23",
  messageAreaBg: "#F8FAFC",
  launcherSize: 60,
  bubbleRadius: 16,
  panelRadius: 18,
}

export const WIDGET_SWATCHES = [
  "#5B93FF",
  "#2563EB",
  "#0EA5E9",
  "#7C3AED",
  "#DB2777",
  "#DC2626",
  "#EA580C",
  "#F59E0B",
  "#059669",
  "#111827",
  "#64748B",
  "#FFFFFF",
] as const

export const WIDGET_COLOR_FIELDS = [
  "headerBgColor",
  "headerTextColor",
  "userBubbleColor",
  "userBubbleTextColor",
  "assistantBubbleColor",
  "assistantBubbleTextColor",
  "messageAreaBg",
] as const

export type WidgetColorField = (typeof WIDGET_COLOR_FIELDS)[number]

/** `system` é o vazio da API: um seletor não mostra uma opção com valor em branco. */
export const WIDGET_FONTS = ["system", "inter", "roboto", "georgia", "rounded", "mono"] as const

export type WidgetPreset = {
  key: string
  dark: boolean
  values: {
    primaryColor: string
    headerBgColor: string
    headerTextColor: string
    userBubbleColor: string
    userBubbleTextColor: string
    assistantBubbleColor: string
    assistantBubbleTextColor: string
    messageAreaBg: string
    bubbleRadius: number
    panelRadius: number
    fontFamily: string
  }
}

export const WIDGET_PRESETS: WidgetPreset[] = [
  {
    key: "light",
    dark: false,
    values: {
      primaryColor: "#5B93FF",
      headerBgColor: "#5B93FF",
      headerTextColor: "#FFFFFF",
      userBubbleColor: "#5B93FF",
      userBubbleTextColor: "#FFFFFF",
      assistantBubbleColor: "#FFFFFF",
      assistantBubbleTextColor: "#1C1F23",
      messageAreaBg: "#F8FAFC",
      bubbleRadius: 16,
      panelRadius: 18,
      fontFamily: "system",
    },
  },
  {
    key: "midnight",
    dark: true,
    values: {
      primaryColor: "#3B82F6",
      headerBgColor: "#0F172A",
      headerTextColor: "#F8FAFC",
      userBubbleColor: "#3B82F6",
      userBubbleTextColor: "#FFFFFF",
      assistantBubbleColor: "#1E293B",
      assistantBubbleTextColor: "#E2E8F0",
      messageAreaBg: "#0B1220",
      bubbleRadius: 14,
      panelRadius: 16,
      fontFamily: "system",
    },
  },
  {
    key: "minimal",
    dark: false,
    values: {
      primaryColor: "#111827",
      headerBgColor: "#FFFFFF",
      headerTextColor: "#111827",
      userBubbleColor: "#111827",
      userBubbleTextColor: "#FFFFFF",
      assistantBubbleColor: "#F3F4F6",
      assistantBubbleTextColor: "#111827",
      messageAreaBg: "#FFFFFF",
      bubbleRadius: 8,
      panelRadius: 12,
      fontFamily: "system",
    },
  },
  {
    key: "violetLight",
    dark: false,
    values: {
      primaryColor: "#7C3AED",
      headerBgColor: "#7C3AED",
      headerTextColor: "#FFFFFF",
      userBubbleColor: "#7C3AED",
      userBubbleTextColor: "#FFFFFF",
      assistantBubbleColor: "#F5F3FF",
      assistantBubbleTextColor: "#4C1D95",
      messageAreaBg: "#FAF5FF",
      bubbleRadius: 20,
      panelRadius: 20,
      fontFamily: "rounded",
    },
  },
  {
    key: "violetDark",
    dark: true,
    values: {
      primaryColor: "#8B5CF6",
      headerBgColor: "#2E1065",
      headerTextColor: "#F5F3FF",
      userBubbleColor: "#7C3AED",
      userBubbleTextColor: "#FFFFFF",
      assistantBubbleColor: "#1E1B4B",
      assistantBubbleTextColor: "#DDD6FE",
      messageAreaBg: "#130F2E",
      bubbleRadius: 18,
      panelRadius: 18,
      fontFamily: "system",
    },
  },
  {
    key: "emerald",
    dark: false,
    values: {
      primaryColor: "#059669",
      headerBgColor: "#059669",
      headerTextColor: "#FFFFFF",
      userBubbleColor: "#059669",
      userBubbleTextColor: "#FFFFFF",
      assistantBubbleColor: "#ECFDF5",
      assistantBubbleTextColor: "#064E3B",
      messageAreaBg: "#F0FDF4",
      bubbleRadius: 16,
      panelRadius: 16,
      fontFamily: "system",
    },
  },
]

/**
 * "https://loja.com/produto?x=1" vira "https://loja.com": o back compara o endereço exato
 * da origem, sem caminho. Devolve `null` se não for um endereço http(s).
 */
export function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null
    return url.origin
  } catch {
    return null
  }
}
