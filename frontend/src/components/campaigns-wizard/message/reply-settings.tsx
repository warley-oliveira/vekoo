import { useMemo, useState } from "react"
import { useController, useForm, useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronDown, Plus } from "lucide-react"
import { toast } from "@/lib/campaigns-wizard/notify"
import { z } from "zod"

import {
  ColorField,
  FormActions,
  MultiSelectInput,
  ResponsiveDialog,
  SelectField,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useCampaignFlows, useCampaignTags } from "@/hooks/campaigns-wizard/use-campaign-options"
import { useCan } from "@/hooks/use-can"
import { apiPost } from "@/lib/api"
import type { WizardValues } from "@/lib/campaigns-wizard/form"
import type { CampaignTag } from "@/lib/campaigns-wizard/types"
import { COLOR_SWATCHES } from "@/lib/tag-color"

const MAX_TAG_NAME = 60

function CreateTagDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (tag: CampaignTag) => void
}) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t("campaignsWizard.reply.tagNameRequired"))
          .max(MAX_TAG_NAME, t("campaignsWizard.reply.tagNameTooLong", { max: MAX_TAG_NAME })),
        color: z.string().min(1),
      }),
    [t]
  )
  const form = useForm<{ name: string; color: string }>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", color: COLOR_SWATCHES[0] },
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async (values) => {
    const { chatTag } = await apiPost<{ chatTag: CampaignTag }>("/chat-tags", { chatTag: values })
    toast.success(t("campaignsWizard.reply.tagCreated", { name: chatTag.name }))
    form.reset()
    onCreated(chatTag)
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      size="sm"
      title={t("campaignsWizard.reply.createTag")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("campaignsWizard.reply.createTag")}
          onCancel={onClose}
          cancelLabel={t("campaignsWizard.actions.cancel")}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField control={form.control} name="name" label={t("campaignsWizard.reply.tagName")} autoFocus />
        <ColorField control={form.control} name="color" label={t("campaignsWizard.reply.tagColor")} />
      </div>
    </ResponsiveDialog>
  )
}

/**
 * E depois do envio? Quem responde a quem escrever de volta, como marcar a conversa e se ela sobe na
 * lista. Fica recolhido: o padrão resolve a primeira campanha de quase todo mundo.
 */
export function ReplySettings() {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<WizardValues>()
  const canSeeFlows = useCan("flows")
  const { flows, isLoading: flowsLoading } = useCampaignFlows()
  const { tags, isLoading: tagsLoading, reload: reloadTags } = useCampaignTags()
  const flowId = useWatch({ control, name: "flowId" })
  const chatTagIds = useWatch({ control, name: "chatTagIds" })
  const { field: raise } = useController({ control, name: "raiseChats" })
  const [creating, setCreating] = useState(false)

  const flowOptions = useMemo(
    () => (flows ?? []).map((flow) => ({ value: flow.id, label: flow.name })),
    [flows]
  )
  const tagOptions = useMemo(
    () => (tags ?? []).map((tag) => ({ value: tag.id, label: tag.name })),
    [tags]
  )

  const flowName = flows?.find((flow) => flow.id === flowId)?.name
  const summary = [
    flowName ? t("campaignsWizard.reply.summaryFlow", { name: flowName }) : t("campaignsWizard.reply.summaryNoFlow"),
    ...(chatTagIds.length > 0 ? [t("campaignsWizard.reply.summaryTags", { count: chatTagIds.length })] : []),
  ].join(" · ")

  return (
    <Collapsible className="rounded-xl border">
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="group flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("campaignsWizard.reply.title")}</span>
          <span className="block truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-5 border-t p-4">
          {flowsLoading ? (
            <Skeleton className="h-14 w-full" />
          ) : (
            <SelectField
              control={control}
              name="flowId"
              label={t("campaignsWizard.reply.flow")}
              options={flowOptions}
              placeholder={t("campaignsWizard.reply.noFlow")}
              clearLabel={t("campaignsWizard.reply.noFlow")}
              disabled={flowOptions.length === 0}
              hint={
                flowOptions.length === 0 ? (
                  <>
                    {t("campaignsWizard.reply.noFlowsYet")}{" "}
                    {canSeeFlows ? (
                      <Link to="/flows" className="underline underline-offset-2">
                        {t("campaignsWizard.reply.goToFlows")}
                      </Link>
                    ) : null}
                  </>
                ) : (
                  t("campaignsWizard.reply.flowHint")
                )
              }
            />
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("campaignsWizard.reply.tags")}</span>
            {tagsLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <MultiSelectInput
                aria-label={t("campaignsWizard.reply.tags")}
                options={tagOptions}
                value={chatTagIds}
                onChange={(next) => setValue("chatTagIds", next, { shouldDirty: true })}
                placeholder={t("campaignsWizard.reply.tagsPlaceholder")}
                emptyLabel={t("campaignsWizard.reply.tagsEmpty")}
              />
            )}
            <span className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.reply.tagsHint")}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 self-start pointer-coarse:h-10"
              onClick={() => setCreating(true)}
            >
              <Plus />
              {t("campaignsWizard.reply.createTag")}
            </Button>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 pointer-coarse:min-h-10">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t("campaignsWizard.reply.raise")}</span>
              <span className="block text-xs text-pretty text-muted-foreground">
                {t("campaignsWizard.reply.raiseHint")}
              </span>
            </span>
            <Switch checked={raise.value} onCheckedChange={raise.onChange} />
          </label>
        </div>
      </CollapsibleContent>

      <CreateTagDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(tag) => {
          setCreating(false)
          void reloadTags()
          setValue("chatTagIds", [...chatTagIds, tag.id], { shouldDirty: true })
        }}
      />
    </Collapsible>
  )
}
