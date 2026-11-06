import { useTranslation } from "react-i18next"
import { MessageCircle } from "lucide-react"

import { apiAssetUrl } from "@/lib/api"
import { WIDGET_DEFAULTS } from "@/lib/connectors/widget-presets"
import { cn } from "@/lib/utils"

export type WidgetPreviewValues = {
  primaryColor?: string | null
  position?: string | null
  welcomeMessage?: string | null
  botDisplayName?: string | null
  botAvatarUrl?: string | null
  launcherImageUrl?: string | null
  launcherSize?: number | null
  headerBgColor?: string | null
  headerTextColor?: string | null
  userBubbleColor?: string | null
  userBubbleTextColor?: string | null
  assistantBubbleColor?: string | null
  assistantBubbleTextColor?: string | null
  messageAreaBg?: string | null
  bubbleRadius?: number | null
  panelRadius?: number | null
  fontFamily?: string | null
}

const FONT_STACKS: Record<string, string> = {
  inter: "Inter, system-ui, sans-serif",
  roboto: "Roboto, system-ui, sans-serif",
  georgia: "Georgia, serif",
  rounded: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
  mono: "ui-monospace, monospace",
}

/**
 * Como o chat aparece no site, ao vivo, sem salvar. As cores são as que a loja escolheu: é
 * a única área da tela com cor própria, igual às capas de carrossel. Quando um campo fica
 * vazio, cai no mesmo padrão do bundle, para a prévia bater com o resultado.
 */
export function WidgetPreview({
  values,
  className,
}: {
  values: WidgetPreviewValues
  className?: string
}) {
  const { t } = useTranslation()
  const isLeft = values.position === "bottom-left"
  const primary = values.primaryColor || WIDGET_DEFAULTS.primaryColor
  const launcherSize = Math.min(96, Math.max(40, values.launcherSize ?? WIDGET_DEFAULTS.launcherSize))
  const bubbleRadius = values.bubbleRadius ?? WIDGET_DEFAULTS.bubbleRadius
  const side = isLeft ? { left: 16 } : { right: 16 }

  return (
    <div
      role="img"
      aria-label={t("connectors.widget.preview.label")}
      className={cn("relative min-h-96 overflow-hidden rounded-xl bg-muted/70", className)}
      style={values.fontFamily ? { fontFamily: FONT_STACKS[values.fontFamily] } : undefined}
    >
      <div
        className="absolute w-64 max-w-[calc(100%-2rem)] overflow-hidden bg-background shadow-lg"
        style={{
          ...side,
          bottom: 16 + launcherSize + 12,
          borderRadius: values.panelRadius ?? WIDGET_DEFAULTS.panelRadius,
        }}
      >
        <div
          className="flex items-center gap-2 p-2.5"
          style={{
            backgroundColor: values.headerBgColor || primary,
            color: values.headerTextColor || WIDGET_DEFAULTS.headerTextColor,
          }}
        >
          <span
            className="size-8 shrink-0 rounded-full bg-white/25 bg-cover bg-center"
            style={
              values.botAvatarUrl
                ? { backgroundImage: `url(${apiAssetUrl(values.botAvatarUrl)})` }
                : undefined
            }
          />
          <span className="truncate text-sm font-medium">
            {values.botDisplayName || t("connectors.widget.preview.botFallback")}
          </span>
        </div>
        <div
          className="flex flex-col gap-2 p-3 text-xs"
          style={{ backgroundColor: values.messageAreaBg || WIDGET_DEFAULTS.messageAreaBg }}
        >
          <span
            className="max-w-[85%] self-start p-2 ring-1 ring-black/5 wrap-anywhere"
            style={{
              backgroundColor: values.assistantBubbleColor || WIDGET_DEFAULTS.assistantBubbleColor,
              color: values.assistantBubbleTextColor || WIDGET_DEFAULTS.assistantBubbleTextColor,
              borderRadius: bubbleRadius,
            }}
          >
            {values.welcomeMessage || t("connectors.widget.preview.welcomeFallback")}
          </span>
          <span
            className="max-w-[85%] self-end p-2"
            style={{
              backgroundColor: values.userBubbleColor || primary,
              color: values.userBubbleTextColor || WIDGET_DEFAULTS.userBubbleTextColor,
              borderRadius: bubbleRadius,
            }}
          >
            {t("connectors.widget.preview.userSample")}
          </span>
        </div>
      </div>

      <span
        className="absolute bottom-4 flex items-center justify-center overflow-hidden rounded-full shadow-lg"
        style={{
          ...side,
          width: launcherSize,
          height: launcherSize,
          backgroundColor: primary,
          color: WIDGET_DEFAULTS.headerTextColor,
        }}
      >
        {values.launcherImageUrl ? (
          <img src={apiAssetUrl(values.launcherImageUrl)} alt="" className="size-full object-cover" />
        ) : (
          <MessageCircle aria-hidden className="size-1/2" />
        )}
      </span>
    </div>
  )
}
