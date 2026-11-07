import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import {
  FormActions,
  MultiSelectField,
  ResponsiveDialog,
  TextareaField,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { useConnectors } from "@/hooks/connectors/use-connectors"
import { useFlowMutations } from "@/hooks/flows/use-flows"

import { useFlowContext } from "./flow-context"
import { useEditorUi } from "./ui-store"

// Nome, descrição e canais do fluxo. Saem do editor de blocos porque não fazem parte da definição: valem na
// hora, sem publicar.

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t("flows.details.nameRequired")).max(120, t("flows.details.nameTooLong")),
    description: z.string().max(2000, t("flows.details.descriptionTooLong")),
    connectorIds: z.array(z.string()),
  })
}

export function FlowDetailsDialog() {
  const open = useEditorUi((state) => state.dialog === "details")
  const setDialog = useEditorUi((state) => state.setDialog)
  return open ? <DetailsBody onClose={() => setDialog(null)} /> : null
}

function DetailsBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { flow, reload } = useFlowContext()
  const { updateFlow } = useFlowMutations()
  const { data } = useConnectors({ revalidateOnFocus: false })
  const schema = useMemo(() => buildSchema(t), [t])
  const channels = useMemo(
    () => (data?.connectors ?? []).map((connector) => ({ value: connector.id, label: connector.name })),
    [data]
  )

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: flow.name,
      description: flow.description ?? "",
      connectorIds: flow.connectorFilter.connectorIds,
    },
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async ({ name, description, connectorIds }) => {
    await updateFlow(flow.id, { name, description, connectorFilter: { connectorIds } })
    await reload()
    toast.success(t("flows.details.saved"))
    onClose()
  })

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={t("flows.details.title")}
      size="md"
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("flows.details.save")}
          cancelLabel={t("flows.details.cancel")}
          onCancel={onClose}
          requireChanges
        />
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <TextField control={form.control} name="name" label={t("flows.details.name")} autoFocus />
        <TextareaField control={form.control} name="description" label={t("flows.details.description")} optional />
        <MultiSelectField
          control={form.control}
          name="connectorIds"
          label={t("flows.fields.channels.label")}
          hint={t("flows.fields.channels.hint")}
          options={channels}
          placeholder={t("flows.fields.channels.all")}
          optional
        />
      </div>
    </ResponsiveDialog>
  )
}
