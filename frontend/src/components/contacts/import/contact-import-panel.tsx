import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { ArrowLeft, Check, Plus } from "lucide-react"

import { useConnectorTexts } from "@/components/connectors/connector-texts"
import { KeyValueList, ResponsiveDialog, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useImportOutcome, useImportSender } from "@/hooks/contacts/use-contact-imports"
import { useContactFilterOptions } from "@/hooks/contacts/use-contacts"
import { useCan } from "@/hooks/use-can"
import { useOpenCount } from "@/hooks/use-panel-session"
import type { Connector } from "@/lib/connectors/types"
import { IMPORTABLE_CONNECTORS } from "@/lib/contacts/format"
import {
  EMPTY_MAPPING,
  buildPreview,
  suggestMapping,
  summarizePreview,
  toImportContacts,
  type ImportMapping,
  type ParsedImport,
} from "@/lib/contacts/import-parser"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { ImportChannelStep } from "./import-channel-step"
import { ImportColumnsStep } from "./import-columns-step"
import { ImportFileStep } from "./import-file-step"
import { ImportHistory } from "./import-history"
import { ImportReviewStep } from "./import-review-step"
import { ImportTrackingStep } from "./import-tracking-step"

type Step = "file" | "columns" | "review" | "channel" | "tracking" | "history"

const WIZARD_STEPS = ["file", "columns", "review", "channel"] as const

export type ImportView = "new" | "history"

export type ContactImportPanelProps = {
  /** `null` fecha o painel. */
  view: ImportView | null
  onViewChange: (view: ImportView | null) => void
  /** Aberto da tela de um canal: ele já está escolhido, e a etapa de escolher some. */
  connector?: Connector | null
  /** Depois de terminar, ver o que entrou. Sem isto, vai para a lista filtrada pelo canal. */
  onViewContacts?: (connectorId: string) => void
}

/**
 * A importação inteira num painel só: arquivo, colunas, conferência, canal, acompanhar. O painel
 * remonta a cada abertura, então a próxima importação nunca herda a anterior.
 */
export default function ContactImportPanel(props: ContactImportPanelProps) {
  const openCount = useOpenCount(props.view !== null)
  return <ImportPanelBody key={openCount} {...props} />
}

function ImportPanelBody({
  view,
  onViewChange,
  connector,
  onViewContacts,
}: ContactImportPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const preset = useMotionPreset()
  const confirm = useConfirm()
  const language = useLanguage()
  const texts = useConnectorTexts()
  const canSeeContacts = useCan("contacts")

  // Quem veio da tela do canal pode nem ter a permissão de contatos, que é o que abre a lista.
  const needsOptions = view !== null && !connector && canSeeContacts
  const { options, lookups, error: optionsError, isLoading: optionsLoading, reload } =
    useContactFilterOptions(needsOptions)

  const importable = useMemo(
    () =>
      (options?.connectors ?? []).filter((item) => IMPORTABLE_CONNECTORS.includes(item.type)),
    [options?.connectors]
  )

  const [step, setStep] = useState<Step>(view === "history" ? "history" : "file")
  const [lastView, setLastView] = useState(view)
  if (view !== lastView) {
    setLastView(view)
    if (view === "history") setStep("history")
  }

  const [fileName, setFileName] = useState("")
  const [parsed, setParsed] = useState<ParsedImport | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>(EMPTY_MAPPING)
  // Base brasileira: quase sempre o número vem sem o 55.
  const [includeCountryCode, setIncludeCountryCode] = useState(true)
  const [pickedConnector, setPickedConnector] = useState<string | null>(null)

  const sender = useImportSender()
  const outcome = useImportOutcome(sender.state.importIds, sender.state)

  const preview = useMemo(
    () => (parsed ? buildPreview(parsed, mapping, includeCountryCode) : []),
    [includeCountryCode, mapping, parsed]
  )
  const summary = useMemo(() => summarizePreview(preview), [preview])

  const connectorId =
    connector?.id ?? pickedConnector ?? (importable.length === 1 ? importable[0].id : null)
  const sameColumn = mapping.name !== null && mapping.name === mapping.phone
  const columnsReady = Boolean(mapping.name && mapping.phone) && !sameColumn && summary.ready > 0

  const stepOrder = connector ? (["file", "columns", "review"] as const) : WIZARD_STEPS
  const wizardIndex = (stepOrder as readonly string[]).indexOf(step)
  const isWizard = wizardIndex >= 0
  const isLastStep = wizardIndex === stepOrder.length - 1

  const hasWork = parsed !== null && isWizard
  const sending = sender.state.phase === "sending"
  const amount = {
    count: summary.ready,
    formatted: formatNumber(summary.ready, language),
  }

  function handleParsed(name: string, next: ParsedImport) {
    setFileName(name)
    setParsed(next)
    setMapping(suggestMapping(next.headers))
    setStep("columns")
  }

  function startOver() {
    sender.reset()
    setParsed(null)
    setFileName("")
    setMapping(EMPTY_MAPPING)
    setPickedConnector(null)
    setStep("file")
  }

  function startImport() {
    if (!connectorId) return
    sender.send({ connectorId, fileName, contacts: toImportContacts(preview) })
    setStep("tracking")
  }

  async function close() {
    if (sending) {
      const confirmed = await confirm({
        title: t("contacts.import.stop.title"),
        description: t("contacts.import.stop.hint"),
        confirmLabel: t("contacts.import.stop.confirm"),
        cancelLabel: t("contacts.import.stop.cancel"),
        destructive: true,
      })
      if (!confirmed) return
      sender.stop()
    } else if (hasWork) {
      const confirmed = await confirm({
        title: t("contacts.import.discard.title"),
        description: t("contacts.import.discard.hint"),
        confirmLabel: t("contacts.import.discard.confirm"),
        cancelLabel: t("contacts.import.discard.cancel"),
        destructive: true,
      })
      if (!confirmed) return
    }
    onViewChange(null)
  }

  function viewContacts() {
    const target = connectorId
    onViewChange(null)
    if (!target) return
    if (onViewContacts) onViewContacts(target)
    else navigate(`/contacts?connectors=${target}`)
  }

  const title =
    step === "history"
      ? t("contacts.import.history.title")
      : step === "tracking"
        ? t("contacts.import.tracking.title")
        : t("contacts.import.action")

  const description = connector
    ? t("contacts.import.descriptionForChannel", { name: texts.title(connector) })
    : step === "file"
      ? t("contacts.import.description")
      : undefined

  const previous = isWizard && wizardIndex > 0 ? stepOrder[wizardIndex - 1] : null
  const next = isWizard && !isLastStep ? stepOrder[wizardIndex + 1] : null

  // O resumo da última etapa: o último olhar antes de enviar.
  const settingsSummary = parsed ? (
    <section aria-labelledby="import-summary-title" className="flex flex-col gap-2 border-t pt-4">
      <h3 id="import-summary-title" className="text-sm font-medium">
        {t("contacts.import.summary.title")}
      </h3>
      <KeyValueList
        items={[
          {
            label: t("contacts.import.summary.file"),
            value: parsed.fileType
              ? t("contacts.import.summary.fileWithType", {
                  name: fileName,
                  type: parsed.fileType.toUpperCase(),
                })
              : fileName,
          },
          { label: t("contacts.import.summary.name"), value: mapping.name },
          { label: t("contacts.import.summary.phone"), value: mapping.phone },
          {
            label: t("contacts.import.summary.countryCode"),
            value: t(
              includeCountryCode
                ? "contacts.import.summary.countryCodeOn"
                : "contacts.import.summary.countryCodeOff"
            ),
          },
          ...(mapping.assignee
            ? [{ label: t("contacts.import.summary.assignee"), value: mapping.assignee }]
            : []),
          ...(mapping.department
            ? [{ label: t("contacts.import.summary.department"), value: mapping.department }]
            : []),
        ]}
      />
    </section>
  ) : null

  const footer =
    step === "history" ? (
      <Button type="button" className="pointer-coarse:h-10" onClick={startOver}>
        <Plus />
        {t("contacts.import.action")}
      </Button>
    ) : step === "tracking" ? (
      sender.state.phase === "failed" ? (
        <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={() => void close()}>
          {t("contacts.actions.close")}
        </Button>
      ) : outcome.running ? (
        <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={() => void close()}>
          {t("contacts.import.tracking.keepGoing")}
        </Button>
      ) : (
        <>
          <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={startOver}>
            {t("contacts.import.tracking.another")}
          </Button>
          {canSeeContacts ? (
            <Button type="button" className="pointer-coarse:h-10" onClick={viewContacts}>
              {t("contacts.import.tracking.viewContacts")}
            </Button>
          ) : (
            <Button type="button" className="pointer-coarse:h-10" onClick={() => onViewChange(null)}>
              {t("contacts.actions.close")}
            </Button>
          )}
        </>
      )
    ) : step === "file" && !parsed ? undefined : (
      // Numa linha só, também no celular: três botões empilhados comeriam a conferência, e lá
      // cancelar já está no X do painel.
      <div className="flex w-full items-center gap-2 sm:justify-end">
        {previous ? (
          <Button
            type="button"
            variant="ghost"
            className="pointer-coarse:h-10 sm:mr-auto"
            onClick={() => setStep(previous)}
          >
            <ArrowLeft />
            {t("contacts.actions.back")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="max-sm:hidden pointer-coarse:h-10"
          onClick={() => void close()}
        >
          {t("contacts.actions.cancel")}
        </Button>
        {isLastStep ? (
          <Button
            type="button"
            disabled={!connectorId || !columnsReady}
            className="pointer-coarse:h-10 max-sm:flex-1"
            onClick={startImport}
          >
            {t("contacts.import.submit", amount)}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!next || !columnsReady}
            className="pointer-coarse:h-10 max-sm:flex-1"
            onClick={() => {
              if (next) setStep(next)
            }}
          >
            {t("contacts.actions.continue")}
          </Button>
        )}
      </div>
    )

  return (
    <ResponsiveDialog
      open={view !== null}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
      size="2xl"
      fixedHeight
      title={title}
      description={description}
      // Clicar fora não pode jogar fora o que a pessoa mapeou com cuidado.
      disablePointerDismissal={hasWork || sending}
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        {isWizard ? <ImportSteps steps={stepOrder} current={wizardIndex} /> : null}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} {...preset.fade}>
            {step === "file" ? (
              <ImportFileStep
                loadedFile={parsed ? fileName : null}
                onParsed={handleParsed}
                onHistory={() => setStep("history")}
              />
            ) : step === "columns" && parsed ? (
              <ImportColumnsStep
                fileName={fileName}
                headers={parsed.headers}
                mapping={mapping}
                onMappingChange={setMapping}
                includeCountryCode={includeCountryCode}
                onIncludeCountryCodeChange={setIncludeCountryCode}
                preview={preview}
                summary={summary}
              />
            ) : step === "review" ? (
              <ImportReviewStep
                preview={preview}
                summary={summary}
                mapping={mapping}
                footer={isLastStep ? settingsSummary : null}
              />
            ) : step === "channel" ? (
              <ImportChannelStep
                connectors={importable}
                isLoading={optionsLoading}
                error={optionsError}
                onRetry={() => void reload()}
                value={connectorId}
                onChange={setPickedConnector}
                readyCount={summary.ready}
                footer={settingsSummary}
              />
            ) : step === "tracking" ? (
              <ImportTrackingStep
                send={sender.state}
                onResume={sender.resume}
                ignored={summary.ignored}
              />
            ) : (
              <ImportHistory
                connectorName={(id) => {
                  if (connector?.id === id) return texts.title(connector)
                  const item = lookups.connectors.get(id)
                  return item ? texts.title(item) : null
                }}
                onNew={startOver}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </ResponsiveDialog>
  )
}

function ImportSteps({
  steps,
  current,
}: {
  steps: readonly (typeof WIZARD_STEPS)[number][]
  current: number
}) {
  const { t } = useTranslation()

  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {steps.map((key, index) => (
        <li
          key={key}
          aria-current={index === current ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5",
            index === current ? "font-medium text-foreground" : "text-muted-foreground"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-5 items-center justify-center rounded-full tabular-nums",
              index === current
                ? "bg-primary text-primary-foreground"
                : index < current
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {index < current ? <Check className="size-3" /> : index + 1}
          </span>
          {t(`contacts.import.steps.${key}`)}
        </li>
      ))}
    </ol>
  )
}
