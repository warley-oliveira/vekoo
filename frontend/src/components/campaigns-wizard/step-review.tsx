import { useEffect, useMemo, type ReactNode } from "react"
import { useFormContext, useFormState, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import {
  CalendarClock,
  CircleAlert,
  Coins,
  MessageCircle,
  MessageSquareReply,
  Pencil,
  Send,
  TriangleAlert,
  Users,
} from "lucide-react"

import { Callout, ListSkeleton, TagChip, TextField } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  useCampaignChannels,
  useCampaignFlows,
  useCampaignTags,
  useConnectorTemplates,
  useRecipientSummary,
} from "@/hooks/campaigns-wizard/use-campaign-options"
import { useDraft } from "@/hooks/campaigns-wizard/use-draft"
import { estimateCampaign, timezoneLabel } from "@/lib/campaigns-wizard/estimate"
import { describeDays, describeHours, formatRange } from "@/lib/campaigns-wizard/format"
import { filledMessages, type WizardStep, type WizardValues } from "@/lib/campaigns-wizard/form"
import { MAX_NAME_LENGTH, stepOfField } from "@/lib/campaigns-wizard/schema"
import { asToken, variableProblems } from "@/lib/campaigns-wizard/variables"
import { templateTitle } from "@/lib/chat-details/template-params"
import { formatFullDateTime } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { MessagePreview } from "./message/message-preview"
import { connectorLabel, connectorNumber, wabaNumbers } from "./message/channel-picker"
import { channelCount } from "./wizard-summary"
import { StepHeading, useWizardNav } from "./wizard-nav"

function ReviewRow({
  icon,
  title,
  step,
  children,
}: {
  icon: ReactNode
  title: string
  step?: WizardStep
  children: ReactNode
}) {
  const { t } = useTranslation()
  const { goTo } = useWizardNav()

  return (
    <li className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        <div className="mt-0.5 text-sm text-pretty">{children}</div>
      </div>
      {step ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-2 shrink-0 pointer-coarse:h-10"
          aria-label={t("campaignsWizard.review.editStep", { step: title })}
          onClick={() => goTo(step)}
        >
          <Pencil />
          <span className="max-sm:sr-only">{t("campaignsWizard.review.edit")}</span>
        </Button>
      ) : null}
    </li>
  )
}

type Issue = { key: string; message: string; step: WizardStep }

/** Tudo que precisa ser resolvido antes de lançar, com o caminho até lá. */
function useBlockingIssues(total: number, loading: boolean): Issue[] {
  const { t } = useTranslation()
  const { errors } = useFormState<WizardValues>()

  return useMemo(() => {
    const list: Issue[] = []
    if (!loading && total === 0) {
      list.push({
        key: "audience",
        message: t("campaignsWizard.errors.audienceRequired"),
        step: "audience",
      })
    }
    for (const [field, error] of Object.entries(errors)) {
      const nested = error as { message?: string; root?: { message?: string } } | undefined
      const message = nested?.root?.message ?? nested?.message
      if (message) list.push({ key: field, message, step: stepOfField(field) })
    }
    return list
  }, [errors, loading, t, total])
}

/** A última conferência, em português: o que vai acontecer, com quem, quando, e o que ainda falta. */
export function StepReview() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { control, trigger } = useFormContext<WizardValues>()
  const { goTo } = useWizardNav()
  const { campaignId } = useDraft()
  const { summary, isLoading } = useRecipientSummary(campaignId)
  const channels = useCampaignChannels()
  const { tags } = useCampaignTags()
  const { flows } = useCampaignFlows()

  const values = useWatch({ control }) as WizardValues
  const { templates } = useConnectorTemplates(values.campaignMode === "template" ? values.wabaConnectorId : null)
  const issues = useBlockingIssues(summary.total, isLoading)

  // Confere tudo ao chegar: aqui é o lugar de dizer o que falta. Só uma vez, para não brigar com a digitação.
  useEffect(() => {
    void trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isTemplate = values.campaignMode === "template"
  const texts = filledMessages(values)
  const selectedTemplates = (templates ?? []).filter((template) => values.templateIds.includes(template.id))

  const webConnectors = channels.web.filter((item) => values.connectorIds.includes(item.id))
  const disconnected = webConnectors.filter((item) => !item.active)
  const waba = channels.waba.find((item) => item.id === values.wabaConnectorId) ?? null
  const wabaPhones = waba
    ? wabaNumbers(waba).filter((number) => values.phoneNumberIds.includes(number.id))
    : []

  const senders = isTemplate
    ? wabaPhones.map((number) => number.displayPhoneNumber).filter(Boolean)
    : webConnectors.filter((item) => item.active).map((item) => {
        const number = connectorNumber(item)
        return number ? `${connectorLabel(item)} (${number})` : connectorLabel(item)
      })

  const problems = variableProblems(
    isTemplate ? Object.values(values.templateParams).flatMap((params) => Object.values(params)) : texts,
    summary.variables,
    summary.total
  )

  const later = values.sendMode === "later" && values.scheduledAt
  const estimate = estimateCampaign({
    total: summary.total,
    channels: Math.max(channelCount(values), 1),
    sendWindowStart: values.sendWindowStart,
    sendWindowEnd: values.sendWindowEnd,
    sendDays: values.sendDays,
    intervalMin: values.intervalMin,
    intervalMax: values.intervalMax,
    dailyLimitPerConnector: values.dailyLimitPerConnector || 1,
    timezone: values.timezone,
    startAt: later && values.scheduledAt ? values.scheduledAt.getTime() : Date.now(),
  })

  const flowName = flows?.find((flow) => flow.id === values.flowId)?.name
  const chosenTags = (tags ?? []).filter((tag) => values.chatTagIds.includes(tag.id))
  const { total } = summary
  const formatted = formatNumber(total, language)

  return (
    <section aria-labelledby="wizard-step-review" className="flex flex-col gap-6">
      <StepHeading
        id="wizard-step-review"
        title={t("campaignsWizard.steps.review.title")}
        hint={t("campaignsWizard.steps.review.hint")}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {issues.length > 0 ? (
            <Callout tone="danger" icon={<CircleAlert />} role="alert" title={t("campaignsWizard.review.missing")}>
              <ul className="mt-1 flex flex-col gap-1">
                {issues.map((issue) => (
                  <li key={issue.key} className="flex flex-wrap items-baseline gap-x-2">
                    <span>{issue.message}</span>
                    <button
                      type="button"
                      className="min-h-8 font-medium underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => goTo(issue.step)}
                    >
                      {t("campaignsWizard.review.fix")}
                    </button>
                  </li>
                ))}
              </ul>
            </Callout>
          ) : null}

          {problems.length > 0 ? (
            <Callout
              tone="warning"
              icon={<TriangleAlert />}
              role="status"
              title={t("campaignsWizard.review.variablesTitle")}
            >
              <ul className="mt-1 flex flex-col gap-0.5">
                {problems.map((problem) => (
                  <li key={problem.token}>
                    {problem.count > 0
                      ? t("campaignsWizard.message.variablePartial", {
                          token: asToken(problem.token),
                          count: formatNumber(problem.count, language),
                          total: formatted,
                        })
                      : t("campaignsWizard.message.variableMissing", { token: asToken(problem.token) })}
                  </li>
                ))}
              </ul>
            </Callout>
          ) : null}

          {disconnected.length > 0 ? (
            <Callout tone="warning" icon={<TriangleAlert />} role="status">
              {t("campaignsWizard.review.disconnected", {
                names: disconnected.map(connectorLabel).join(", "),
              })}
            </Callout>
          ) : null}

          <TextField
            control={control}
            name="name"
            label={t("campaignsWizard.review.name")}
            hint={t("campaignsWizard.review.nameHint")}
            maxLength={MAX_NAME_LENGTH}
          />

          {channels.isLoading ? (
            <ListSkeleton rows={4} />
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border bg-card p-4">
              <ReviewRow icon={<Users />} title={t("campaignsWizard.review.who")} step="audience">
                {total > 0 ? (
                  <>
                    <p className="font-medium">
                      {t("campaignsWizard.audience.total", { count: total, formatted })}
                    </p>
                    <p className="text-muted-foreground">
                      {[
                        summary.fromContacts > 0
                          ? t("campaignsWizard.review.fromContacts", {
                              formatted: formatNumber(summary.fromContacts, language),
                            })
                          : null,
                        summary.imported > 0
                          ? t("campaignsWizard.review.imported", {
                              formatted: formatNumber(summary.imported, language),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">{t("campaignsWizard.review.nobody")}</p>
                )}
              </ReviewRow>

              <ReviewRow icon={<Send />} title={t("campaignsWizard.review.from")} step="message">
                {senders.length > 0 ? (
                  <p>{new Intl.ListFormat(language).format(senders as string[])}</p>
                ) : (
                  <p className="text-muted-foreground">{t("campaignsWizard.review.noChannel")}</p>
                )}
                {senders.length > 1 ? (
                  <p className="text-muted-foreground">{t("campaignsWizard.review.splitChannels")}</p>
                ) : null}
              </ReviewRow>

              <ReviewRow icon={<MessageCircle />} title={t("campaignsWizard.review.what")} step="message">
                {isTemplate ? (
                  selectedTemplates.length > 0 ? (
                    <>
                      <p>
                        {new Intl.ListFormat(language).format(
                          selectedTemplates.map((template) => templateTitle(template.name))
                        )}
                      </p>
                      {selectedTemplates.length > 1 ? (
                        <p className="text-muted-foreground">{t("campaignsWizard.review.rotation")}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground">{t("campaignsWizard.review.noTemplate")}</p>
                  )
                ) : (
                  <>
                    <p>
                      {values.messageType === "media"
                        ? t("campaignsWizard.review.mediaMessage", {
                            name: values.media?.fileName ?? t("campaignsWizard.review.noFile"),
                          })
                        : texts.length > 0
                          ? t("campaignsWizard.review.textMessage", { count: texts.length })
                          : t("campaignsWizard.review.noMessage")}
                    </p>
                    {texts.length > 1 ? (
                      <p className="text-muted-foreground">{t("campaignsWizard.review.rotation")}</p>
                    ) : null}
                  </>
                )}
              </ReviewRow>

              <ReviewRow icon={<MessageSquareReply />} title={t("campaignsWizard.review.replies")} step="message">
                <p>
                  {flowName
                    ? t("campaignsWizard.review.flow", { name: flowName })
                    : t("campaignsWizard.review.noFlow")}
                </p>
                {chosenTags.length > 0 ? (
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    {chosenTags.map((tag) => (
                      <TagChip key={tag.id} color={tag.color}>
                        {tag.name}
                      </TagChip>
                    ))}
                  </p>
                ) : null}
              </ReviewRow>

              <ReviewRow icon={<CalendarClock />} title={t("campaignsWizard.review.when")} step="schedule">
                <p className="font-medium">
                  {later && values.scheduledAt
                    ? t("campaignsWizard.review.scheduledFor", {
                        date: formatFullDateTime(values.scheduledAt, language),
                      })
                    : estimate.waitsForWindow
                      ? t("campaignsWizard.estimate.waits", {
                          date: formatFullDateTime(estimate.firstSendAt, language),
                        })
                      : t("campaignsWizard.review.startsNow")}
                </p>
                <p className="text-muted-foreground">
                  {t("campaignsWizard.review.window", {
                    days: describeDays(values.sendDays, t, language),
                    hours: describeHours(values.sendWindowStart, values.sendWindowEnd, t),
                    timezone: timezoneLabel(values.timezone, language),
                  })}
                </p>
                <p className="text-muted-foreground">
                  {t("campaignsWizard.review.pace", {
                    range: formatRange(values.intervalMin, values.intervalMax, t, language),
                    limit: formatNumber(values.dailyLimitPerConnector || 0, language),
                  })}
                </p>
                {estimate.days !== null ? (
                  <p className="text-muted-foreground">
                    {estimate.hours !== null && estimate.hours < 1
                      ? t("campaignsWizard.review.finishesSoon")
                      : estimate.hours !== null
                        ? t("campaignsWizard.review.finishesHours", { count: Math.ceil(estimate.hours) })
                        : t("campaignsWizard.review.finishesDays", { count: estimate.days })}
                  </p>
                ) : null}
              </ReviewRow>

              <ReviewRow icon={<Coins />} title={t("campaignsWizard.review.cost")}>
                <p>{isTemplate ? t("campaignsWizard.review.costTemplate") : t("campaignsWizard.review.costText")}</p>
              </ReviewRow>
            </ul>
          )}

          <p className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.review.safety")}</p>
        </div>

        <aside className="lg:sticky lg:top-6" aria-label={t("campaignsWizard.preview.title")}>
          <MessagePreview />
        </aside>
      </div>
    </section>
  )
}
