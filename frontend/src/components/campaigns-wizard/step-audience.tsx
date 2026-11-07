import { lazy, Suspense, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  ChevronRight,
  FileSpreadsheet,
  FileUp,
  List,
  Store,
  Trash2,
  Users,
} from "lucide-react"
import { toast } from "@/lib/campaigns-wizard/notify"

import { Callout, ErrorState, ListSkeleton, StatusBadge, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  useCampaignCapabilities,
  useRecipientSummary,
} from "@/hooks/campaigns-wizard/use-campaign-options"
import { useDraft } from "@/hooks/campaigns-wizard/use-draft"
import { useCan } from "@/hooks/use-can"
import { apiDelete } from "@/lib/api"
import type { RemoveResult } from "@/lib/campaigns-wizard/types"
import { asToken } from "@/lib/campaigns-wizard/variables"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { StepHeading, useWizardNav } from "./wizard-nav"

const ContactsPanel = lazy(() => import("./audience/contacts-panel"))
const FileImportPanel = lazy(() => import("./audience/file-import-panel"))
const SheetsPanel = lazy(() => import("./audience/sheets-panel"))
const PlacesPanel = lazy(() => import("./audience/places-panel"))
const RecipientsPanel = lazy(() => import("./audience/recipients-panel"))

type Panel = "contacts" | "file" | "sheets" | "places" | "recipients"

function SourceCard({
  icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  badge?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-20 w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4.5"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{title}</span>
          {badge}
        </span>
        <span className="mt-0.5 block text-sm text-pretty text-muted-foreground">{description}</span>
      </span>
      <ChevronRight
        aria-hidden
        className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
      />
    </button>
  )
}

function OriginRow({
  label,
  count,
  onRemove,
}: {
  label: string
  count: number
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <li className="flex min-h-10 items-center gap-3 px-3 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-medium tabular-nums">{formatNumber(count, language)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground pointer-coarse:size-10"
        aria-label={t("campaignsWizard.audience.removeOrigin", { label })}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

/** Para quem vai: de onde vem a lista, quantas pessoas já entraram e o que dá para usar na mensagem. */
export function StepAudience() {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { campaignId } = useDraft()
  const { audienceError } = useWizardNav()
  const canSeeContacts = useCan("contacts")
  const { capabilities } = useCampaignCapabilities()
  const { summary, error, isLoading, reload } = useRecipientSummary(campaignId)
  const [panel, setPanel] = useState<Panel | null>(null)

  const close = () => setPanel(null)

  async function removeOrigin(origin: "contacts" | "imported", label: string, count: number) {
    if (!campaignId) return

    const confirmed = await confirm({
      title: t("campaignsWizard.audience.removeTitle", { count, formatted: formatNumber(count, language) }),
      description: t("campaignsWizard.audience.removeHint", { label }),
      confirmLabel: t("campaignsWizard.audience.remove"),
      destructive: true,
      onConfirm: async () => {
        await apiDelete<RemoveResult>(`/campaigns/${campaignId}/recipients?origin=${origin}`)
        await reload()
      },
    })
    if (confirmed) toast.success(t("campaignsWizard.audience.removed"))
  }

  const { total } = summary

  return (
    <section aria-labelledby="wizard-step-audience" className="flex flex-col gap-6">
      <StepHeading
        id="wizard-step-audience"
        title={t("campaignsWizard.steps.audience.title")}
        hint={t("campaignsWizard.steps.audience.hint")}
      />

      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void reload()} className="border-0 p-4" />
      ) : total > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p aria-live="polite" className="font-heading text-2xl font-medium tabular-nums">
              {t("campaignsWizard.audience.total", {
                count: total,
                formatted: formatNumber(total, language),
              })}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mr-2 pointer-coarse:h-10"
              onClick={() => setPanel("recipients")}
            >
              <List />
              {t("campaignsWizard.audience.seeList")}
            </Button>
          </div>

          <ul className="divide-y rounded-lg border">
            {summary.fromContacts > 0 ? (
              <OriginRow
                label={t("campaignsWizard.audience.fromContacts")}
                count={summary.fromContacts}
                onRemove={() =>
                  void removeOrigin(
                    "contacts",
                    t("campaignsWizard.audience.fromContacts"),
                    summary.fromContacts
                  )
                }
              />
            ) : null}
            {summary.imported > 0 ? (
              <OriginRow
                label={t("campaignsWizard.audience.imported")}
                count={summary.imported}
                onRemove={() =>
                  void removeOrigin("imported", t("campaignsWizard.audience.imported"), summary.imported)
                }
              />
            ) : null}
          </ul>

          {summary.variables.length > 0 ? (
            <p className="text-xs text-pretty text-muted-foreground">
              {t("campaignsWizard.audience.variablesFound", {
                list: summary.variables
                  .slice(0, 6)
                  .map((variable) => asToken(variable.name))
                  .join(", "),
              })}
            </p>
          ) : null}
        </div>
      ) : audienceError ? (
        <Callout tone="danger" role="alert">
          {t("campaignsWizard.errors.audienceRequired")}
        </Callout>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          {total > 0
            ? t("campaignsWizard.audience.addMore")
            : t("campaignsWizard.audience.addFirst")}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <SourceCard
            icon={<Users />}
            title={t("campaignsWizard.audience.sources.contacts.title")}
            description={t("campaignsWizard.audience.sources.contacts.description")}
            badge={
              canSeeContacts ? null : (
                <StatusBadge tone="neutral">{t("campaignsWizard.audience.noPermission")}</StatusBadge>
              )
            }
            onClick={() => setPanel("contacts")}
          />
          <SourceCard
            icon={<FileUp />}
            title={t("campaignsWizard.audience.sources.file.title")}
            description={t("campaignsWizard.audience.sources.file.description")}
            onClick={() => setPanel("file")}
          />
          <SourceCard
            icon={<FileSpreadsheet />}
            title={t("campaignsWizard.audience.sources.sheets.title")}
            description={t("campaignsWizard.audience.sources.sheets.description")}
            badge={
              capabilities && !capabilities.googleSheets.available ? (
                <StatusBadge tone="neutral">{t("campaignsWizard.audience.notConfigured")}</StatusBadge>
              ) : null
            }
            onClick={() => setPanel("sheets")}
          />
          <SourceCard
            icon={<Store />}
            title={t("campaignsWizard.audience.sources.places.title")}
            description={t("campaignsWizard.audience.sources.places.description")}
            onClick={() => setPanel("places")}
          />
        </div>
        <p className={cn("text-xs text-pretty text-muted-foreground")}>
          {t("campaignsWizard.audience.mixHint")}
        </p>
      </div>

      {/* Sem fallback: cada painel abre por cima, e o trecho carrega em uma fração de segundo. */}
      <Suspense fallback={null}>
        {panel === "contacts" ? <ContactsPanel onClose={close} /> : null}
        {panel === "file" ? <FileImportPanel onClose={close} /> : null}
        {panel === "sheets" ? (
          <SheetsPanel
            capabilities={capabilities?.googleSheets ?? null}
            onClose={close}
            onUseFile={() => setPanel("file")}
          />
        ) : null}
        {panel === "places" ? (
          <PlacesPanel available={capabilities?.placeExtractions.available ?? false} onClose={close} />
        ) : null}
        {panel === "recipients" && campaignId ? (
          <RecipientsPanel campaignId={campaignId} onClose={close} />
        ) : null}
      </Suspense>
    </section>
  )
}
