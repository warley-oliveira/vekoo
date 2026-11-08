import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@/lib/router"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  FormError,
  ResponsiveDialog,
  SegmentedControl,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useFlowMutations } from "@/hooks/flows/use-flows"
import { ApiError } from "@/lib/api"
import { blockIcon, triggerBlockType } from "@/lib/flows/catalog"
import { FLOW_TRIGGER_TYPES, type FlowTemplate, type FlowTriggerType } from "@/lib/flows/types"
import { cn } from "@/lib/utils"

import { TemplateGallery } from "./template-gallery"

// Novo fluxo: de um modelo pronto ou do zero. Do zero, a única pergunta é como ele começa, em linguagem de gente.
// O resto se resolve no quadro. Quem chega aqui pela primeira vez cai nos modelos.

type Tab = "template" | "blank"

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t("flows.create.nameRequired")).max(120, t("flows.create.nameTooLong")),
  })
}

export function CreateFlowDialog({
  open,
  onOpenChange,
  initialTab = "template",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: Tab
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { createFlow } = useFlowMutations()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [selected, setSelected] = useState<FlowTemplate | null>(null)
  const [trigger, setTrigger] = useState<FlowTriggerType>("first_message")
  const [busy, setBusy] = useState(false)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)

  const createFromTemplate = async (template: FlowTemplate) => {
    if (busy) return
    setBusy(true)
    try {
      const flow = await createFlow({
        name: template.name,
        description: template.description,
        triggerType: template.triggerType,
        template: template.slug,
      })
      close()
      navigate(`/flows/${flow.id}`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("flows.create.failed"))
      setBusy(false)
    }
  }

  const submit = useFormSubmit(form, async ({ name }) => {
    const flow = await createFlow({ name, triggerType: trigger })
    close()
    navigate(`/flows/${flow.id}`)
  })

  const creating = busy || form.formState.isSubmitting

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("flows.create.title")}
      description={t("flows.create.description")}
      size="xl"
      className="sm:max-w-4xl"
      onSubmit={
        tab === "blank"
          ? submit
          : (event) => {
              event.preventDefault()
              if (selected) void createFromTemplate(selected)
            }
      }
      footer={
        <>
          {tab === "template" ? (
            <p className="mr-auto hidden self-center text-xs text-muted-foreground sm:block">{t("flows.create.templateHint")}</p>
          ) : null}
          <Button type="button" variant="outline" onClick={close}>
            {t("flows.create.cancel")}
          </Button>
          <Button type="submit" disabled={creating || (tab === "template" && !selected)}>
            {creating ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            {tab === "template" ? t("flows.create.useTemplate") : t("flows.create.submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <SegmentedControl
          aria-label={t("flows.create.title")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "template", label: t("flows.create.fromTemplate") },
            { value: "blank", label: t("flows.create.fromScratch") },
          ]}
        />

        {tab === "template" ? (
          <TemplateGallery
            selected={selected?.slug ?? null}
            onSelect={setSelected}
            onConfirm={(template) => void createFromTemplate(template)}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <TextField
              control={form.control}
              name="name"
              label={t("flows.create.name")}
              placeholder={t("flows.create.namePlaceholder")}
              autoFocus
            />

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">{t("flows.create.triggerQuestion")}</legend>
              <div role="radiogroup" className="grid gap-1.5 sm:grid-cols-2">
                {FLOW_TRIGGER_TYPES.map((value) => {
                  const Icon = blockIcon(triggerBlockType(value))
                  const active = trigger === value
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTrigger(value)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        active ? "border-primary bg-accent/50" : "hover:border-foreground/20"
                      )}
                    >
                      <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{t(`flows.blocks.trigger_${value}.label`)}</span>
                        <span className="block text-xs text-pretty text-muted-foreground">
                          {t(`flows.blocks.trigger_${value}.description`)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <FormError form={form} />
          </div>
        )}
      </div>
    </ResponsiveDialog>
  )
}
