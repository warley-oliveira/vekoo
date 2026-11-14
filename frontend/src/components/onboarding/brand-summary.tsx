import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { FontPair } from "@/components/onboarding/option-picker"
import { Button } from "@/components/ui/button"
import { logoAsset, primaryLogo, type BrandCore } from "@/lib/brand-core"

/** Quantos produtos o resumo mostra antes de virar "+n". */
const OFFERS_SHOWN = 3

type BrandSummaryProps = {
  brandCore: BrandCore
  publishing: boolean
  onPublish: () => void
  onAdjust: () => void
}

/**
 * A marca montada, em uma olhada: o que a pessoa contou, organizado — nunca o
 * schema cru. Papel de cor, peso de fonte e estilo de texto ficam para o modo
 * de edição; aqui é nome, o que vende, pra quem, tom, paleta, fonte e logo.
 *
 * É a última coisa antes de publicar, e por isso mostra também o que a
 * plataforma preencheu sozinha (a voz de quem pulou, o logotipo desenhado):
 * nada entra na marca sem ela ter visto.
 */
export function BrandSummary({ brandCore, publishing, onPublish, onAdjust }: BrandSummaryProps) {
  const { t } = useTranslation()
  const { identity, voice, offers, palette, typography } = brandCore.document
  // A principal (a escolhida entre os três logotipos, ou a enviada).
  const logo = logoAsset(brandCore, primaryLogo(brandCore), "light")
  const banned = voice.bannedWords.map((word) => word.text).filter(Boolean)

  return (
    <div className="space-y-5">
      <dl className="divide-y rounded-xl border bg-card">
        <Row label={t("onboarding.summary.labels.brand")}>{identity.name}</Row>
        <Row label={t("onboarding.summary.labels.what")}>{identity.concept}</Row>
        <Row label={t("onboarding.summary.labels.audience")}>{identity.audience}</Row>
        <Row label={t("onboarding.summary.labels.differential")}>{identity.positioning}</Row>
        <Row label={t("onboarding.summary.labels.voice")}>{voice.essence}</Row>
        <Row label={t("onboarding.summary.labels.banned")}>
          {banned.length > 0 ? banned.join(", ") : voice.toneNote}
        </Row>
        <Row label={t("onboarding.summary.labels.offers")}>
          {offers.items.length > 0 && (
            <ul className="space-y-0.5">
              {offers.items.slice(0, OFFERS_SHOWN).map((offer) => (
                <li key={offer.id}>
                  {offer.name}
                  {offer.price && <span className="text-muted-foreground"> · {offer.price}</span>}
                </li>
              ))}
              {offers.items.length > OFFERS_SHOWN && (
                <li className="font-mono text-xs text-muted-foreground">+{offers.items.length - OFFERS_SHOWN}</li>
              )}
            </ul>
          )}
        </Row>
        <Row label={t("onboarding.summary.labels.logo")}>
          {logo && (
            <span className="inline-grid h-14 max-w-48 place-items-center rounded-md border bg-background p-2">
              <img src={logo.url} alt={logo.name} className="max-h-full max-w-full object-contain" />
            </span>
          )}
        </Row>
        <Row label={t("onboarding.summary.labels.palette")}>
          {palette.colors.length > 0 && (
            <>
              <span className="flex flex-wrap" aria-hidden>
                {palette.colors.map((color) => (
                  // Cantos retos: é a cor da obra dela.
                  <span key={color.id} className="size-7" style={{ backgroundColor: color.hex }} />
                ))}
              </span>
              <span className="sr-only">{palette.colors.map((color) => color.name).join(", ")}</span>
            </>
          )}
        </Row>
        <Row label={t("onboarding.summary.labels.fonts")}>
          {typography.display.family && (
            <FontPair display={typography.display.family} utility={typography.utility.family} />
          )}
        </Row>
      </dl>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button size="lg" onClick={onPublish} disabled={publishing} className="h-11 sm:w-auto">
          {publishing && <Loader2 className="animate-spin" aria-hidden />}
          {t("onboarding.summary.publish")}
        </Button>
        <Button variant="ghost" size="lg" onClick={onAdjust} disabled={publishing} className="h-11 font-mono text-sm">
          {t("onboarding.summary.adjust")}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === "" || children === false
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="font-mono text-[11px] tracking-wide text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 text-sm text-pretty break-words">
        {empty ? <span className="text-muted-foreground">—</span> : children}
      </dd>
    </div>
  )
}
