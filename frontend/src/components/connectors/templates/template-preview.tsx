import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Copy, ExternalLink, FileText, ImageOff, MapPin, Phone, Play, Reply } from "lucide-react"

import { fillVariables, type ButtonType, type TemplateFormValues } from "@/lib/connectors/template-builder"
import { formatTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"

const BUTTON_ICONS: Record<ButtonType, typeof Reply> = {
  QUICK_REPLY: Reply,
  URL: ExternalLink,
  PHONE_NUMBER: Phone,
  COPY_CODE: Copy,
}

/**
 * Como o contato vai ver o modelo. É uma aproximação do WhatsApp, em tons do próprio tema:
 * o que interessa é o texto, a ordem e o que aparece, não copiar as cores do aplicativo.
 */
export function TemplatePreview({ values }: { values: TemplateFormValues }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { header, body, footer, buttons } = values
  const hasContent =
    Boolean(body.text.trim()) ||
    header.enabled ||
    (footer.enabled && footer.text.trim()) ||
    buttons.items.length > 0

  return (
    <div className="rounded-xl bg-muted/70 p-4" aria-label={t("connectors.templates.preview.title")}>
      {hasContent ? (
        <div className="ml-auto flex max-w-[20rem] flex-col overflow-hidden rounded-lg rounded-tr-sm bg-status-success-soft text-sm shadow-xs">
          <div className="flex flex-col gap-1.5 p-2.5">
            {header.enabled ? <HeaderPreview header={header} /> : null}
            {body.text.trim() ? (
              <p className="whitespace-pre-wrap wrap-anywhere">
                {fillVariables(body.text, body.examples)}
              </p>
            ) : null}
            {footer.enabled && footer.text.trim() ? (
              <p className="text-xs text-muted-foreground">{footer.text}</p>
            ) : null}
            <span className="self-end text-[0.6875rem] text-muted-foreground tabular-nums">
              {formatTime(new Date(), language)}
            </span>
          </div>
          {buttons.enabled
            ? buttons.items.map((button, index) => {
                const Icon = BUTTON_ICONS[button.type]
                return (
                  <div
                    key={index}
                    className="flex items-center justify-center gap-1.5 border-t border-foreground/10 px-2 py-1.5 text-xs font-medium"
                  >
                    <Icon aria-hidden className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {button.text || t("connectors.templates.preview.button", { number: index + 1 })}
                    </span>
                  </div>
                )
              })
            : null}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-pretty text-muted-foreground">
          {t("connectors.templates.preview.empty")}
        </p>
      )}
    </div>
  )
}

function HeaderPreview({ header }: { header: TemplateFormValues["header"] }) {
  const { t } = useTranslation()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  switch (header.format) {
    case "TEXT":
      return header.text ? <p className="font-medium wrap-anywhere">{header.text}</p> : null
    case "IMAGE":
      return header.mediaUrl && failedUrl !== header.mediaUrl ? (
        <img
          src={header.mediaUrl}
          alt=""
          className="max-h-40 w-full rounded-md object-cover"
          onError={() => setFailedUrl(header.mediaUrl)}
        />
      ) : (
        <MediaPlaceholder
          icon={<ImageOff className="size-5" />}
          text={t(
            header.mediaUrl
              ? "connectors.templates.preview.imageUnavailable"
              : "connectors.templates.preview.image"
          )}
        />
      )
    case "VIDEO":
      return <MediaPlaceholder icon={<Play className="size-5" />} text={t("connectors.templates.preview.video")} />
    case "DOCUMENT":
      return (
        <MediaPlaceholder icon={<FileText className="size-5" />} text={t("connectors.templates.preview.document")} />
      )
    case "LOCATION":
      return (
        <div className="overflow-hidden rounded-md bg-background/70">
          <MediaPlaceholder icon={<MapPin className="size-5" />} text={t("connectors.templates.preview.location")} />
          {header.placeName || header.address ? (
            <div className="px-2 py-1.5 text-xs">
              {header.placeName ? <p className="font-medium">{header.placeName}</p> : null}
              {header.address ? <p className="text-muted-foreground">{header.address}</p> : null}
            </div>
          ) : null}
        </div>
      )
    default:
      return null
  }
}

function MediaPlaceholder({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-md bg-background/70 text-xs text-muted-foreground">
      {icon}
      {text}
    </div>
  )
}
