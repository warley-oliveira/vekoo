import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
  useWatch,
  type Resolver,
} from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeft, ArrowRight, Check, Loader2, Rocket, Trash2, X } from "lucide-react"

import { ActionsMenu, ConfirmDialog, useConfirm } from "@/components/shared"
import { useShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import {
  useConnectorTemplates,
  useRecipientSummary,
} from "@/hooks/campaigns-wizard/use-campaign-options"
import {
  reloadCampaignLists,
  useDraft,
  useSaveState,
  type SaveStatus,
} from "@/hooks/campaigns-wizard/use-draft"
import { WizardNavContext, useWizardNav } from "@/hooks/campaigns-wizard/use-wizard-nav"
import { useImmersive } from "@/hooks/use-app-shell"
import { useHeaderSlot, usePageTitle } from "@/hooks/use-header-slot"
import { useMobileShell } from "@/hooks/use-mobile-shell"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { apiDelete, apiPost } from "@/lib/api"
import {
  LINKED_EXTRACTION_PARAM,
  WIZARD_STEPS,
  defaultValues,
  filledMessages,
  isWizardStep,
  readSavedSchedule,
  toDraftPayload,
  valuesFromCampaign,
  writeSavedSchedule,
  type WizardStep,
  type WizardValues,
} from "@/lib/campaigns-wizard/form"
import {
  STEP_FIELDS,
  buildWizardSchema,
  stepOfField,
  type TemplateParamRule,
} from "@/lib/campaigns-wizard/schema"
import type { Campaign, CampaignResponse, LaunchResponse } from "@/lib/campaigns-wizard/types"
import { toast } from "@/lib/campaigns-wizard/notify"
import { templateFitsCampaign, templatePositions } from "@/lib/campaigns-wizard/templates"
import { asToken, variableProblems } from "@/lib/campaigns-wizard/variables"
import { formatFullDateTime, formatTime } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { DraftProvider } from "./draft-provider"
import { StepAudience } from "./step-audience"
import { StepMessage } from "./step-message"
import { StepReview } from "./step-review"
import { StepSchedule } from "./step-schedule"

/* ---------- salvar ---------- */

function SaveIndicator({ className }: { className?: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { flush } = useDraft()
  const status = useSaveState((state) => state.status)
  const savedAt = useSaveState((state) => state.savedAt)

  const text: Record<SaveStatus, string | null> = {
    idle: null,
    pending: t("campaignsWizard.save.saving"),
    saving: t("campaignsWizard.save.saving"),
    saved: savedAt ? t("campaignsWizard.save.saved", { time: formatTime(savedAt, language) }) : null,
    error: t("campaignsWizard.save.failed"),
    locked: t("campaignsWizard.save.locked"),
  }
  const label = text[status]
  if (!label) return null

  return (
    <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)} role="status">
      {status === "saving" || status === "pending" ? (
        <Loader2 aria-hidden className="size-3 animate-spin" />
      ) : status === "saved" ? (
        <Check aria-hidden className="size-3" />
      ) : null}
      <span className={cn("truncate", (status === "error" || status === "locked") && "text-destructive")}>{label}</span>
      {status === "error" ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto p-0 pointer-coarse:min-h-8"
          onClick={() => void flush().catch(() => {})}
        >
          {t("campaignsWizard.save.retry")}
        </Button>
      ) : null}
    </span>
  )
}

/**
 * Sair não pergunta nada: o que falta salvar é salvo antes de ir. Só se isso falhar é que a pessoa decide
 * entre ficar e perder a última alteração.
 */
function LeaveGuard() {
  const { t } = useTranslation()
  const { flush } = useDraft()
  const status = useSaveState((state) => state.status)
  const unsaved = status === "pending" || status === "saving" || status === "error"
  // A guarda segura a navegação até salvar: se ela desligasse assim que o rascunho ficasse salvo, a saída
  // que estava esperando se perderia, e o clique da pessoa não daria em nada.
  const leaving = useSaveState((state) => state.leaving)
  const { blocked, proceed, reset } = useUnsavedChanges(unsaved || leaving)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!blocked) return

    let current = true
    useSaveState.setState({ leaving: true })
    flush()
      .then(() => {
        // `leaving` fica ligado: a troca de rota é uma transição, e até ela chegar `RouteSync` não pode
        // achar que a tela continua aqui. Quem desliga é a próxima abertura.
        if (current) proceed()
      })
      .catch(() => {
        if (current) setFailed(true)
      })
    return () => {
      current = false
    }
  }, [blocked, flush, proceed])

  return (
    <ConfirmDialog
      open={failed}
      onOpenChange={(open) => {
        if (open) return
        setFailed(false)
        useSaveState.setState({ leaving: false })
        reset()
      }}
      onConfirmed={() => {
        setFailed(false)
        proceed()
      }}
      destructive
      title={t("campaignsWizard.save.leaveTitle")}
      description={t("campaignsWizard.save.leaveHint")}
      confirmLabel={t("campaignsWizard.save.leave")}
      cancelLabel={t("campaignsWizard.save.stay")}
    />
  )
}

/**
 * Leva a URL de `new` para `edit` assim que o rascunho existir, para recarregar a página não perder nada.
 * Espera a fila de salvar acalmar: com a guarda ligada, a troca de endereço viraria uma pergunta de sair.
 * Fica depois de `LeaveGuard`: quando este efeito roda, a guarda daquele já desligou.
 */
function RouteSync() {
  const navigate = useNavigate()
  const { campaignId } = useDraft()
  const status = useSaveState((state) => state.status)
  const leaving = useSaveState((state) => state.leaving)
  // Quem está saindo vai para onde pediu: trocar o endereço agora tomaria o lugar da saída que espera.
  const calm = (status === "saved" || status === "idle") && !leaving

  useEffect(() => {
    if (!campaignId || !calm) return

    const target = `/campaigns/${campaignId}/edit`
    if (window.location.pathname === target) return

    const query = new URLSearchParams(window.location.search)
    query.delete("duplicate")
    query.delete(LINKED_EXTRACTION_PARAM)
    const search = query.toString()
    navigate(`${target}${search ? `?${search}` : ""}`, { replace: true })
  }, [calm, campaignId, navigate])

  return null
}

/**
 * O erro some assim que a pessoa corrige. O formulário não é enviado de uma vez (cada passo cobra o seu),
 * então o `reValidateMode` do react-hook-form nunca entra em cena: quem revalida é este. Só escuta enquanto
 * há erro na tela, e só confere o que estava errado, para não acusar o que ela ainda nem preencheu.
 */
function ErrorSync() {
  const form = useFormContext<WizardValues>()
  const { errors } = useFormState({ control: form.control })
  const names = Object.keys(errors).join(",")

  useEffect(() => {
    if (!names) return

    return form.subscribe({
      formState: { values: true },
      callback: () => void form.trigger(names.split(",") as (keyof WizardValues)[]),
    })
  }, [form, names])

  return null
}

/* ---------- passos ---------- */

/** O que já está de pé. O visto de um passo diz que ele está pronto, não que a pessoa passou por ali. */
function useStepsDone(): Record<WizardStep, boolean> {
  const { control } = useFormContext<WizardValues>()
  const { campaignId } = useDraft()
  const { summary } = useRecipientSummary(campaignId)
  const [mode, connectorIds, phoneNumberIds, messageType, messages, attachmentId, templateIds] = useWatch({
    control,
    name: ["campaignMode", "connectorIds", "phoneNumberIds", "messageType", "messages", "attachmentId", "templateIds"],
  })

  const hasMessage =
    mode === "template"
      ? phoneNumberIds.length > 0 && templateIds.length > 0
      : connectorIds.length > 0 &&
        (messageType === "media" ? Boolean(attachmentId) : filledMessages({ messages }).length > 0)

  return { audience: summary.total > 0, message: hasMessage, schedule: true, review: false }
}

function WizardStepper() {
  const { t } = useTranslation()
  const { step, goTo } = useWizardNav()
  const finished = useStepsDone()
  const current = WIZARD_STEPS.indexOf(step)

  return (
    <nav aria-label={t("campaignsWizard.steps.label")}>
      <ol className="flex items-center gap-1 sm:gap-2">
        {WIZARD_STEPS.map((key, index) => {
          const active = index === current
          const done = !active && index < current && finished[key]

          return (
            <li key={key} className={cn("flex min-w-0 items-center gap-1 sm:gap-2", index < WIZARD_STEPS.length - 1 && "flex-1")}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => goTo(key)}
                className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg pr-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-foreground/80 text-background"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "truncate",
                    active ? "font-medium" : "text-muted-foreground max-sm:sr-only"
                  )}
                >
                  {t(`campaignsWizard.steps.${key}.label`)}
                </span>
              </button>
              {index < WIZARD_STEPS.length - 1 ? (
                <span aria-hidden className="h-px min-w-3 flex-1 bg-border" />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function StepContent() {
  const { step } = useWizardNav()
  const preset = useMotionPreset()
  const [shown, setShown] = useState({ step, direction: 1 })

  // Para a frente entra pela direita, para trás pela esquerda: é o que dá a sensação de caminho.
  if (shown.step !== step) {
    setShown({ step, direction: WIZARD_STEPS.indexOf(step) >= WIZARD_STEPS.indexOf(shown.step) ? 1 : -1 })
  }
  const { direction } = shown

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={step}
        initial={preset.reduced ? { opacity: 0 } : { opacity: 0, x: 12 * direction }}
        animate={{ opacity: 1, x: 0 }}
        exit={preset.reduced ? { opacity: 0 } : { opacity: 0, x: -12 * direction }}
        transition={preset.reduced ? { duration: 0.1 } : preset.springSoft}
      >
        {step === "audience" ? <StepAudience /> : null}
        {step === "message" ? <StepMessage /> : null}
        {step === "schedule" ? <StepSchedule /> : null}
        {step === "review" ? <StepReview /> : null}
      </motion.div>
    </AnimatePresence>
  )
}

/* ---------- lançar ---------- */

function useLaunch() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const form = useFormContext<WizardValues>()
  const { campaignId, flush, finish } = useDraft()
  const { goTo } = useWizardNav()
  const { summary } = useRecipientSummary(campaignId)
  const [busy, setBusy] = useState(false)

  return {
    busy,
    launch: useCallback(async () => {
      if (busy) return

      const valid = await form.trigger()
      if (!valid) {
        const first = Object.keys(form.formState.errors)[0]
        goTo(first ? stepOfField(first) : "message")
        toast.error(t("campaignsWizard.review.fixFirst"))
        return
      }
      if (!campaignId || summary.total === 0) {
        goTo("audience")
        toast.error(t("campaignsWizard.errors.audienceRequired"))
        return
      }

      setBusy(true)
      try {
        await flush()
      } catch {
        toast.error(t("campaignsWizard.save.failed"))
        setBusy(false)
        return
      }

      const values = form.getValues()
      const formatted = formatNumber(summary.total, language)
      const later = values.sendMode === "later" && values.scheduledAt
      const problems = variableProblems(
        values.campaignMode === "template"
          ? Object.values(values.templateParams).flatMap((params) => Object.values(params))
          : filledMessages(values),
        summary.variables,
        summary.total
      )
      const warning =
        problems.length > 0
          ? t("campaignsWizard.confirm.variables", {
              tokens: problems.map((problem) => asToken(problem.token)).join(", "),
            })
          : null

      let warnings: LaunchResponse["warnings"] = []
      const confirmed = await confirm({
        title: later
          ? t("campaignsWizard.confirm.scheduleTitle")
          : t("campaignsWizard.confirm.launchTitle", { count: summary.total, formatted }),
        description: (
          <>
            {later && values.scheduledAt
              ? t("campaignsWizard.confirm.scheduleHint", {
                  count: summary.total,
                  formatted,
                  date: formatFullDateTime(values.scheduledAt, language),
                })
              : t("campaignsWizard.confirm.launchHint")}
            {warning ? <span className="mt-2 block font-medium text-status-warning">{warning}</span> : null}
          </>
        ),
        confirmLabel: later
          ? t("campaignsWizard.actions.schedule")
          : t("campaignsWizard.actions.launch", { count: summary.total, formatted }),
        onConfirm: async () => {
          if (later && values.scheduledAt) {
            await apiPost<CampaignResponse>(`/campaigns/${campaignId}/schedule`, {
              scheduledAt: values.scheduledAt.getTime(),
            })
          } else {
            const response = await apiPost<LaunchResponse>(`/campaigns/${campaignId}/launch`)
            warnings = response.warnings
          }
        },
      })

      setBusy(false)
      if (!confirmed) return

      finish()
      writeSavedSchedule(campaignId, null)
      void reloadCampaignLists()

      for (const warning of warnings) toast.warning(warning.message)
      toast.success(
        later ? t("campaignsWizard.confirm.scheduled") : t("campaignsWizard.confirm.launched"),
        { description: t("campaignsWizard.confirm.follow") }
      )
      // O formulário não existe mais como rascunho: o monitor é quem acompanha daqui para frente.
      navigate(`/campaigns/${campaignId}`, { replace: true })
    }, [busy, campaignId, confirm, finish, flush, form, goTo, language, navigate, summary, t]),
  }
}

function ActionBar() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const { step, goTo, onAudienceEmpty } = useWizardNav()
  const { campaignId, flush } = useDraft()
  const { summary } = useRecipientSummary(campaignId)
  const form = useFormContext<WizardValues>()
  const { launch, busy } = useLaunch()
  const sendMode = useWatch({ control: form.control, name: "sendMode" })
  const scheduledAt = useWatch({ control: form.control, name: "scheduledAt" })
  const { isMobileShell } = useMobileShell()

  const index = WIZARD_STEPS.indexOf(step)
  const last = index === WIZARD_STEPS.length - 1
  const later = sendMode === "later" && scheduledAt

  async function next() {
    if (step === "audience" && summary.total === 0) {
      onAudienceEmpty()
      return
    }

    const valid = await form.trigger(STEP_FIELDS[step])
    if (!valid) {
      // O erro está logo ali, no campo: leva a pessoa até ele.
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[role="alert"]')?.scrollIntoView({ block: "center", behavior: "smooth" })
      })
      return
    }
    goTo(WIZARD_STEPS[index + 1])
  }

  async function exit() {
    try {
      await flush()
      if (campaignId) toast.success(t("campaignsWizard.save.exited"))
    } catch {
      // A guarda pergunta, na navegação.
    }
    navigate("/campaigns")
  }

  return (
    <div
      className="sticky z-10 mt-auto border-t bg-background/95 pb-safe backdrop-blur"
      style={{ bottom: "var(--kb-inset, 0px)" }}
    >
      <div className="mr-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 md:px-6">
        {index > 0 ? (
          <Button
            type="button"
            variant="ghost"
            className="pointer-coarse:h-10"
            onClick={() => goTo(WIZARD_STEPS[index - 1])}
          >
            <ArrowLeft />
            <span className="max-sm:sr-only">{t("campaignsWizard.actions.back")}</span>
          </Button>
        ) : (
          <Button type="button" variant="ghost" className="pointer-coarse:h-10" onClick={() => void exit()}>
            {t("campaignsWizard.actions.exit")}
          </Button>
        )}

        {isMobileShell ? null : <SaveIndicator className="ml-2 min-w-0" />}

        <div className="ml-auto flex min-w-0 flex-1 justify-end">
          {last ? (
            <Button
              type="button"
              disabled={busy}
              className="h-10 max-w-full max-sm:flex-1"
              onClick={() => void launch()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Rocket />}
              <span className="truncate">
                {later
                  ? t("campaignsWizard.actions.schedule")
                  : t("campaignsWizard.actions.launch", {
                      count: summary.total,
                      formatted: formatNumber(summary.total, language),
                    })}
              </span>
            </Button>
          ) : (
            <Button type="button" className="h-10 max-sm:flex-1" onClick={() => void next()}>
              {t("campaignsWizard.actions.continue")}
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- cabeçalho ---------- */

function useDiscard() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { campaignId, finish } = useDraft()

  return useCallback(async () => {
    if (!campaignId) {
      navigate("/campaigns")
      return
    }

    const confirmed = await confirm({
      title: t("campaignsWizard.discard.title"),
      description: t("campaignsWizard.discard.hint"),
      confirmLabel: t("campaignsWizard.discard.confirm"),
      destructive: true,
      onConfirm: async () => {
        finish()
        await apiDelete(`/campaigns/${campaignId}`)
      },
    })
    if (!confirmed) return

    writeSavedSchedule(campaignId, null)
    void reloadCampaignLists()
    toast.success(t("campaignsWizard.discard.done"))
    navigate("/campaigns", { replace: true })
  }, [campaignId, confirm, finish, navigate, t])
}

/** No computador, na barra superior da casca. */
function HeaderActions() {
  const { t } = useTranslation()
  const { campaignId } = useDraft()
  const discard = useDiscard()

  useHeaderSlot(
    campaignId ? (
      <ActionsMenu
        label={t("campaignsWizard.actions.more")}
        actions={[
          {
            label: t("campaignsWizard.discard.action"),
            icon: <Trash2 />,
            destructive: true,
            onSelect: () => void discard(),
          },
        ]}
      />
    ) : null,
    { mobilePlacement: "hidden" }
  )
  return null
}

/** No celular a casca sai de cena: a tarefa é uma só, com um passo por tela. */
function MobileHeader() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step } = useWizardNav()
  const { campaignId, flush } = useDraft()
  const discard = useDiscard()
  const index = WIZARD_STEPS.indexOf(step)

  async function exit() {
    try {
      await flush()
      if (campaignId) toast.success(t("campaignsWizard.save.exited"))
    } catch {
      // A guarda pergunta, na navegação.
    }
    navigate("/campaigns")
  }

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 pt-safe backdrop-blur">
      <div className="flex items-center gap-1 px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label={t("campaignsWizard.actions.exit")}
          onClick={() => void exit()}
        >
          <X />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">{t(`campaignsWizard.steps.${step}.label`)}</h1>
          <SaveIndicator className="-mt-0.5" />
        </div>
        <span className="px-1 text-xs text-muted-foreground tabular-nums">
          {t("campaignsWizard.steps.progress", { current: index + 1, total: WIZARD_STEPS.length })}
        </span>
        {campaignId ? (
          <ActionsMenu
            label={t("campaignsWizard.actions.more")}
            className="size-10"
            actions={[
              {
                label: t("campaignsWizard.discard.action"),
                icon: <Trash2 />,
                destructive: true,
                onSelect: () => void discard(),
              },
            ]}
          />
        ) : null}
      </div>
      <div
        className="flex gap-1 px-3 pb-2"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={WIZARD_STEPS.length}
        aria-valuenow={index + 1}
        aria-label={t("campaignsWizard.steps.label")}
      >
        {WIZARD_STEPS.map((key, position) => (
          <span
            key={key}
            className={cn("h-1 flex-1 rounded-full transition-colors", position <= index ? "bg-primary" : "bg-muted")}
          />
        ))}
      </div>
    </div>
  )
}

/* ---------- regras dos modelos ---------- */

/**
 * O schema precisa saber o que os modelos escolhidos pedem, e isso vem da API. A primeira lacuna, vazia, o
 * servidor preenche com o nome: é a única que pode ficar sem valor.
 */
function TemplateRulesBridge({ rules }: { rules: React.RefObject<TemplateParamRule[]> }) {
  const { control } = useFormContext<WizardValues>()
  const mode = useWatch({ control, name: "campaignMode" })
  const wabaConnectorId = useWatch({ control, name: "wabaConnectorId" })
  const templateIds = useWatch({ control, name: "templateIds" })
  const { templates } = useConnectorTemplates(mode === "template" ? wabaConnectorId : null)

  const next = useMemo(
    () =>
      (templates ?? [])
        .filter((template) => templateIds.includes(template.id) && templateFitsCampaign(template))
        .flatMap((template) =>
          templatePositions(template)
            .filter((position) => position !== "1")
            .map((position) => ({ templateId: template.id, position }))
        ),
    [templateIds, templates]
  )

  useLayoutEffect(() => {
    rules.current = next
  }, [next, rules])

  return null
}

/** Guarda a data escolhida no aparelho: a API só a recebe na hora de agendar. */
function ScheduleKeeper() {
  const { campaignId } = useDraft()
  const { control } = useFormContext<WizardValues>()
  const sendMode = useWatch({ control, name: "sendMode" })
  const scheduledAt = useWatch({ control, name: "scheduledAt" })

  useEffect(() => {
    if (campaignId) writeSavedSchedule(campaignId, sendMode === "later" ? scheduledAt : null)
  }, [campaignId, scheduledAt, sendMode])

  return null
}

/* ---------- o assistente ---------- */

export type CampaignWizardProps = {
  /** O rascunho a retomar. */
  campaign: Campaign | null
  /** A campanha a copiar. Vem a configuração, e o público é escolhido de novo. */
  copyFrom: Campaign | null
  /** A busca de estabelecimentos que veio na URL. O passo "Para quem" abre nela. */
  placeExtractionId: string | null
  onDraftCreated: (id: string) => void
}

/** Em que passo reabrir: o primeiro que ainda falta, e a revisão quando já está tudo lá. */
function resumeStep(campaign: Campaign): WizardStep {
  if (campaign.totalContacts === 0) return "audience"

  const hasMessage =
    campaign.campaignMode === "template"
      ? campaign.templateIds.length > 0
      : campaign.messageType === "media"
        ? Boolean(campaign.attachmentId)
        : campaign.messages.some((message) => message.trim())
  return hasMessage ? "review" : "message"
}

export function CampaignWizard({ campaign, copyFrom, placeExtractionId, onDraftCreated }: CampaignWizardProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { scroller } = useShell()
  const { isMobileShell } = useMobileShell()
  const [params, setParams] = useSearchParams()

  useImmersive(isMobileShell)

  const [fallbackName] = useState(() =>
    t("campaignsWizard.defaultName", {
      date: new Intl.DateTimeFormat(language, { day: "numeric", month: "long" }).format(new Date()),
    })
  )
  const [initialValues] = useState<WizardValues>(() => {
    if (campaign) {
      const saved = readSavedSchedule(campaign.id)
      return {
        ...valuesFromCampaign(campaign),
        ...(saved ? { sendMode: "later" as const, scheduledAt: saved } : {}),
      }
    }
    if (copyFrom) return valuesFromCampaign(copyFrom, t("campaignsWizard.copyName", { name: copyFrom.name }))
    return defaultValues(fallbackName)
  })
  const [initialSaved] = useState(() => (campaign ? toDraftPayload(initialValues, fallbackName) : null))

  const rules = useRef<TemplateParamRule[]>([])
  const schema = useMemo(() => buildWizardSchema(t, () => rules.current), [t])

  const form = useForm<WizardValues>({
    resolver: zodResolver(schema) as unknown as Resolver<WizardValues>,
    defaultValues: initialValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
  })

  const stepParam = params.get("step")
  const step: WizardStep = isWizardStep(stepParam)
    ? stepParam
    : campaign
      ? resumeStep(campaign)
      : "audience"

  const [audienceError, setAudienceError] = useState(false)
  const [linkedExtractionId, setLinkedExtractionId] = useState(placeExtractionId)

  const goTo = useCallback(
    (next: WizardStep) => {
      setAudienceError(false)
      setLinkedExtractionId(null)
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          updated.set("step", next)
          updated.delete(LINKED_EXTRACTION_PARAM)
          return updated
        },
        // É o que faz o voltar do aparelho andar entre os passos, em vez de sair da tela.
        { replace: false }
      )
    },
    [setParams]
  )

  // Resolvida, a busca sai da URL: recarregar não abre o painel de novo, nem repete um aviso já visto.
  const settleLinkedExtraction = useCallback(() => {
    setLinkedExtractionId(null)
    // Se o rascunho já nasceu, `RouteSync` já tirou.
    if (!new URLSearchParams(window.location.search).has(LINKED_EXTRACTION_PARAM)) return

    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.delete(LINKED_EXTRACTION_PARAM)
        return updated
      },
      { replace: true }
    )
  }, [setParams])

  // A barra de ações fica presa embaixo: quem anda com Tab não pode acabar com o campo atrás dela.
  useEffect(() => {
    if (!scroller) return
    scroller.style.scrollPaddingBottom = "6rem"
    return () => {
      scroller.style.scrollPaddingBottom = ""
    }
  }, [scroller])

  // Cada passo abre do topo, e o foco vai junto para o título, para o leitor de tela anunciar.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    scroller?.scrollTo({ top: 0 })
    const timer = window.setTimeout(() => {
      document.getElementById(`wizard-step-${step}`)?.focus({ preventScroll: true })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [scroller, step])

  const nav = useMemo(
    () => ({
      step,
      goTo,
      audienceError,
      onAudienceEmpty: () => setAudienceError(true),
      linkedExtractionId,
      settleLinkedExtraction,
    }),
    [audienceError, goTo, linkedExtractionId, settleLinkedExtraction, step]
  )

  usePageTitle(campaign?.name ?? t("navigation.routes.campaignNew"), {
    backTo: "/campaigns",
    parentTitle: t("navigation.campaigns"),
  })

  return (
    <FormProvider {...form}>
      <DraftProvider
        form={form}
        campaignId={campaign?.id ?? null}
        initialSaved={initialSaved}
        initialValues={initialValues}
        fallbackName={fallbackName}
        onCreated={onDraftCreated}
      >
        <WizardNavContext.Provider value={nav}>
          <LeaveGuard />
          <RouteSync />
          <ErrorSync />
          <TemplateRulesBridge rules={rules} />
          <ScheduleKeeper />

          <div className="flex min-h-full flex-col">
            {isMobileShell ? <MobileHeader /> : <HeaderActions />}

            <div
              data-slot="page-body"
              className="relative mr-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-4 pb-8 md:px-6 lg:pt-6"
            >
              {isMobileShell ? null : <WizardStepper />}
              <StepContent />
            </div>

            <ActionBar />
          </div>
        </WizardNavContext.Provider>
      </DraftProvider>
    </FormProvider>
  )
}
