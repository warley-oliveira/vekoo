import { useTranslation } from "react-i18next"
import { Plus, Trash2 } from "lucide-react"

import { Callout, SelectInput, ResponsiveDialog, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FIELD_TYPES, fieldKeyFromLabel, fieldUsage } from "@/lib/flows/fields"
import type { FlowField, FlowFieldType } from "@/lib/flows/types"

import { useEditor, useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"

// "Dados da conversa": o que este fluxo coleta. O valor fica em cada conversa, e volta quando o fluxo roda de
// novo nela. A chave nasce do nome e não muda mais, porque valores já gravados dependem dela.

export function FieldsPanel() {
  const { t } = useTranslation()
  const open = useEditorUi((state) => state.dialog === "fields")
  const setDialog = useEditorUi((state) => state.setDialog)
  const fields = useEditor((state) => state.fields)
  const api = useEditorApi()
  const confirm = useConfirm()

  const change = (next: FlowField[]) => api.getState().setFields(next)
  const patch = (index: number, value: Partial<FlowField>) =>
    change(fields.map((field, position) => (position === index ? { ...field, ...value } : field)))

  const assignKey = (index: number) => {
    const field = fields[index]
    if (!field || field.key || !field.label.trim()) return
    patch(index, { key: fieldKeyFromLabel(field.label, fields.map((item) => item.key).filter(Boolean)) })
  }

  const remove = async (index: number) => {
    const field = fields[index]
    const used = fieldUsage(api.getState().nodes).get(field.key) ?? 0
    if (used > 0) {
      const confirmed = await confirm({
        title: t("flows.dataFields.deleteTitle", { name: field.label || field.key }),
        description: t("flows.dataFields.deleteDescription", { count: used }),
        confirmLabel: t("flows.dataFields.delete"),
        destructive: true,
      })
      if (!confirmed) return
    }
    change(api.getState().fields.filter((_, position) => position !== index))
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "fields" : null)}
      title={t("flows.dataFields.title")}
      description={t("flows.dataFields.count", { count: fields.length })}
      size="md"
    >
      <div className="flex flex-col gap-3">
        <Callout>{t("flows.dataFields.explain")}</Callout>
        {fields.map((field, index) => {
          const used = fieldUsage(api.getState().nodes).get(field.key) ?? 0
          return (
            <div key={index} className="flex flex-col gap-2.5 rounded-lg border p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={`field-name-${index}`}>{t("flows.dataFields.name")}</Label>
                  <Input
                    id={`field-name-${index}`}
                    value={field.label}
                    placeholder={t("flows.dataFields.namePlaceholder")}
                    onChange={(event) => patch(index, { label: event.target.value })}
                    onBlur={() => assignKey(index)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={`field-type-${index}`}>{t("flows.dataFields.type")}</Label>
                  <SelectInput
                    id={`field-type-${index}`}
                    value={field.type}
                    options={FIELD_TYPES.map((value) => ({ value, label: t(`flows.dataFields.types.${value}`) }))}
                    onChange={(value) => patch(index, { type: (value ?? "string") as FlowFieldType })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("flows.dataFields.delete")}
                  title={t("flows.dataFields.delete")}
                  onClick={() => void remove(index)}
                  className="mb-0.5 text-muted-foreground hover:text-status-danger"
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`field-description-${index}`}>{t("flows.dataFields.description")}</Label>
                <Textarea
                  id={`field-description-${index}`}
                  rows={2}
                  value={field.description ?? ""}
                  placeholder={t("flows.dataFields.descriptionPlaceholder")}
                  onChange={(event) => patch(index, { description: event.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                {field.key ? (
                  <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono">{`{{vars.${field.key}}}`}</code>
                ) : (
                  <span>{t("flows.dataFields.needsName")}</span>
                )}
                <span className="shrink-0">
                  {used > 0 ? t("flows.dataFields.usedIn", { count: used }) : t("flows.dataFields.unused")}
                </span>
              </div>
            </div>
          )
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={() => change([...fields, { key: "", label: "", type: "string", description: "" }])}
        >
          <Plus />
          {t("flows.dataFields.add")}
        </Button>
      </div>
    </ResponsiveDialog>
  )
}
