import { useEffect, useMemo, useRef, useState } from "react"
import { useController, useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "motion/react"
import { BookOpen, Eye, ImagePlus, KeyRound, Loader2, Moon, Plus, Sun, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { mutate as globalMutate } from "swr"
import { z } from "zod"

import {
  ColorField,
  CopyButton,
  DetailSkeleton,
  ErrorState,
  NumberField,
  RadioField,
  ResponsiveDialog,
  SelectField,
  TagChip,
  TextField,
  TextareaField,
  UnsavedChangesDialog,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useConnectorActions } from "@/hooks/connectors/use-connector-actions"
import { connectorWidgetKey, storeConnector } from "@/hooks/connectors/use-connectors"
import { useApi } from "@/hooks/use-api"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { apiAssetUrl, apiPatch, apiPost, apiUpload } from "@/lib/api"
import { connectorErrorMessage } from "@/lib/connectors/channels"
import type { WidgetConfig, WidgetConnector } from "@/lib/connectors/types"
import {
  WIDGET_COLOR_FIELDS,
  WIDGET_FONTS,
  WIDGET_PRESETS,
  WIDGET_SWATCHES,
  normalizeOrigin,
  type WidgetPreset,
} from "@/lib/connectors/widget-presets"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { WidgetGuide } from "./widget-guide"
import { WidgetPreview } from "./widget-preview"

const HEX = /^#[0-9A-Fa-f]{6}$/
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

function buildSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  const color = z
    .string()
    .nullable()
    .refine((value) => !value || HEX.test(value), t("connectors.widget.errors.color"))
  const integer = (min: number, max: number) =>
    z
      .number({ error: t("connectors.widget.errors.range", { min, max }) })
      .int(t("connectors.widget.errors.range", { min, max }))
      .min(min, t("connectors.widget.errors.range", { min, max }))
      .max(max, t("connectors.widget.errors.range", { min, max }))
      .nullable()
      .refine((value): boolean => value !== null, t("connectors.widget.errors.range", { min, max }))

  return z
    .object({
      botDisplayName: z.string().max(60, t("connectors.widget.errors.tooLong", { max: 60 })),
      welcomeMessage: z.string().max(240, t("connectors.widget.errors.tooLong", { max: 240 })),
      primaryColor: z
        .string()
        .nullable()
        .refine((value) => Boolean(value && HEX.test(value)), t("connectors.widget.errors.color")),
      position: z.enum(["bottom-right", "bottom-left"]),
      locale: z.string().nullable(),
      preChatFields: z.enum(["off", "name", "name_phone", "name_phone_email"]),
      headerBgColor: color,
      headerTextColor: color,
      userBubbleColor: color,
      userBubbleTextColor: color,
      assistantBubbleColor: color,
      assistantBubbleTextColor: color,
      messageAreaBg: color,
      launcherSize: integer(40, 96),
      bubbleRadius: integer(0, 32),
      panelRadius: integer(8, 32),
      fontFamily: z.string().nullable(),
      customCss: z.string().max(8192, t("connectors.widget.errors.tooLong", { max: 8192 })),
      allowedOrigins: z.array(z.string()),
      rateLimitPerMin: integer(1, 1000),
      dailyMessageCap: integer(0, 1_000_000),
      dailyVisitorCap: integer(0, 1_000_000),
      deliveryMode: z.enum(["rolling", "pinned"]),
      pinnedVersion: z.string().nullable(),
    })
    .superRefine((values, context) => {
      // Fixar sem versão geraria um snippet sem a verificação de integridade.
      if (values.deliveryMode === "pinned" && !values.pinnedVersion) {
        context.addIssue({
          code: "custom",
          path: ["pinnedVersion"],
          message: t("connectors.widget.errors.pinnedVersion"),
        })
      }
    })
}

type WidgetFormValues = z.infer<ReturnType<typeof buildSchema>>

function toValues(widget: WidgetConfig): WidgetFormValues {
  return {
    botDisplayName: widget.botDisplayName ?? "",
    welcomeMessage: widget.welcomeMessage ?? "",
    primaryColor: widget.primaryColor,
    position: widget.position,
    locale: widget.locale,
    preChatFields: widget.preChatFields,
    headerBgColor: widget.headerBgColor,
    headerTextColor: widget.headerTextColor,
    userBubbleColor: widget.userBubbleColor,
    userBubbleTextColor: widget.userBubbleTextColor,
    assistantBubbleColor: widget.assistantBubbleColor,
    assistantBubbleTextColor: widget.assistantBubbleTextColor,
    messageAreaBg: widget.messageAreaBg,
    launcherSize: widget.launcherSize,
    bubbleRadius: widget.bubbleRadius,
    panelRadius: widget.panelRadius,
    fontFamily: widget.fontFamily || "system",
    customCss: widget.customCss ?? "",
    allowedOrigins: widget.allowedOrigins ?? [],
    rateLimitPerMin: widget.rateLimitPerMin,
    dailyMessageCap: widget.dailyMessageCap,
    dailyVisitorCap: widget.dailyVisitorCap,
    deliveryMode: widget.deliveryMode,
    pinnedVersion: widget.pinnedVersion,
  }
}

const TABS = ["appearance", "security", "install"] as const
type Tab = (typeof TABS)[number]

/** A aparência, as regras e a instalação do chat no site. */
export function WidgetSettings({ connector }: { connector: WidgetConnector }) {
  const { t } = useTranslation()
  const key = connectorWidgetKey(connector.id)
  const { data, error, isLoading, mutate } = useApi<{ widget: WidgetConfig }>(key, {
    revalidateOnFocus: false,
  })

  if (isLoading) return <DetailSkeleton rows={6} avatar={false} />
  if (error || !data) {
    return (
      <ErrorState
        error={error}
        title={t("connectors.widget.loadError")}
        onRetry={() => void mutate()}
      />
    )
  }

  return <WidgetForm connector={connector} widget={data.widget} />
}

function WidgetForm({ connector, widget }: { connector: WidgetConnector; widget: WidgetConfig }) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const actions = useConnectorActions()
  const key = connectorWidgetKey(connector.id)
  const [params, setParams] = useSearchParams()
  const requested = params.get("tab") as Tab | null
  const tab: Tab = requested && TABS.includes(requested) ? requested : "appearance"
  const [guideOpen, setGuideOpen] = useState(false)

  const schema = useMemo(() => buildSchema(t), [t])
  const values = useMemo(() => toValues(widget), [widget])

  const form = useForm<WidgetFormValues>({
    resolver: zodResolver(schema),
    defaultValues: values,
    // O que veio do servidor entra, sem atropelar o que a pessoa está digitando.
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  })
  const { isDirty, isSubmitting } = form.formState

  const submit = useFormSubmit(form, async (next) => {
    const { widget: saved } = await apiPatch<{ widget: WidgetConfig }>(
      `/connectors/${connector.id}/widget`,
      {
        ...next,
        // Vazio é "usar o padrão", e o back só aceita cor válida ou nada.
        ...Object.fromEntries(WIDGET_COLOR_FIELDS.map((field) => [field, next[field] || null])),
        fontFamily: next.fontFamily === "system" ? "" : next.fontFamily,
        // Em automática a versão não vale, e texto vazio seria recusado.
        pinnedVersion: next.deliveryMode === "pinned" ? next.pinnedVersion : null,
      }
    )
    await globalMutate(key, { widget: saved }, { revalidate: false })
    storeConnector({
      ...connector,
      name: saved.botDisplayName || connector.name,
      botDisplayName: saved.botDisplayName,
      primaryColor: saved.primaryColor,
      allowedOrigins: saved.allowedOrigins,
    })
    form.reset(toValues(saved))
    toast.success(t("connectors.widget.saved"))
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <UnsavedChangesDialog when={isDirty} />

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl p-4 ring-1 ring-foreground/10 pointer-coarse:min-h-10">
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm font-medium">{t("connectors.widget.activeLabel")}</span>
          <span className="block text-xs leading-snug text-pretty text-muted-foreground">
            {t(connector.active ? "connectors.widget.activeOn" : "connectors.widget.activeOff")}
          </span>
        </span>
        <Switch
          checked={connector.active}
          onCheckedChange={(next) => void actions.setWidgetActive(connector, next)}
        />
      </label>

      <Tabs
        value={tab}
        onValueChange={(value) => setParams({ tab: value as string }, { replace: true })}
        className="gap-5"
      >
        <TabsList className="max-w-full justify-start overflow-x-auto pointer-coarse:h-11">
          {TABS.map((value) => (
            <TabsTrigger key={value} value={value} className="flex-none px-2.5 pointer-coarse:h-10">
              {t(`connectors.widget.tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="appearance">
          <AppearanceTab form={form} connector={connector} widget={widget} onOpenGuide={() => setGuideOpen(true)} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab form={form} />
        </TabsContent>
        <TabsContent value="install">
          <InstallTab form={form} connector={connector} widget={widget} onOpenGuide={() => setGuideOpen(true)} />
        </TabsContent>
      </Tabs>

      <AnimatePresence>
        {isDirty ? (
          <motion.div
            {...preset.slideUp}
            className="sticky bottom-[calc(var(--app-bottom-nav-total,0px)+0.75rem)] z-20 flex flex-col gap-2 rounded-xl bg-popover p-3 shadow-lg ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("connectors.widget.unsaved")}</p>
              {form.formState.errors.root?.message ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.root.message}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="pointer-coarse:h-10 max-sm:flex-1"
                disabled={isSubmitting}
                onClick={() => form.reset(values)}
              >
                {t("connectors.widget.discard")}
              </Button>
              <Button
                type="submit"
                className="pointer-coarse:h-10 max-sm:flex-1"
                aria-busy={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : null}
                {t("connectors.widget.save")}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <WidgetGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </form>
  )
}

type TabProps = { form: UseFormReturn<WidgetFormValues> }

function Group({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 border-t pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-heading text-base font-medium">{title}</h3>
          {description ? (
            <p className="text-sm text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function AppearanceTab({
  form,
  connector,
  widget,
  onOpenGuide,
}: TabProps & { connector: WidgetConnector; widget: WidgetConfig; onOpenGuide: () => void }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [previewOpen, setPreviewOpen] = useState(false)
  const watched = useWatch({ control: form.control })

  const previewValues = {
    ...watched,
    botAvatarUrl: widget.botAvatarUrl,
    launcherImageUrl: widget.launcherImageUrl,
  }

  function applyPreset(preset: WidgetPreset) {
    for (const [field, value] of Object.entries(preset.values)) {
      form.setValue(field as keyof WidgetFormValues, value as never, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="flex flex-col gap-6">
        <Group title={t("connectors.widget.basics.title")} description={t("connectors.widget.basics.description")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="botDisplayName"
              label={t("connectors.widget.basics.name")}
              maxLength={60}
            />
            <ColorField
              control={form.control}
              name="primaryColor"
              label={t("connectors.widget.basics.color")}
              swatches={WIDGET_SWATCHES}
            />
          </div>
          <TextareaField
            control={form.control}
            name="welcomeMessage"
            label={t("connectors.widget.basics.welcome")}
            rows={2}
            maxLength={240}
            showCount
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="position"
              label={t("connectors.widget.basics.position")}
              options={[
                { value: "bottom-right", label: t("connectors.widget.basics.bottomRight") },
                { value: "bottom-left", label: t("connectors.widget.basics.bottomLeft") },
              ]}
            />
            <SelectField
              control={form.control}
              name="locale"
              label={t("connectors.widget.basics.locale")}
              options={[
                { value: "pt-BR", label: t("connectors.widget.basics.localePt") },
                { value: "en-US", label: t("connectors.widget.basics.localeEn") },
              ]}
            />
          </div>
          <SelectField
            control={form.control}
            name="preChatFields"
            label={t("connectors.widget.basics.preChat")}
            hint={t("connectors.widget.basics.preChatHint")}
            options={(["off", "name", "name_phone", "name_phone_email"] as const).map((value) => ({
              value,
              label: t(`connectors.widget.basics.preChatOptions.${value}`),
            }))}
          />
          {isMobile ? (
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-10"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye />
              {t("connectors.widget.preview.show")}
            </Button>
          ) : null}
        </Group>

        <Group title={t("connectors.widget.presets.title")} description={t("connectors.widget.presets.description")}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {WIDGET_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset)}
                className="overflow-hidden rounded-lg text-left ring-1 ring-foreground/10 transition-shadow outline-none hover:ring-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="block h-4" style={{ backgroundColor: preset.values.headerBgColor }} />
                <span
                  className="flex min-h-11 flex-col gap-1 p-1.5"
                  style={{ backgroundColor: preset.values.messageAreaBg }}
                >
                  <span
                    className="h-2.5 w-3/5 rounded-sm"
                    style={{ backgroundColor: preset.values.assistantBubbleColor }}
                  />
                  <span
                    className="h-2.5 w-1/2 self-end rounded-sm"
                    style={{ backgroundColor: preset.values.userBubbleColor }}
                  />
                </span>
                <span className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs font-medium">
                  <span className="truncate">{t(`connectors.widget.presets.${preset.key}`)}</span>
                  {preset.dark ? (
                    <Moon aria-hidden className="size-3 shrink-0" />
                  ) : (
                    <Sun aria-hidden className="size-3 shrink-0" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </Group>

        <Group title={t("connectors.widget.images.title")} description={t("connectors.widget.images.description")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageSlot connector={connector} slot="launcher" url={widget.launcherImageUrl} />
            <ImageSlot connector={connector} slot="avatar" url={widget.botAvatarUrl} />
          </div>
        </Group>

        <Group title={t("connectors.widget.colors.title")} description={t("connectors.widget.colors.description")}>
          <div className="grid gap-4 sm:grid-cols-2">
            {WIDGET_COLOR_FIELDS.map((field) => (
              <ColorField
                key={field}
                control={form.control}
                name={field}
                label={t(`connectors.widget.colors.${field}`)}
                placeholder={t("connectors.widget.colors.default")}
                swatches={WIDGET_SWATCHES}
                action={
                  form.watch(field) ? (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => form.setValue(field, null, { shouldDirty: true })}
                    >
                      {t("connectors.widget.colors.useDefault")}
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        </Group>

        <Group title={t("connectors.widget.shape.title")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              control={form.control}
              name="launcherSize"
              label={t("connectors.widget.shape.launcherSize")}
              hint={t("connectors.widget.shape.range", { min: 40, max: 96 })}
              min={40}
              max={96}
            />
            <NumberField
              control={form.control}
              name="bubbleRadius"
              label={t("connectors.widget.shape.bubbleRadius")}
              hint={t("connectors.widget.shape.range", { min: 0, max: 32 })}
              min={0}
              max={32}
            />
            <NumberField
              control={form.control}
              name="panelRadius"
              label={t("connectors.widget.shape.panelRadius")}
              hint={t("connectors.widget.shape.range", { min: 8, max: 32 })}
              min={8}
              max={32}
            />
          </div>
          <SelectField
            control={form.control}
            name="fontFamily"
            label={t("connectors.widget.shape.font")}
            options={WIDGET_FONTS.map((value) => ({
              value,
              label: t(`connectors.widget.shape.fonts.${value}`),
            }))}
          />
        </Group>

        <Group
          title={t("connectors.widget.css.title")}
          description={t("connectors.widget.css.description")}
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 pointer-coarse:h-10"
              onClick={onOpenGuide}
            >
              <BookOpen />
              {t("connectors.widget.css.guide")}
            </Button>
          }
        >
          <TextareaField
            control={form.control}
            name="customCss"
            label={t("connectors.widget.css.label")}
            placeholder=":host { --aiva-bubble-radius: 4px; }"
            spellCheck={false}
            rows={5}
            maxLength={8192}
            showCount
            textareaClassName="font-mono text-xs"
          />
        </Group>
      </div>

      {isMobile ? (
        <ResponsiveDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={t("connectors.widget.preview.title")}
          description={t("connectors.widget.preview.hint")}
        >
          <WidgetPreview values={previewValues} />
        </ResponsiveDialog>
      ) : (
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="flex flex-col gap-2">
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium">{t("connectors.widget.preview.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("connectors.widget.preview.hint")}</p>
            </div>
            <WidgetPreview values={previewValues} />
          </div>
        </aside>
      )}
    </div>
  )
}

function ImageSlot({
  connector,
  slot,
  url,
}: {
  connector: WidgetConnector
  slot: "launcher" | "avatar"
  url: string | null
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const key = connectorWidgetKey(connector.id)

  async function upload(file: File) {
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error(t("connectors.widget.images.invalidType"))
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t("connectors.widget.images.tooLarge"))
      return
    }

    const body = new FormData()
    body.append("file", file)
    body.append("slot", slot)

    setBusy(true)
    try {
      const { widget } = await apiUpload<{ widget: WidgetConfig }>(
        `/connectors/${connector.id}/widget/upload-image`,
        body
      )
      await globalMutate(key, { widget }, { revalidate: false })
      toast.success(t("connectors.widget.images.uploaded"))
    } catch (error) {
      toast.error(t("connectors.widget.images.failed"), {
        description: connectorErrorMessage(error, t),
      })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  // Vale na hora, no site de quem instalou, e o arquivo não fica guardado para desfazer.
  async function remove() {
    const confirmed = await confirm({
      title: t("connectors.widget.images.removeTitle"),
      description: t("connectors.widget.images.removeDescription"),
      confirmLabel: t("connectors.widget.images.remove"),
      destructive: true,
      onConfirm: async () => {
        const { widget } = await apiPatch<{ widget: WidgetConfig }>(
          `/connectors/${connector.id}/widget`,
          slot === "launcher" ? { launcherImageUrl: null } : { botAvatarUrl: null }
        )
        await globalMutate(key, { widget }, { revalidate: false })
      },
    })
    if (confirmed) toast.success(t("connectors.widget.images.removed"))
  }

  return (
    <div className="flex items-start gap-3">
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
        {url ? (
          <img src={apiAssetUrl(url)} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus aria-hidden className="size-5" />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium">{t(`connectors.widget.images.${slot}`)}</p>
        <p className="text-xs text-pretty text-muted-foreground">{t(`connectors.widget.images.${slot}Hint`)}</p>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-coarse:h-10"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t(url ? "connectors.widget.images.replace" : "connectors.widget.images.upload")}
          </Button>
          {url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-10"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 />
              {t("connectors.widget.images.remove")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SecurityTab({ form }: TabProps) {
  const { t } = useTranslation()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Group title={t("connectors.widget.origins.title")} description={t("connectors.widget.origins.description")}>
        <AllowedOrigins form={form} />
      </Group>

      <Group title={t("connectors.widget.limits.title")} description={t("connectors.widget.limits.description")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            control={form.control}
            name="rateLimitPerMin"
            label={t("connectors.widget.limits.perMinute")}
            hint={t("connectors.widget.limits.perMinuteHint")}
            min={1}
            max={1000}
          />
          <NumberField
            control={form.control}
            name="dailyMessageCap"
            label={t("connectors.widget.limits.dailyMessages")}
            hint={t("connectors.widget.limits.dailyMessagesHint")}
            min={0}
            max={1_000_000}
          />
          <NumberField
            control={form.control}
            name="dailyVisitorCap"
            label={t("connectors.widget.limits.dailyVisitors")}
            hint={t("connectors.widget.limits.dailyVisitorsHint")}
            min={0}
            max={1_000_000}
          />
        </div>
      </Group>
    </div>
  )
}

function AllowedOrigins({ form }: TabProps) {
  const { t } = useTranslation()
  const { field, fieldState } = useController({ control: form.control, name: "allowedOrigins" })
  const [draft, setDraft] = useState("")
  const [draftError, setDraftError] = useState<string | null>(null)
  const origins = field.value ?? []
  const error = draftError ?? fieldState.error?.message

  function add() {
    const origin = normalizeOrigin(draft)
    if (!origin) {
      setDraftError(t("connectors.widget.origins.invalid"))
      return
    }
    setDraftError(null)
    setDraft("")
    if (!origins.includes(origin)) field.onChange([...origins, origin])
  }

  return (
    <div className="flex flex-col gap-3">
      {origins.length === 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-status-warning-soft px-3 py-2 text-sm text-pretty text-status-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("connectors.widget.origins.emptyWarning")}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Input
          aria-label={t("connectors.widget.origins.add")}
          aria-invalid={Boolean(error)}
          value={draft}
          inputMode="url"
          spellCheck={false}
          placeholder={t("connectors.widget.origins.placeholder")}
          onChange={(event) => {
            setDraft(event.target.value)
            setDraftError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              add()
            }
          }}
        />
        <Button type="button" variant="outline" className="shrink-0 pointer-coarse:h-10" onClick={add}>
          <Plus />
          {t("connectors.widget.origins.add")}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {origins.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {origins.map((origin) => (
            <li key={origin}>
              <TagChip
                onRemove={() => field.onChange(origins.filter((item) => item !== origin))}
                removeLabel={t("connectors.widget.origins.remove", { origin })}
              >
                {origin}
              </TagChip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function InstallTab({
  form,
  connector,
  widget,
  onOpenGuide,
}: TabProps & { connector: WidgetConnector; widget: WidgetConfig; onOpenGuide: () => void }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const key = connectorWidgetKey(connector.id)
  const mode = useWatch({ control: form.control, name: "deliveryMode" })
  const version = useWatch({ control: form.control, name: "pinnedVersion" })
  const versions = widget.availableVersions ?? []
  const latestVersion = versions[0]?.version

  // Escolher versão fixa já parte da mais nova, como a pessoa quase sempre quer.
  useEffect(() => {
    if (mode === "pinned" && !version && latestVersion) {
      form.setValue("pinnedVersion", latestVersion, { shouldDirty: true, shouldValidate: true })
    }
  }, [form, mode, version, latestVersion])

  // Compara com o que está gravado: enquanto não salvar, o código abaixo é o do modo antigo.
  const pendingChange =
    mode !== widget.deliveryMode || (mode === "pinned" && version !== widget.pinnedVersion)

  async function regenerate() {
    const confirmed = await confirm({
      title: t("connectors.widget.install.regenerateTitle"),
      description: t("connectors.widget.install.regenerateDescription"),
      confirmLabel: t("connectors.widget.install.regenerate"),
      destructive: true,
      onConfirm: async () => {
        const { widget: updated } = await apiPost<{ widget: WidgetConfig }>(
          `/connectors/${connector.id}/widget/regenerate-token`
        )
        await globalMutate(key, { widget: updated }, { revalidate: false })
      },
    })
    if (confirmed) toast.success(t("connectors.widget.install.regenerated"))
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Group
        title={t("connectors.widget.install.title")}
        description={t("connectors.widget.install.description")}
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 pointer-coarse:h-10"
            onClick={onOpenGuide}
          >
            <BookOpen />
            {t("connectors.widget.install.guide")}
          </Button>
        }
      >
        {widget.installSnippet ? (
          <div className="flex flex-col gap-2">
            <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap wrap-anywhere">
              {widget.installSnippet}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton
                value={widget.installSnippet}
                label={t("connectors.widget.install.copy")}
                variant="outline"
                size="sm"
                className="pointer-coarse:h-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-coarse:h-10"
                onClick={() => void regenerate()}
              >
                <KeyRound />
                {t("connectors.widget.install.regenerate")}
              </Button>
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              {t("connectors.widget.install.regenerateHint")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("connectors.widget.install.notReady")}</p>
        )}
      </Group>

      <Group title={t("connectors.widget.delivery.title")} description={t("connectors.widget.delivery.description")}>
        <RadioField
          control={form.control}
          name="deliveryMode"
          label={t("connectors.widget.delivery.label")}
          variant="cards"
          options={[
            {
              value: "rolling",
              label: t("connectors.widget.delivery.rolling"),
              description: t("connectors.widget.delivery.rollingHint"),
            },
            {
              value: "pinned",
              label: t("connectors.widget.delivery.pinned"),
              description: t("connectors.widget.delivery.pinnedHint"),
              disabled: versions.length === 0,
            },
          ]}
        />
        {mode === "pinned" ? (
          <SelectField
            control={form.control}
            name="pinnedVersion"
            label={t("connectors.widget.delivery.version")}
            options={versions.map((release) => ({
              value: release.version,
              label: release.releasedAt ? `${release.version} · ${release.releasedAt}` : release.version,
            }))}
          />
        ) : null}
        {pendingChange ? (
          <p className="flex items-start gap-2 rounded-lg bg-status-warning-soft px-3 py-2 text-sm text-pretty text-status-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("connectors.widget.delivery.pendingSave")}
          </p>
        ) : null}
        {mode === "pinned" && widget.widgetSri ? (
          <CopyableBlock label={t("connectors.widget.delivery.sri")} value={widget.widgetSri} />
        ) : null}
        {widget.cspHeader ? (
          <CopyableBlock label={t("connectors.widget.delivery.csp")} value={widget.cspHeader} />
        ) : null}
      </Group>
    </div>
  )
}

function CopyableBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className={cn("flex items-start gap-1 rounded-lg bg-muted p-3")}>
        <code className="min-w-0 flex-1 font-mono text-xs break-all">{value}</code>
        <CopyButton value={value} size="icon-xs" className="shrink-0 pointer-coarse:size-10" />
      </div>
    </div>
  )
}
