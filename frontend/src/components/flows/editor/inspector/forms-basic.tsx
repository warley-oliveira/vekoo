import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@/lib/router"
import { Code2, ExternalLink, Pencil } from "lucide-react"

import { MultiSelectInput, SelectInput, type SelectOption } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCan } from "@/hooks/use-can"
import { useChatTags, useCustomFields } from "@/hooks/chat/use-chat-refs"
import { useConnectors } from "@/hooks/connectors/use-connectors"
import { useAttachmentLibrary } from "@/hooks/content/use-attachments"
import { useToolDetail, useToolOptions, useWhatsappTemplates } from "@/hooks/flows/use-flow-references"
import { useFlows } from "@/hooks/flows/use-flows"
import { useFunnels } from "@/hooks/insights/use-funnels"
import { usePeople } from "@/hooks/people/use-people"
import { useTeams } from "@/hooks/people/use-teams"
import { LIST_OPERATORS, UNARY_OPERATORS } from "@/lib/flows/summary"
import { uniqueOutputId } from "@/lib/flows/outputs"

import { useFlowContext } from "../flow-context"
import { useEditorUi } from "../ui-store"
import { str, useBlockForm } from "./form-context"
import {
  AddButton,
  Advanced,
  ChoiceCards,
  ComboBox,
  Field,
  NumberBox,
  Note,
  RepeaterItem,
  Section,
  Segmented,
  SelectBox,
  TextInput,
  Toggle,
  VarField,
} from "./parts"
import { VariableField } from "./variable-field"

// Os formulários dos blocos de mensagem, lógica, organização e integração. O texto de cada campo mora em
// `flows.fields`, e os campos se ligam ao bloco pelo nome.

function SenderName() {
  return <VarField name="sender_name" optional />
}

function AdvancedSender({ children }: { children?: React.ReactNode }) {
  const { data } = useBlockForm()
  return (
    <Advanced defaultOpen={Boolean(str(data.sender_name))}>
      {children}
      <SenderName />
    </Advanced>
  )
}

export function SendTextForm() {
  return (
    <>
      <Section>
        <VarField name="text" rows={5} />
      </Section>
      <AdvancedSender />
    </>
  )
}

export function AskQuestionForm() {
  const { t } = useTranslation()
  return (
    <>
      <Section description={t("flows.fields.ask_question.note")}>
        <VarField name="text" rows={4} />
        <TextInput name="save_to" mono variableName optional />
      </Section>
      <AdvancedSender />
    </>
  )
}

export function WaitForMessageForm() {
  const { t } = useTranslation()
  return (
    <Section description={t("flows.fields.wait_for_message.note")}>
      <TextInput name="save_to" mono variableName optional />
    </Section>
  )
}

export function InteractiveForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const buttons = (Array.isArray(data.buttons) ? data.buttons : []) as { id: string; title: string }[]
  const [fresh] = useState(() => new Set<string>())

  const add = () => {
    const id = uniqueOutputId(t("flows.fields.send_interactive.newButton"), buttons.map((button) => button.id), "opcao")
    fresh.add(id)
    set({ buttons: [...buttons, { id, title: "" }] }, { coalesce: "" })
  }

  // O id acompanha o nome só enquanto a opção é nova: é ele que fica salvo em `{{vars.x}}`.
  const syncId = (index: number) => {
    const button = buttons[index]
    if (!button || !fresh.has(button.id) || !button.title.trim()) return
    const others = buttons.filter((_, position) => position !== index).map((item) => item.id)
    const nextId = uniqueOutputId(button.title, others, "opcao")
    if (nextId === button.id) return
    fresh.delete(button.id)
    fresh.add(nextId)
    set(
      { buttons: buttons.map((item, position) => (position === index ? { ...item, id: nextId } : item)) },
      { renames: { [button.id]: nextId }, coalesce: "" }
    )
  }

  return (
    <>
      <Section>
        <VarField name="text" rows={4} />
      </Section>
      <Section
        title={t("flows.fields.send_interactive.buttonsTitle")}
        description={t("flows.fields.send_interactive.buttonsHint")}
      >
        {buttons.map((button, index) => (
          <div key={button.id} className="flex items-center gap-1.5">
            <span className="w-4 shrink-0 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</span>
            <VariableOption
              value={button.title}
              placeholder={t("flows.fields.send_interactive.buttonPlaceholder")}
              label={t("flows.fields.send_interactive.buttonLabel", { number: index + 1 })}
              onChange={(title) =>
                set({ buttons: buttons.map((item, position) => (position === index ? { ...item, title } : item)) })
              }
              onBlur={() => syncId(index)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("flows.fields.send_interactive.removeButton", { number: index + 1 })}
              onClick={() => set({ buttons: buttons.filter((_, position) => position !== index) }, { coalesce: "" })}
              className="text-muted-foreground hover:text-status-danger"
            >
              ×
            </Button>
          </div>
        ))}
        <AddButton label={t("flows.fields.send_interactive.addButton")} onClick={add} />
      </Section>
      <AdvancedSender>
        <VarField name="invalid_text" rows={2} optional />
        <TextInput name="save_to" mono variableName optional />
      </AdvancedSender>
    </>
  )
}

function VariableOption({
  value,
  placeholder,
  label,
  onChange,
  onBlur,
}: {
  value: string
  placeholder: string
  label: string
  onChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <Input
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  )
}

export function SendMediaForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const { attachments, isLoading } = useAttachmentLibrary()
  const fromLink = Boolean(str(data.media_url)) || data.source === "url"

  const options = useMemo<SelectOption[]>(
    () => (attachments ?? []).map((item) => ({ value: item.id, label: item.name, description: item.description ?? undefined })),
    [attachments]
  )

  return (
    <>
      <Section>
        <ChoiceCards
          label={t("flows.fields.send_media.sourceLabel")}
          value={fromLink ? "url" : "library"}
          onChange={(value) =>
            set(
              value === "url"
                ? { source: "url", attachment_id: null, attachment_name: "" }
                : { source: "library", media_url: "", media_type: "" },
              { coalesce: "" }
            )
          }
          options={[
            { value: "library", title: t("flows.fields.send_media.library"), description: t("flows.fields.send_media.libraryHint") },
            { value: "url", title: t("flows.fields.send_media.link"), description: t("flows.fields.send_media.linkHint") },
          ]}
        />
        {fromLink ? (
          <>
            <VarField name="media_url" mono />
            <SelectBox
              name="media_type"
              options={["image", "audio", "video", "document"].map((value) => ({
                value,
                label: t(`flows.fields.send_media.types.${value}`),
              }))}
            />
            <VarField name="file_name" optional />
          </>
        ) : (
          <ComboBox
            name="attachment_id"
            options={options}
            loading={isLoading}
            onPick={(value, option) => set({ attachment_id: value, attachment_name: option?.label ?? "" }, { coalesce: "" })}
          />
        )}
        <VarField name="caption" rows={2} optional />
      </Section>
      <AdvancedSender />
    </>
  )
}

export function SendTemplateForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const { data: connectorsData } = useConnectors({ revalidateOnFocus: false })
  const waba = useMemo(
    () => (connectorsData?.connectors ?? []).filter((connector) => connector.type === "whatsapp_cloud"),
    [connectorsData]
  )
  const [connectorId, setConnectorId] = useState<string | null>(null)
  const current = connectorId ?? waba[0]?.id ?? null
  const { templates, isLoading } = useWhatsappTemplates(current)

  const options = useMemo<SelectOption[]>(
    () =>
      templates
        .filter((template) => template.status === "approved" || template.name === data.template_name)
        .map((template) => ({ value: template.name, label: template.name, description: template.language })),
    [data.template_name, templates]
  )

  const parameters = (Array.isArray(data.parameters) ? data.parameters : []) as string[]

  return (
    <>
      <Section description={t("flows.fields.send_template.note")}>
        {waba.length > 1 ? (
          <Field id="template-connector" label={t("flows.fields.send_template.connector")}>
            <SelectInput
              id="template-connector"
              value={current}
              options={waba.map((connector) => ({ value: connector.id, label: connector.name }))}
              onChange={setConnectorId}
            />
          </Field>
        ) : null}
        {waba.length === 0 ? (
          <>
            <Note>{t("flows.fields.send_template.noConnector")}</Note>
            <TextInput name="template_name" mono />
          </>
        ) : (
          <ComboBox
            name="template_name"
            options={options}
            loading={isLoading}
            onPick={(value) => set({ template_name: value ?? "" }, { coalesce: "" })}
          />
        )}
      </Section>
      <Section title={t("flows.fields.send_template.parametersTitle")} description={t("flows.fields.send_template.parametersHint")}>
        {parameters.map((parameter, index) => (
          <RepeaterItem
            key={index}
            removeLabel={t("flows.fields.send_template.removeParameter")}
            onRemove={() => set({ parameters: parameters.filter((_, position) => position !== index) }, { coalesce: "" })}
          >
            <VariableField
              value={parameter}
              rows={1}
              singleLine
              aria-label={t("flows.fields.send_template.parameter", { number: index + 1 })}
              placeholder={t("flows.fields.send_template.parameter", { number: index + 1 })}
              onChange={(value) =>
                set({ parameters: parameters.map((item, position) => (position === index ? value : item)) })
              }
            />
          </RepeaterItem>
        ))}
        <AddButton
          label={t("flows.fields.send_template.addParameter")}
          onClick={() => set({ parameters: [...parameters, ""] }, { coalesce: "" })}
        />
      </Section>
      <AdvancedSender />
    </>
  )
}

/* ---------- Lógica ---------- */

const OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "is_empty",
  "is_not_empty",
  "exists",
  "not_exists",
  "in",
  "not_in",
]

type Rule = { field: string; operator: string; value?: string; values?: string[] }

export function ConditionForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const rules = (Array.isArray(data.rules) ? data.rules : []) as Rule[]
  const patch = (index: number, change: Partial<Rule>) =>
    set({ rules: rules.map((rule, position) => (position === index ? { ...rule, ...change } : rule)) })
  const operators = useMemo(
    () => OPERATORS.map((value) => ({ value, label: t(`flows.operators.${value}`) })),
    [t]
  )
  const fieldOptions = useMemo(
    () =>
      ["message.text", "contact.name", "contact.phone", "chat.status"].map((value) => ({
        value,
        label: t(`flows.variables.builtin.${value.replace(".", "_")}`),
      })),
    [t]
  )

  return (
    <>
      <Section title={t("flows.fields.condition.rulesTitle")} description={t("flows.fields.condition.rulesHint")}>
        {rules.length > 1 ? (
          <Segmented
            name="match"
            fallback="all"
            options={[
              { value: "all", label: t("flows.fields.condition.all") },
              { value: "any", label: t("flows.fields.condition.any") },
            ]}
          />
        ) : null}
        {rules.map((rule, index) => (
          <RepeaterItem
            key={index}
            removeLabel={t("flows.fields.condition.removeRule")}
            canRemove={rules.length > 1}
            onRemove={() => set({ rules: rules.filter((_, position) => position !== index) }, { coalesce: "" })}
          >
            <RuleField
              value={rule.field}
              options={fieldOptions}
              onChange={(field) => patch(index, { field })}
            />
            <SelectInput
              aria-label={t("flows.fields.condition.operator")}
              value={rule.operator}
              options={operators}
              onChange={(operator) => patch(index, { operator: operator ?? "equals" })}
            />
            {UNARY_OPERATORS.has(rule.operator) ? null : LIST_OPERATORS.has(rule.operator) ? (
              <Input
                aria-label={t("flows.fields.condition.values")}
                placeholder={t("flows.fields.condition.valuesPlaceholder")}
                value={(rule.values ?? []).join(", ")}
                onChange={(event) =>
                  patch(index, {
                    values: event.target.value
                      .split(",")
                      .map((item) => item.trimStart()),
                  })
                }
              />
            ) : (
              <VariableField
                rows={1}
                singleLine
                aria-label={t("flows.fields.condition.value")}
                placeholder={t("flows.fields.condition.valuePlaceholder")}
                value={rule.value ?? ""}
                onChange={(value) => patch(index, { value })}
              />
            )}
          </RepeaterItem>
        ))}
        <AddButton
          label={t("flows.fields.condition.addRule")}
          onClick={() => set({ rules: [...rules, { field: "", operator: "contains", value: "" }] }, { coalesce: "" })}
        />
      </Section>
    </>
  )
}

/** O que a regra confere: os campos de sempre, ou uma variável digitada. */
function RuleField({
  value,
  options,
  onChange,
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const known = options.some((option) => option.value === value)
  const custom = !known && value !== ""
  const [typing, setTyping] = useState(custom)

  if (typing || custom) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          className="font-mono md:text-[13px]"
          aria-label={t("flows.fields.condition.field")}
          placeholder="vars.status"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[{}\s]/g, ""))}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setTyping(false)
            onChange("message.text")
          }}
        >
          {t("flows.fields.condition.useList")}
        </Button>
      </div>
    )
  }

  return (
    <SelectInput
      aria-label={t("flows.fields.condition.field")}
      placeholder={t("flows.fields.condition.fieldPlaceholder")}
      value={value || null}
      options={[...options, { value: "__custom", label: t("flows.fields.condition.customField") }]}
      onChange={(next) => {
        if (next === "__custom") {
          setTyping(true)
          onChange("vars.")
          return
        }
        onChange(next ?? "")
      }}
    />
  )
}

export function SwitchForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const cases = (Array.isArray(data.cases) ? data.cases : []) as { id: string; value: string }[]

  const add = () => {
    const id = uniqueOutputId(`caso_${cases.length + 1}`, cases.map((item) => item.id), "caso")
    set({ cases: [...cases, { id, value: "" }] }, { coalesce: "" })
  }

  return (
    <Section>
      <VarField name="field" mono />
      <div className="flex flex-col gap-2">
        {cases.map((item, index) => (
          <RepeaterItem
            key={item.id}
            removeLabel={t("flows.fields.switch.removeCase")}
            onRemove={() => set({ cases: cases.filter((_, position) => position !== index) }, { coalesce: "" })}
          >
            <Input
              aria-label={t("flows.fields.switch.caseValue", { number: index + 1 })}
              placeholder={t("flows.fields.switch.casePlaceholder")}
              value={item.value}
              onChange={(event) =>
                set({ cases: cases.map((other, position) => (position === index ? { ...other, value: event.target.value } : other)) })
              }
            />
          </RepeaterItem>
        ))}
      </div>
      <AddButton label={t("flows.fields.switch.addCase")} onClick={add} />
      <Note>{t("flows.fields.switch.note")}</Note>
    </Section>
  )
}

export function WaitForm() {
  const { t } = useTranslation()
  return (
    <Section description={t("flows.fields.wait.note")}>
      <div className="grid grid-cols-2 gap-2.5">
        <NumberBox name="amount" min={1} />
        <SelectBox
          name="unit"
          options={["seconds", "minutes", "hours", "days"].map((value) => ({
            value,
            label: t(`flows.units.${value}`),
          }))}
        />
      </div>
    </Section>
  )
}

export function SetVariableForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const assignments = (Array.isArray(data.assignments) ? data.assignments : []) as { name: string; value: string }[]
  const patch = (index: number, change: Partial<{ name: string; value: string }>) =>
    set({ assignments: assignments.map((item, position) => (position === index ? { ...item, ...change } : item)) })

  return (
    <Section description={t("flows.fields.set_variable.note")}>
      {assignments.map((assignment, index) => (
        <RepeaterItem
          key={index}
          removeLabel={t("flows.fields.set_variable.remove")}
          onRemove={() => set({ assignments: assignments.filter((_, position) => position !== index) }, { coalesce: "" })}
        >
          <Input
            aria-label={t("flows.fields.set_variable.name")}
            placeholder={t("flows.fields.set_variable.namePlaceholder")}
            className="font-mono md:text-[13px]"
            value={assignment.name}
            onChange={(event) => patch(index, { name: event.target.value.replace(/[^\w]/g, "_").toLowerCase() })}
          />
          <VariableField
            rows={1}
            singleLine
            aria-label={t("flows.fields.set_variable.value")}
            placeholder={t("flows.fields.set_variable.valuePlaceholder")}
            value={assignment.value}
            onChange={(value) => patch(index, { value })}
          />
        </RepeaterItem>
      ))}
      <AddButton
        label={t("flows.fields.set_variable.add")}
        onClick={() => set({ assignments: [...assignments, { name: "", value: "" }] }, { coalesce: "" })}
      />
    </Section>
  )
}

export function LoopForm() {
  const { t } = useTranslation()
  return (
    <>
      <Section description={t("flows.fields.loop.note")}>
        <VarField name="source" mono />
      </Section>
      <Advanced>
        <TextInput name="loop_variable" mono variableName />
        <TextInput name="index_variable" mono variableName />
        <NumberBox name="max_iterations" min={1} max={100} />
      </Advanced>
    </>
  )
}

/* ---------- Organizar ---------- */

export function TagForm() {
  const { t } = useTranslation()
  const { type, data, set } = useBlockForm()
  const { tags, isLoading } = useChatTags()
  const options = useMemo<SelectOption[]>(
    () => tags.map((tag) => ({ value: tag.id, label: tag.name })),
    [tags]
  )
  const creating = type === "add_tag" && !str(data.tag_id) && Boolean(str(data.tag_name))

  return (
    <Section description={t(`flows.fields.${type}.note`)}>
      <ComboBox
        name="tag_id"
        options={options}
        loading={isLoading}
        onPick={(value, option) => set({ tag_id: value ?? "", tag_name: option?.label ?? "" }, { coalesce: "" })}
      />
      {type === "add_tag" ? (
        creating || !str(data.tag_id) ? (
          <TextInput name="tag_name" optional hint={t("flows.fields.add_tag.nameHint")} />
        ) : null
      ) : null}
    </Section>
  )
}

export function AttributeForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const { customFields } = useCustomFields()
  const options = useMemo<SelectOption[]>(
    () => customFields.map((field) => ({ value: field.key, label: field.name, description: field.description ?? undefined })),
    [customFields]
  )
  const known = options.some((option) => option.value === data.key)
  const [typing, setTyping] = useState(Boolean(str(data.key)) && !known)

  return (
    <Section description={t("flows.fields.set_custom_attribute.note")}>
      {typing ? (
        <TextInput name="key" mono variableName />
      ) : (
        <ComboBox
          name="key"
          options={options}
          onPick={(value, option) => set({ key: value ?? "", key_label: option?.label ?? "" }, { coalesce: "" })}
        />
      )}
      <button
        type="button"
        onClick={() => setTyping((current) => !current)}
        className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {typing ? t("flows.fields.set_custom_attribute.useList") : t("flows.fields.set_custom_attribute.typeKey")}
      </button>
      <VarField name="value" />
    </Section>
  )
}

export function AssignAgentForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const { people, isLoading } = useAssignablePeople()
  const pool = Array.isArray(data.account_pool) ? (data.account_pool as string[]) : []
  const mode = pool.length > 0 || data.mode === "pool" ? "pool" : "one"

  return (
    <Section>
      <ChoiceCards
        label={t("flows.fields.assign_agent.modeLabel")}
        value={mode}
        onChange={(value) =>
          set(
            value === "pool"
              ? { mode: "pool", account_id: "", account_name: "" }
              : { mode: "one", account_pool: [] },
            { coalesce: "" }
          )
        }
        options={[
          { value: "one", title: t("flows.fields.assign_agent.one"), description: t("flows.fields.assign_agent.oneHint") },
          { value: "pool", title: t("flows.fields.assign_agent.pool"), description: t("flows.fields.assign_agent.poolHint") },
        ]}
      />
      {mode === "one" ? (
        <ComboBox
          name="account_id"
          options={people}
          loading={isLoading}
          onPick={(value, option) => set({ account_id: value ?? "", account_name: option?.label ?? "" }, { coalesce: "" })}
        />
      ) : (
        <Field id="pool" label={t("flows.fields.account_pool.label")}>
          <MultiSelectInput
            id="pool"
            value={pool}
            options={people}
            onChange={(next) => set({ account_pool: next }, { coalesce: "" })}
          />
        </Field>
      )}
    </Section>
  )
}

function useAssignablePeople() {
  const { people, isLoading } = usePeople()
  return useMemo(
    () => ({
      isLoading,
      people: (people ?? [])
        .filter((person) => !person.revokedAt)
        .map((person): SelectOption => ({ value: person.id, label: person.name, description: person.email })),
    }),
    [isLoading, people]
  )
}

function useTeamOptions() {
  const { teams, isLoading } = useTeams()
  return useMemo(
    () => ({
      isLoading,
      teams: (teams ?? []).map((team): SelectOption => ({ value: team.id, label: team.name })),
    }),
    [isLoading, teams]
  )
}

export function AssignTeamForm() {
  const { set } = useBlockForm()
  const { teams, isLoading } = useTeamOptions()
  return (
    <Section>
      <ComboBox
        name="team_id"
        options={teams}
        loading={isLoading}
        onPick={(value, option) => set({ team_id: value ?? "", team_name: option?.label ?? "" }, { coalesce: "" })}
      />
    </Section>
  )
}

export function TransferForm() {
  const { t } = useTranslation()
  const { set } = useBlockForm()
  const { teams } = useTeamOptions()
  const { people } = useAssignablePeople()
  return (
    <Section description={t("flows.fields.transfer_to_human.note")}>
      <ComboBox
        name="team_id"
        optional
        options={teams}
        onPick={(value, option) => set({ team_id: value ?? "", team_name: option?.label ?? "" }, { coalesce: "" })}
      />
      <ComboBox
        name="account_id"
        optional
        options={people}
        onPick={(value, option) => set({ account_id: value ?? "", account_name: option?.label ?? "" }, { coalesce: "" })}
      />
    </Section>
  )
}

export function PauseForm() {
  const { t } = useTranslation()
  const { data } = useBlockForm()
  return (
    <Section description={t("flows.fields.pause_automation.note")}>
      <SelectBox
        name="period"
        clearLabel={t("flows.fields.pause_automation.forever")}
        placeholder={t("flows.fields.pause_automation.forever")}
        options={["minutes", "hours", "days"].map((value) => ({ value, label: t(`flows.units.${value}`) }))}
      />
      {str(data.period) ? <NumberBox name="amount" min={1} fallback={1} /> : null}
    </Section>
  )
}

export function FunnelStageForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const { funnels, isLoading } = useFunnels()
  const funnel = funnels?.find((item) => item.id === data.funnel_id)
  const funnelOptions = useMemo<SelectOption[]>(
    () => (funnels ?? []).map((item) => ({ value: item.id, label: item.name })),
    [funnels]
  )
  const stageOptions = useMemo<SelectOption[]>(
    () => (funnel?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name })),
    [funnel]
  )

  return (
    <Section description={t("flows.fields.set_funnel_stage.note")}>
      <SelectBox
        name="funnel_id"
        options={funnelOptions}
        placeholder={isLoading ? t("flows.inspector.loading") : undefined}
        onPick={(value, option) =>
          set({ funnel_id: value ?? "", funnel_name: option?.label ?? "", stage_id: "", stage_name: "" }, { coalesce: "" })
        }
      />
      <SelectBox
        name="stage_id"
        options={stageOptions}
        placeholder={funnel ? undefined : t("flows.fields.set_funnel_stage.pickFunnel")}
        onPick={(value, option) => set({ stage_id: value ?? "", stage_name: option?.label ?? "" }, { coalesce: "" })}
      />
    </Section>
  )
}

/* ---------- Outros sistemas ---------- */

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

export function HttpRequestForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const headers = (Array.isArray(data.headers) ? data.headers : []) as { key: string; value: string }[]
  const method = str(data.method) || "GET"
  const patch = (index: number, change: Partial<{ key: string; value: string }>) =>
    set({ headers: headers.map((item, position) => (position === index ? { ...item, ...change } : item)) })

  return (
    <>
      <Section description={t("flows.fields.http_request.note")}>
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2">
          <SelectBox name="method" options={METHODS.map((value) => ({ value, label: value }))} />
          <VarField name="url" mono />
        </div>
        {["POST", "PUT", "PATCH"].includes(method) ? <VarField name="body" rows={4} mono optional /> : null}
        <TextInput name="save_response_to" mono variableName optional />
      </Section>
      <Advanced defaultOpen={headers.length > 0}>
        <Field id="http-headers" label={t("flows.fields.http_request.headers")}>
          <div className="flex flex-col gap-2">
            {headers.map((header, index) => (
              <RepeaterItem
                key={index}
                removeLabel={t("flows.fields.http_request.removeHeader")}
                onRemove={() => set({ headers: headers.filter((_, position) => position !== index) }, { coalesce: "" })}
              >
                <Input
                  aria-label={t("flows.fields.http_request.headerName")}
                  placeholder="Authorization"
                  className="font-mono md:text-[13px]"
                  value={header.key}
                  onChange={(event) => patch(index, { key: event.target.value })}
                />
                <VariableField
                  rows={1}
                  singleLine
                  mono
                  aria-label={t("flows.fields.http_request.headerValue")}
                  value={header.value}
                  onChange={(value) => patch(index, { value })}
                />
              </RepeaterItem>
            ))}
            <AddButton
              label={t("flows.fields.http_request.addHeader")}
              onClick={() => set({ headers: [...headers, { key: "", value: "" }] }, { coalesce: "" })}
            />
          </div>
        </Field>
        <NumberBox name="timeout" min={1} max={30} />
      </Advanced>
    </>
  )
}

export function ExecuteToolForm() {
  const { t } = useTranslation()
  const { id, data, set } = useBlockForm()
  const { tools, isLoading } = useToolOptions()
  const toolId = str(data.tool_id) || null
  const { tool } = useToolDetail(toolId)
  const setCodeTool = useEditorUi((state) => state.setCodeTool)
  const params = (data.params && typeof data.params === "object" ? data.params : {}) as Record<string, string>

  const options = useMemo<SelectOption[]>(
    () =>
      tools.map((item) => ({
        value: item.id,
        label: item.name,
        description: item.tool ? t("flows.fields.execute_tool.fromTool", { name: item.tool.name }) : (item.description ?? undefined),
      })),
    [t, tools]
  )

  return (
    <>
      <Section description={t("flows.fields.execute_tool.note")}>
        <ComboBox
          name="tool_id"
          options={options}
          loading={isLoading}
          onPick={(value, option) => set({ tool_id: value ?? "", tool_name: option?.label ?? "", params: {} }, { coalesce: "" })}
        />
        <div className="flex flex-wrap gap-2">
          {toolId ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setCodeTool({ id: toolId, nodeId: id })}>
              <Code2 />
              {tool?.locked ? t("flows.fields.execute_tool.seeTool") : t("flows.fields.execute_tool.editCode")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => setCodeTool({ id: null, nodeId: id })}>
            <Pencil />
            {t("flows.fields.execute_tool.newTool")}
          </Button>
        </div>
      </Section>

      {tool && tool.parameters.length > 0 ? (
        <Section title={t("flows.fields.execute_tool.paramsTitle")} description={t("flows.fields.execute_tool.paramsHint")}>
          {tool.parameters.map((parameter) => (
            <Field
              key={parameter.name}
              id={`param-${parameter.name}`}
              label={parameter.name}
              hint={parameter.description}
              optional={!parameter.required}
            >
              <VariableField
                id={`param-${parameter.name}`}
                rows={1}
                singleLine
                value={str(params[parameter.name])}
                onChange={(value) => set({ params: { ...params, [parameter.name]: value } })}
              />
            </Field>
          ))}
        </Section>
      ) : null}

      <Advanced defaultOpen={Boolean(str(data.save_response_to))}>
        <TextInput name="save_response_to" mono variableName optional />
      </Advanced>
    </>
  )
}

export function GotoFlowForm() {
  const { t } = useTranslation()
  const { set } = useBlockForm()
  const { flow } = useFlowContext()
  const { flows, isLoading } = useFlows()
  const options = useMemo<SelectOption[]>(
    () =>
      flows
        .filter((item) => item.id !== flow.id && item.status !== "archived")
        .map((item) => ({ value: item.id, label: item.name, description: t(`flows.status.${item.status}`) })),
    [flow.id, flows, t]
  )
  return (
    <Section description={t("flows.fields.goto_flow.note")}>
      <ComboBox
        name="target_flow_id"
        options={options}
        loading={isLoading}
        onPick={(value, option) =>
          set({ target_flow_id: value ?? "", target_flow_name: option?.label ?? "" }, { coalesce: "" })
        }
      />
      <Toggle name="merge_variables" defaultValue />
    </Section>
  )
}

export function CatalogSearchForm() {
  const { t } = useTranslation()
  const { data, set } = useBlockForm()
  const filters = (data.filters && typeof data.filters === "object" ? data.filters : {}) as {
    tags?: string[]
    categories?: string[]
  }
  return (
    <>
      <Section description={t("flows.fields.catalog_search.note")}>
        <VarField name="query" optional />
        <TextInput name="save_to" mono variableName optional />
      </Section>
      <Advanced defaultOpen={Boolean(filters.tags?.length || filters.categories?.length)}>
        <NumberBox name="limit" min={1} max={20} />
        <Field id="catalog-tags" label={t("flows.fields.catalog_search.tags")} optional>
          <Input
            id="catalog-tags"
            placeholder={t("flows.fields.catalog_search.listPlaceholder")}
            value={(filters.tags ?? []).join(", ")}
            onChange={(event) =>
              set({ filters: { ...filters, tags: splitList(event.target.value) } })
            }
          />
        </Field>
        <Field id="catalog-categories" label={t("flows.fields.catalog_search.categories")} optional>
          <Input
            id="catalog-categories"
            placeholder={t("flows.fields.catalog_search.listPlaceholder")}
            value={(filters.categories ?? []).join(", ")}
            onChange={(event) =>
              set({ filters: { ...filters, categories: splitList(event.target.value) } })
            }
          />
        </Field>
      </Advanced>
    </>
  )
}

function splitList(text: string): string[] {
  return text.split(",").map((item) => item.trimStart())
}

/** Sem o que configurar: só explica. */
export function NoteOnlyForm() {
  const { t } = useTranslation()
  const { type } = useBlockForm()
  return (
    <Section>
      <Note>{t(`flows.fields.${type}.note`)}</Note>
    </Section>
  )
}

/* ---------- Gatilhos ---------- */

export function WebhookLink() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canManage = useCan("core_settings")
  if (!canManage) return null
  return (
    <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => navigate("/settings/webhooks")}>
      <ExternalLink />
      {t("flows.fields.trigger_webhook.open")}
    </Button>
  )
}
