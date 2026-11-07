import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormProvider, useFieldArray, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router"
import { Code2, Globe, History, Loader2, Pencil, Plus, Send, Tag, Trash2, Undo2, Unplug } from "lucide-react"
import { toast } from "sonner"

import { ReceivedFieldsContext } from "@/components/webhooks/fields-context"
import { ReceivedFields } from "@/components/webhooks/received-fields"
import { CodeAction, ContactAction, HttpAction, UserFieldAction } from "@/components/webhooks/simple-actions"
import { StartFlowAction } from "@/components/webhooks/start-flow-action"
import { WebhookAlertNotice } from "@/components/webhooks/webhook-alert"
import { WebhookNameDialog } from "@/components/webhooks/webhook-name-dialog"
import { WebhookSignature } from "@/components/webhooks/webhook-signature"
import { WebhookTest } from "@/components/webhooks/webhook-test"
import { WebhookDetailSkeleton } from "@/components/webhooks/webhooks-skeletons"
import {
  ActionsMenu,
  Callout,
  CopyButton,
  EmptyState,
  ErrorState,
  FormError,
  PageBody,
  PageHeader,
  RelativeTime,
  SegmentedControl,
  SettingsSection,
  UnsavedChangesDialog,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useOpenCount } from "@/hooks/use-panel-session"
import { useWebhook, useWebhookAlerts, useWebhookMutations } from "@/hooks/webhooks/use-webhooks"
import { ApiError } from "@/lib/api"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { groupReceivedFields } from "@/lib/webhooks/fields"
import { buildFormSchema, newAction, runOrder, toFormValues, toPayload, type WebhookFormValues } from "@/lib/webhooks/form"
import { LITERAL } from "@/lib/webhooks/literal"
import { webhookAddress } from "@/lib/webhooks/send-test"
import { ACTION_TYPES, WEBHOOK_STATUSES, type HookActionType, type Webhook, type WebhookStatus } from "@/lib/webhooks/types"

// Um webhook, na ordem em que a pessoa precisa: em que modo ele está, para onde o outro sistema manda, o que fazer quando
// chegar e, por último, a proteção. O modo e a assinatura valem na hora; as ações, ao salvar.

const LIST_PATH = "/settings/webhooks"

export default function WebhookPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { webhookId } = useParams()
  const { webhook, error, isLoading, reload } = useWebhook(webhookId)

  if (!webhook) {
    return (
      <PageBody>
        <PageHeader backTo={LIST_PATH} parentTitle={t("navigation.webhooks")} />
        {isLoading ? (
          <WebhookDetailSkeleton />
        ) : error instanceof ApiError && error.status === 404 ? (
          <EmptyState
            icon={<Unplug className="size-5" />}
            title={t("webhooks.detail.notFoundTitle")}
            description={t("webhooks.detail.notFoundDescription")}
            action={{ label: t("webhooks.detail.backToList"), onClick: () => navigate(LIST_PATH) }}
          />
        ) : (
          <ErrorState error={error} onRetry={() => void reload()} />
        )}
      </PageBody>
    )
  }

  return <WebhookDetail key={webhook.id} webhook={webhook} reload={() => void reload()} />
}

function WebhookDetail({ webhook, reload }: { webhook: Webhook; reload: () => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const alerts = useWebhookAlerts()
  const { updateWebhook, renameWebhook, setStatus, deleteWebhook } = useWebhookMutations()

  const [renaming, setRenaming] = useState(false)
  const renameKey = useOpenCount(renaming)
  const [switching, setSwitching] = useState(false)

  const active = webhook.status === "active"
  const schema = useMemo(() => buildFormSchema(t, active), [active, t])
  const form = useForm<WebhookFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(webhook),
    mode: "onBlur",
  })
  const { control, formState } = form
  const { isDirty, isSubmitting } = formState
  const { fields, append, remove, insert } = useFieldArray({ control, name: "actions", keyName: "fieldKey" })

  const groups = useMemo(() => groupReceivedFields(webhook.receivedPayload), [webhook.receivedPayload])
  const address = webhookAddress(webhook.url)

  const submit = useFormSubmit(form, async (values) => {
    const updated = await updateWebhook(webhook.id, toPayload(values))
    form.reset(toFormValues(updated))
    toast.success(t("webhooks.form.saved"))
  })

  // Ctrl+S salva, de dentro do código também: o Monaco não usa esse atalho.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (form.formState.isDirty) void submit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [form, submit])

  const changeMode = async (next: WebhookStatus) => {
    if (next === webhook.status || switching) return
    const contact = form.getValues("actions").find((action) => action.type === ACTION_TYPES.contact)
    if (next === "active" && !contact?.config.contactIdentifier.trim()) {
      toast.error(t("webhooks.mode.needsContact"))
      return
    }
    // Ativar com alteração por salvar rodaria as ações antigas: melhor dizer.
    if (next === "active" && isDirty) {
      toast.error(t("webhooks.mode.saveFirst"))
      return
    }
    setSwitching(true)
    try {
      await setStatus(webhook.id, next)
      toast.success(t(`webhooks.mode.changed.${next}`))
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("webhooks.common.actionFailed"))
    } finally {
      setSwitching(false)
    }
  }

  const addAction = (type: HookActionType, config = {}) => append(newAction(type, config))

  // Tirar da lista não apaga nada ainda: vale ao salvar, e o aviso oferece desfazer.
  const removeAction = (index: number) => {
    const action = form.getValues(`actions.${index}`)
    remove(index)
    if (action.actionId) {
      form.setValue("removedIds", [...form.getValues("removedIds"), action.actionId], { shouldDirty: true })
    }
    toast(t("webhooks.form.actionRemoved"), {
      action: {
        label: t("webhooks.form.undo"),
        onClick: () => {
          insert(Math.min(index, form.getValues("actions").length), action)
          if (action.actionId) {
            form.setValue(
              "removedIds",
              form.getValues("removedIds").filter((id) => id !== action.actionId),
              { shouldDirty: true }
            )
          }
        },
      },
    })
  }

  const destroy = async () => {
    const confirmed = await confirm({
      title: t("webhooks.delete.title", { name: webhook.name }),
      description: t("webhooks.delete.description"),
      confirmLabel: t("webhooks.delete.action"),
      destructive: true,
      onConfirm: async () => {
        await deleteWebhook(webhook.id)
        form.reset(form.getValues())
      },
    })
    if (confirmed) {
      toast.success(t("webhooks.delete.done", { name: webhook.name }))
      navigate(LIST_PATH)
    }
  }

  const ordered = useMemo(() => runOrder(fields.map((field, index) => ({ ...field, index }))), [fields])
  const ownAlerts = alerts.byWebhook.get(webhook.id) ?? []
  const logsPath = `/settings/webhooks/logs?webhook=${webhook.id}`

  return (
    <PageBody>
      <PageHeader
        title={webhook.name}
        backTo={LIST_PATH}
        parentTitle={t("navigation.webhooks")}
        mobilePlacement="inline"
        actions={
          <div className="flex items-center gap-1.5">
            {isDirty ? (
              <Button type="button" variant="ghost" size="sm" className="pointer-coarse:h-10" onClick={() => form.reset()}>
                <Undo2 />
                <span className="max-md:sr-only">{t("webhooks.form.discard")}</span>
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={!isDirty || isSubmitting} className="pointer-coarse:h-10" onClick={() => void submit()}>
              {isSubmitting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              <span className="max-md:hidden">{t("webhooks.form.save")}</span>
              <span className="md:hidden">{t("webhooks.form.saveShort")}</span>
            </Button>
            <ActionsMenu
              className="pointer-coarse:size-10"
              label={t("webhooks.detail.moreActions")}
              actions={[
                { label: t("webhooks.detail.rename"), icon: <Pencil />, onSelect: () => setRenaming(true) },
                { label: t("webhooks.list.logs"), icon: <History />, onSelect: () => navigate(logsPath) },
                { label: t("webhooks.delete.action"), icon: <Trash2 />, destructive: true, separatorBefore: true, onSelect: () => void destroy() },
              ]}
            />
          </div>
        }
      />

      {ownAlerts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {ownAlerts.map((alert) => (
            <WebhookAlertNotice key={alert.id} alert={alert} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        <SettingsSection title={t("webhooks.mode.title")} description={t("webhooks.mode.description")}>
          <div className="flex flex-col gap-2">
            <SegmentedControl
              aria-label={t("webhooks.mode.title")}
              value={webhook.status}
              onChange={(next) => void changeMode(next)}
              options={WEBHOOK_STATUSES.map((status) => ({ value: status, label: t(`webhooks.status.${status}`), disabled: switching }))}
            />
            <p className="text-sm text-pretty text-muted-foreground">{t(`webhooks.mode.explain.${webhook.status}`)}</p>
          </div>
        </SettingsSection>

        <SettingsSection title={t("webhooks.entry.title")} description={t("webhooks.entry.description")}>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-1 rounded-lg bg-muted/60 p-2 pl-3">
              <code className="min-w-0 flex-1 py-1 font-mono text-[13px] break-all">{address}</code>
              <CopyButton value={address} label={t("webhooks.entry.copy")} variant="outline" size="sm" className="shrink-0 pointer-coarse:h-10" />
            </div>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>{t("webhooks.list.requests", { count: webhook.totalRequest, formatted: formatNumber(webhook.totalRequest, language) })}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                {t("webhooks.list.createdAt")} <RelativeTime value={webhook.createdAt} />
              </span>
              <span aria-hidden>·</span>
              <Link to={logsPath} className="underline underline-offset-2 hover:text-foreground">
                {t("webhooks.entry.seeLogs")}
              </Link>
            </p>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <LimitFact title={t("webhooks.entry.sizeLimit")} description={t("webhooks.entry.sizeLimitHint")} />
            <LimitFact title={t("webhooks.entry.rateLimit")} description={t("webhooks.entry.rateLimitHint")} />
          </dl>

          <WebhookTest webhook={webhook} onSent={reload} />
        </SettingsSection>

        <FormProvider {...form}>
          <ReceivedFieldsContext.Provider value={groups}>
            <form onSubmit={submit} noValidate>
              {/* A mesma grade de `SettingsSection`, com a lista de campos na coluna da explicação. */}
              <section className="grid gap-4 border-t pt-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-10 md:pt-8">
                <div className="flex min-w-0 flex-col gap-4 md:sticky md:top-4 md:self-start">
                  <div className="space-y-1">
                    <h2 className="font-heading text-base leading-snug font-medium">{t("webhooks.form.title")}</h2>
                    <p className="text-sm text-pretty text-muted-foreground">{t("webhooks.form.description", LITERAL)}</p>
                  </div>
                  <ReceivedFields
                    groups={groups}
                    status={webhook.status}
                    onCreateUserField={(key) => {
                      addAction(ACTION_TYPES.userField, { valueTemplate: `{{${key}}}` })
                      toast.success(t("webhooks.fields.userFieldAdded"))
                    }}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                  <FormError form={form} />
                  {webhook.status !== "active" ? <NotRunningNote status={webhook.status} /> : null}

                  {/* Sem animação de saída: um cartão que fica na tela depois de sair da lista continua ligado ao formulário
                      pelo índice antigo, e o react-hook-form recria a ação ali, vazia. */}
                  {ordered.map((action, position) => (
                    <motion.div key={action.fieldKey} initial={preset.listItem.initial} animate={preset.listItem.animate} transition={preset.listItem.transition} className="min-w-0">
                      <ActionByType
                        type={action.type}
                        index={action.index}
                        step={position + 1}
                        control={control}
                        active={active}
                        onRemove={() => removeAction(action.index)}
                      />
                    </motion.div>
                  ))}

                  <AddActions onAdd={(type) => addAction(type)} />
                </div>
              </section>
            </form>
          </ReceivedFieldsContext.Provider>
        </FormProvider>

        <SettingsSection title={t("webhooks.signature.title")} description={t("webhooks.signature.description")}>
          <WebhookSignature webhook={webhook} />
        </SettingsSection>
      </div>

      <WebhookNameDialog
        key={renameKey}
        open={renaming}
        onOpenChange={setRenaming}
        title={t("webhooks.detail.renameTitle")}
        submitLabel={t("webhooks.detail.renameAction")}
        initialName={webhook.name}
        onSubmit={async (name) => {
          await renameWebhook(webhook.id, name)
          toast.success(t("webhooks.detail.renamed"))
        }}
      />

      <UnsavedChangesDialog when={isDirty} />
    </PageBody>
  )
}

function LimitFact({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-sm font-medium">{title}</dt>
      <dd className="text-xs text-pretty text-muted-foreground">{description}</dd>
    </div>
  )
}

function NotRunningNote({ status }: { status: WebhookStatus }) {
  const { t } = useTranslation()
  return <Callout>{t(`webhooks.form.notRunning.${status}`)}</Callout>
}

function ActionByType({
  type,
  index,
  step,
  control,
  active,
  onRemove,
}: {
  type: HookActionType
  index: number
  step: number
  control: ReturnType<typeof useForm<WebhookFormValues>>["control"]
  active: boolean
  onRemove: () => void
}) {
  switch (type) {
    case ACTION_TYPES.contact:
      return <ContactAction control={control} index={index} step={step} active={active} />
    case ACTION_TYPES.startFlow:
      return <StartFlowAction control={control} index={index} step={step} onRemove={onRemove} />
    case ACTION_TYPES.userField:
      return <UserFieldAction control={control} index={index} step={step} onRemove={onRemove} />
    case ACTION_TYPES.code:
      return <CodeAction control={control} index={index} step={step} onRemove={onRemove} />
    case ACTION_TYPES.http:
      return <HttpAction control={control} index={index} step={step} onRemove={onRemove} />
    default:
      return null
  }
}

const ADDABLE = [
  { type: ACTION_TYPES.startFlow, key: "startFlow", icon: Send },
  { type: ACTION_TYPES.userField, key: "userField", icon: Tag },
  { type: ACTION_TYPES.http, key: "http", icon: Globe },
  { type: ACTION_TYPES.code, key: "code", icon: Code2 },
] as const

/** À vista, e não num menu: a lista também ensina o que dá para fazer. */
function AddActions({ onAdd }: { onAdd: (type: HookActionType) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="text-sm font-medium">{t("webhooks.form.addTitle")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ADDABLE.map(({ type, key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onAdd(type)}
            className="flex items-start gap-2.5 rounded-lg border border-dashed p-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-medium">
                {t(`webhooks.actions.${key}.title`)}
                <Plus className="size-3 text-muted-foreground" aria-hidden />
              </span>
              <span className="block text-xs text-pretty text-muted-foreground">{t(`webhooks.actions.${key}.short`)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
