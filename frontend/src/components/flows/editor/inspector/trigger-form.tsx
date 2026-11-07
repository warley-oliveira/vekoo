import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { MultiSelectInput } from "@/components/shared"
import { useConnectors } from "@/hooks/connectors/use-connectors"
import { useFlowMutations } from "@/hooks/flows/use-flows"
import { blockIcon, triggerBlockType } from "@/lib/flows/catalog"
import { FLOW_TRIGGER_TYPES, type FlowTriggerType } from "@/lib/flows/types"

import { useFlowContext } from "../flow-context"
import { useEditorApi } from "../store"
import { useEditorUi } from "../ui-store"
import { WebhookLink } from "./forms-basic"
import { Advanced, ChipsBox, ChoiceCards, Field, Note, Section, useBlockForm } from "./parts"
import { Button } from "@/components/ui/button"

// O gatilho, em linguagem de gente: "Quando alguém mandar a primeira mensagem". Trocar é no próprio bloco,
// e não apagando e criando outro, para não perder o que já está ligado nele.

export function TriggerForm() {
  const { t } = useTranslation()
  const api = useEditorApi()
  const { id, type } = useBlockForm()
  const { flow } = useFlowContext()
  const setDialog = useEditorUi((state) => state.setDialog)
  const current = type.replace("trigger_", "") as FlowTriggerType

  const options = useMemo(
    () =>
      FLOW_TRIGGER_TYPES.map((trigger) => {
        const Icon = blockIcon(triggerBlockType(trigger))
        return {
          value: trigger,
          icon: <Icon />,
          title: t(`flows.blocks.trigger_${trigger}.label`),
          description: t(`flows.blocks.trigger_${trigger}.description`),
        }
      }),
    [t]
  )

  return (
    <>
      <Section title={t("flows.fields.trigger.title")} description={t("flows.fields.trigger.hint")}>
        <ChoiceCards
          label={t("flows.fields.trigger.title")}
          value={current}
          options={options}
          onChange={(next) => api.getState().changeTrigger(id, triggerBlockType(next))}
        />
      </Section>

      {current === "keyword" ? (
        <Section>
          <ChipsBox name="keywords" />
        </Section>
      ) : null}

      {current === "webhook" ? (
        <Section>
          <Note>{t("flows.fields.trigger_webhook.note")}</Note>
          <WebhookLink />
        </Section>
      ) : null}

      {current === "manual" ? (
        <Section>
          <Note>{t("flows.fields.trigger_manual.note")}</Note>
          {flow.published ? (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setDialog("start")}>
              {t("flows.start.action")}
            </Button>
          ) : null}
        </Section>
      ) : null}

      {current === "human_handoff" ? (
        <Section>
          <Note>{t("flows.fields.trigger_human_handoff.note")}</Note>
        </Section>
      ) : null}

      {current !== "webhook" && current !== "manual" ? <ChannelFilter /> : null}
    </>
  )
}

/** Em quais canais o fluxo dispara. É do fluxo, e não do bloco: vai direto para a API. */
function ChannelFilter() {
  const { t } = useTranslation()
  const { flow, reload } = useFlowContext()
  const { updateFlow } = useFlowMutations()
  const { data } = useConnectors({ revalidateOnFocus: false })
  const options = useMemo(
    () => (data?.connectors ?? []).map((connector) => ({ value: connector.id, label: connector.name })),
    [data]
  )
  const selected = flow.connectorFilter.connectorIds

  return (
    <Advanced defaultOpen={selected.length > 0}>
      <Field id="flow-channels" label={t("flows.fields.channels.label")} hint={t("flows.fields.channels.hint")}>
        <MultiSelectInput
          id="flow-channels"
          value={selected}
          options={options}
          placeholder={t("flows.fields.channels.all")}
          onChange={(connectorIds) => {
            updateFlow(flow.id, { connectorFilter: { connectorIds } })
              .then(() => reload())
              .catch(() => toast.error(t("flows.fields.channels.failed")))
          }}
        />
      </Field>
    </Advanced>
  )
}
