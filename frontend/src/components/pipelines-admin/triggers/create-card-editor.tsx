import { useEffect, useMemo, useRef } from "react"
import { useController, useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"

import {
  CheckboxField,
  ChipsField,
  ComboboxField,
  MultiSelectField,
  NumberField,
  SelectField,
  SelectInput,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useCustomFields } from "@/hooks/pipelines-admin/use-custom-fields"
import { useLabels } from "@/hooks/pipelines-admin/use-labels"
import { useTriggerContext } from "@/hooks/pipelines-admin/use-trigger-context"
import { TOKEN_VALUES } from "@/lib/pipelines-admin/trigger-catalog"
import type { ActionDraft, TriggerDraft } from "@/lib/pipelines-admin/trigger-form"
import type { CustomField } from "@/lib/pipelines-admin/types"
import { TokenField } from "./token-field"

/** Criar um card em outro quadro: nele cabe quase tudo o que um card tem, e cada coisa vem de um modelo. */
export function CreateCardEditor({ index }: { index: number }) {
  const { t } = useTranslation()
  const { otherBoards, peopleOptions, lookups } = useTriggerContext()
  const { control, setValue } = useFormContext<TriggerDraft>()
  const action = useWatch({ control, name: `actions.${index}` }) as ActionDraft | undefined

  const targetId = action?.targetBoardId
  const target = otherBoards.find((board) => board.id === targetId)
  const { fields } = useCustomFields(targetId)
  const { labels } = useLabels()

  // Trocar de quadro invalida a etapa e os campos, que eram do anterior.
  const previousTarget = useRef(targetId)
  useEffect(() => {
    if (previousTarget.current === targetId) return
    previousTarget.current = targetId
    setValue(`actions.${index}.targetStageId`, null, { shouldDirty: true })
    setValue(`actions.${index}.cardCustomFieldValues`, {}, { shouldDirty: true })
  }, [index, setValue, targetId])

  const boardOptions = useMemo(
    () => otherBoards.map((board) => ({ value: board.id, label: board.name })),
    [otherBoards]
  )
  const stageOptions = useMemo(
    () => (target?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name })),
    [target]
  )
  const labelOptions = useMemo(
    () => (labels ?? []).map((label) => ({ value: label.id, label: label.name })),
    [labels]
  )
  const priorityOptions = useMemo(
    () => ["low", "medium", "high", "urgent"].map((value) => ({ value, label: lookups.priorityLabel(value) })),
    [lookups]
  )

  const hasAdvanced = Boolean(
    action?.cardDescriptionTemplate ||
      action?.cardPriority ||
      action?.cardDueDateOffset ||
      action?.cardAssignedToId ||
      action?.cardInheritAssigned ||
      action?.cardInheritLabels ||
      action?.cardLabelIds?.length ||
      action?.cardTags?.length ||
      action?.cardDealValueTemplate ||
      action?.cardCompanyNameTemplate ||
      action?.cardContactEmailTemplate ||
      action?.cardContactPhoneTemplate ||
      Object.values(action?.cardCustomFieldValues ?? {}).some(Boolean)
  )

  return (
    <div className="flex flex-col gap-3">
      {otherBoards.length === 0 ? (
        <p className="text-xs text-pretty text-muted-foreground">
          {t("pipelinesAdmin.triggers.actionForm.createCard.noBoards")}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          control={control}
          name={`actions.${index}.targetBoardId`}
          label={t("pipelinesAdmin.triggers.actionForm.createCard.board")}
          options={boardOptions}
          placeholder={t("pipelinesAdmin.triggers.actionForm.createCard.boardPlaceholder")}
        />
        <SelectField
          control={control}
          name={`actions.${index}.targetStageId`}
          label={t("pipelinesAdmin.triggers.actionForm.createCard.stage")}
          options={stageOptions}
          placeholder={t("pipelinesAdmin.triggers.actionForm.createCard.stageFirst")}
          clearLabel={t("pipelinesAdmin.triggers.actionForm.createCard.stageFirst")}
          disabled={!target}
        />
      </div>

      <TokenField
        control={control}
        name={`actions.${index}.cardTitleTemplate`}
        label={t("pipelinesAdmin.triggers.actionForm.createCard.title")}
        placeholder={t("pipelinesAdmin.triggers.actionForm.createCard.titlePlaceholder", TOKEN_VALUES)}
        preview
      />

      <Collapsible defaultOpen={hasAdvanced} className="flex flex-col gap-3">
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="group -ml-2 self-start text-muted-foreground pointer-coarse:h-10"
            />
          }
        >
          <ChevronDown className="transition-transform group-data-[panel-open]:rotate-180" />
          {t("pipelinesAdmin.triggers.actionForm.createCard.more")}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3">
          <TokenField
            control={control}
            name={`actions.${index}.cardDescriptionTemplate`}
            label={t("pipelinesAdmin.triggers.actionForm.createCard.description")}
            placeholder={t("pipelinesAdmin.triggers.actionForm.createCard.descriptionPlaceholder", TOKEN_VALUES)}
            multiline
            rows={2}
            optional
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              control={control}
              name={`actions.${index}.cardPriority`}
              label={t("pipelinesAdmin.triggers.actionForm.createCard.priority")}
              options={priorityOptions}
              placeholder={t("pipelinesAdmin.triggers.actionForm.createCard.noPriority")}
              clearLabel={t("pipelinesAdmin.triggers.actionForm.createCard.noPriority")}
              optional
            />
            <NumberField
              control={control}
              name={`actions.${index}.cardDueDateOffset`}
              label={t("pipelinesAdmin.triggers.actionForm.createCard.dueDays")}
              hint={t("pipelinesAdmin.triggers.actionForm.createCard.dueDaysHint")}
              min={0}
              optional
            />
          </div>

          <CheckboxField
            control={control}
            name={`actions.${index}.cardInheritAssigned`}
            label={t("pipelinesAdmin.triggers.actionForm.createCard.inheritAssigned")}
          />
          {!action?.cardInheritAssigned ? (
            <ComboboxField
              control={control}
              name={`actions.${index}.cardAssignedToId`}
              label={t("pipelinesAdmin.triggers.actionForm.createCard.assignedTo")}
              options={peopleOptions}
              placeholder={t("pipelinesAdmin.triggers.actionForm.createCard.noAssignee")}
              clearable
              optional
            />
          ) : null}

          <CheckboxField
            control={control}
            name={`actions.${index}.cardInheritLabels`}
            label={t("pipelinesAdmin.triggers.actionForm.createCard.inheritLabels")}
          />
          {!action?.cardInheritLabels ? (
            <MultiSelectField
              control={control}
              name={`actions.${index}.cardLabelIds`}
              label={t("pipelinesAdmin.triggers.actionForm.createCard.labels")}
              options={labelOptions}
              placeholder={t("pipelinesAdmin.triggers.actionForm.createCard.labelsPlaceholder")}
              optional
            />
          ) : null}

          <ChipsField
            control={control}
            name={`actions.${index}.cardTags`}
            label={t("pipelinesAdmin.triggers.actionForm.createCard.tags")}
            placeholder={t("pipelinesAdmin.triggers.actionForm.createCard.tagsPlaceholder")}
            optional
          />

          {target?.boardType === "crm" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <TokenField
                control={control}
                name={`actions.${index}.cardDealValueTemplate`}
                label={t("pipelinesAdmin.triggers.actionForm.createCard.dealValue")}
                optional
              />
              <TokenField
                control={control}
                name={`actions.${index}.cardCompanyNameTemplate`}
                label={t("pipelinesAdmin.triggers.actionForm.createCard.companyName")}
                optional
              />
              <TokenField
                control={control}
                name={`actions.${index}.cardContactEmailTemplate`}
                label={t("pipelinesAdmin.triggers.actionForm.createCard.contactEmail")}
                optional
              />
              <TokenField
                control={control}
                name={`actions.${index}.cardContactPhoneTemplate`}
                label={t("pipelinesAdmin.triggers.actionForm.createCard.contactPhone")}
                optional
              />
            </div>
          ) : null}

          {fields && fields.length > 0 ? (
            <div className="flex flex-col gap-3 border-t pt-3">
              <span className="text-sm font-medium">
                {t("pipelinesAdmin.triggers.actionForm.createCard.customFields", { name: target?.name })}
              </span>
              {fields.map((field) => (
                <TargetFieldInput key={field.id} index={index} field={field} />
              ))}
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function TargetFieldInput({ index, field }: { index: number; field: CustomField }) {
  const { t } = useTranslation()
  const { control } = useFormContext<TriggerDraft>()
  // Pela chave do campo no quadro de destino: é assim que o valor fica gravado no card.
  const name = `actions.${index}.cardCustomFieldValues.${field.key}` as `actions.${number}.message`
  const { field: controller } = useController({ control, name })

  if (field.fieldType === "select" || field.fieldType === "checkbox") {
    const options =
      field.fieldType === "select"
        ? (field.options ?? []).map((option) => ({ value: option, label: option }))
        : [
            { value: "true", label: t("pipelinesAdmin.common.yes") },
            { value: "false", label: t("pipelinesAdmin.common.no") },
          ]
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm">{field.name}</span>
        <SelectInput
          aria-label={field.name}
          options={options}
          value={controller.value ?? null}
          placeholder={t("pipelinesAdmin.triggers.actionForm.createCard.fieldEmpty")}
          clearLabel={t("pipelinesAdmin.triggers.actionForm.createCard.fieldEmpty")}
          onChange={(value) => controller.onChange(value ?? "")}
        />
      </div>
    )
  }

  return <TokenField control={control} name={name} label={field.name} optional />
}
