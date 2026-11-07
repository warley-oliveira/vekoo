import { useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Eye } from "lucide-react"

import { ResponsiveDialog, SegmentedControl } from "@/components/shared"
import { Button } from "@/components/ui/button"
import type { WizardValues } from "@/lib/campaigns-wizard/form"
import { ChannelPicker } from "./message/channel-picker"
import { MediaComposer } from "./message/media-composer"
import { MessagePreview } from "./message/message-preview"
import { ReplySettings } from "./message/reply-settings"
import { TemplateComposer } from "./message/template-composer"
import { TextComposer } from "./message/text-composer"
import { StepHeading } from "./wizard-nav"

/** Só mexe em `messageType`, para o composer não remontar com a digitação. */
function FreeComposer() {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<WizardValues>()
  const messageType = useWatch({ control, name: "messageType" })

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl<WizardValues["messageType"]>
        aria-label={t("campaignsWizard.message.typeLabel")}
        value={messageType}
        onChange={(next) => setValue("messageType", next, { shouldDirty: true })}
        options={[
          { value: "text", label: t("campaignsWizard.message.types.text") },
          { value: "media", label: t("campaignsWizard.message.types.media") },
        ]}
      />
      {messageType === "media" ? <MediaComposer /> : <TextComposer />}
    </div>
  )
}

function Composer({
  onPreviewTemplate,
  onOpenTemplate,
}: {
  onPreviewTemplate: (id: string | null) => void
  onOpenTemplate: (id: string) => void
}) {
  const { control } = useFormContext<WizardValues>()
  const mode = useWatch({ control, name: "campaignMode" })

  return mode === "template" ? (
    <TemplateComposer onPreview={onPreviewTemplate} onOpenPreview={onOpenTemplate} />
  ) : (
    <FreeComposer />
  )
}

/** O que dizer: de onde sai, o texto e o que acontece quando responderem, com a prévia ao lado. */
export function StepMessage() {
  const { t } = useTranslation()
  const [previewOpen, setPreviewOpen] = useState(false)
  // No computador, o modelo sob o mouse. No celular, o que a pessoa pediu para ver.
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null)
  const [openedTemplateId, setOpenedTemplateId] = useState<string | null>(null)

  return (
    <section aria-labelledby="wizard-step-message" className="flex flex-col gap-6">
      <StepHeading
        id="wizard-step-message"
        title={t("campaignsWizard.steps.message.title")}
        hint={t("campaignsWizard.steps.message.hint")}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <ChannelPicker />
          <Composer
            onPreviewTemplate={setHoveredTemplateId}
            onOpenTemplate={(id) => {
              setOpenedTemplateId(id)
              setPreviewOpen(true)
            }}
          />

          {/* No celular a prévia abre sob demanda: o teclado já ocupa a metade da tela. */}
          <Button
            type="button"
            variant="outline"
            className="self-start lg:hidden pointer-coarse:h-10"
            onClick={() => {
              setOpenedTemplateId(null)
              setPreviewOpen(true)
            }}
          >
            <Eye />
            {t("campaignsWizard.preview.open")}
          </Button>

          <ReplySettings />
        </div>

        <aside className="sticky top-6 hidden lg:block" aria-label={t("campaignsWizard.preview.title")}>
          <MessagePreview focusTemplateId={hoveredTemplateId} />
        </aside>
      </div>

      <ResponsiveDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={t("campaignsWizard.preview.title")}
      >
        <MessagePreview focusTemplateId={openedTemplateId} />
      </ResponsiveDialog>
    </section>
  )
}
