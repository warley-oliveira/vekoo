import { useTranslation } from "react-i18next"

import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { ConfirmDialog } from "./confirm-dialog"

export type UnsavedChangesDialogProps = {
  /** Normalmente `form.formState.isDirty`. */
  when: boolean
}

/** Pergunta antes de sair de um formulário com alteração. Basta colocar na tela. */
export function UnsavedChangesDialog({ when }: UnsavedChangesDialogProps) {
  const { t } = useTranslation()
  const { blocked, proceed, reset } = useUnsavedChanges(when)

  return (
    <ConfirmDialog
      open={blocked}
      onOpenChange={(open) => {
        if (!open) reset()
      }}
      onConfirmed={proceed}
      destructive
      title={t("kit.unsaved.title")}
      description={t("kit.unsaved.description")}
      confirmLabel={t("kit.unsaved.leave")}
      cancelLabel={t("kit.unsaved.stay")}
    />
  )
}
