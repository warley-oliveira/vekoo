import type { TFunction } from "i18next"

import { canonicalVariableKey, isBuiltInVariable } from "./quick-reply-content"
import type { Attachment, CustomField } from "./types"

export type ExcerptContext = {
  /** `null` enquanto a biblioteca não chegou: dá para mostrar o texto, não para dar alarme. */
  attachmentsById: Map<string, Attachment> | null
  labelOfVariable: (key: string) => string
  missingLabel: string
}

export function buildExcerptContext(
  attachments: Attachment[] | undefined,
  customFields: CustomField[] | undefined,
  t: TFunction
): ExcerptContext {
  const attachmentsById = attachments
    ? new Map(attachments.map((item) => [item.id, item]))
    : null
  const fieldsByKey = new Map((customFields ?? []).map((field) => [field.key, field]))

  return {
    attachmentsById,
    labelOfVariable: (key) => {
      const canonical = canonicalVariableKey(key)
      if (isBuiltInVariable(canonical)) return t(`content.quickReplies.variables.${canonical}`)
      return fieldsByKey.get(canonical)?.name ?? key
    },
    missingLabel: t("content.quickReplies.editor.missingAttachment"),
  }
}
