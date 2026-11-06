import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "motion/react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Check, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  FormActions,
  SidePanel,
  SwitchField,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  isImportRunning,
  useImportMutations,
  useProductImport,
  type ImportFeed,
} from "@/hooks/products/use-product-imports"
import { useMotionPreset } from "@/lib/motion"
import { TITLE_TARGET, isTargetMapped } from "@/lib/products/import-mapping"
import type { ProductImportPreview } from "@/lib/products/types"
import { cn } from "@/lib/utils"
import { ImportHistory } from "./import-history"
import { ImportMappingStep } from "./import-mapping-step"
import { ImportTrackingStep } from "./import-tracking-step"
import { ImportUploadStep } from "./import-upload-step"

/** Onde o painel abre. */
export type ImportView =
  | { name: "upload" }
  | { name: "history" }
  | { name: "tracking"; importId: string }

type Stage = ImportView | { name: "mapping"; preview: ProductImportPreview }

const schema = z.object({
  mapping: z.record(z.string(), z.string()),
  dedupeByTitle: z.boolean(),
  // Recomendado para envio no WhatsApp, e a falha de cópia não é erro: fica ligado de saída.
  mirrorImages: z.boolean(),
})
type MappingValues = z.infer<typeof schema>

const EMPTY_VALUES: MappingValues = { mapping: {}, dedupeByTitle: true, mirrorImages: true }

type ImportPanelProps = {
  /** `null` fecha o painel. */
  view: ImportView | null
  onViewChange: (view: ImportView | null) => void
  feed: ImportFeed
}

/**
 * A importação inteira num painel só: enviar, conferir as colunas, acompanhar, ver o
 * resultado e o histórico. Fechar durante o processamento não cancela nada: é o job que
 * trabalha, e a faixa na grade continua mostrando o progresso.
 */
export function ImportPanel({ view, onViewChange, feed }: ImportPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const preset = useMotionPreset()
  const confirm = useConfirm()
  const { startImport, deleteImport } = useImportMutations()

  const [stage, setStage] = useState<Stage>(view ?? { name: "upload" })

  // Abriu de outro jeito (menu, faixa da grade): o painel vai para onde foi pedido. Enquanto
  // está aberto, quem muda a etapa é ele mesmo.
  const [lastView, setLastView] = useState(view)
  if (view !== lastView) {
    setLastView(view)
    if (view) setStage(view)
  }

  const open = view !== null

  const form = useForm<MappingValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
  })
  const mapping = useWatch({ control: form.control, name: "mapping" })
  const mappingError = form.formState.errors.mapping?.message

  const preview = stage.name === "mapping" ? stage.preview : null

  function handleUploaded(next: ProductImportPreview) {
    // O mapeamento sugerido vem do servidor, que é quem leu o cabeçalho de verdade.
    form.reset({ ...EMPTY_VALUES, mapping: next.suggestedMapping ?? {} })
    setStage({ name: "mapping", preview: next })
  }

  const submit = useFormSubmit(form, async (values) => {
    if (!preview) return
    // A assinatura do canal já está de pé desde que a grade abriu, então o primeiro evento
    // não se perde: o contrato pede para assinar antes de chamar `start`.
    await startImport(preview.id, values.mapping, {
      dedupeByTitle: values.dedupeByTitle,
      mirrorImages: values.mirrorImages,
    })
    setStage({ name: "tracking", importId: preview.id })
  })

  /** Cancelar nas colunas apaga o arquivo enviado, para ele não ficar ocupando espaço. */
  function discard(importId: string) {
    void deleteImport(importId).catch(() => {
      // Sem drama: a varredura apaga depois de 7 dias.
    })
  }

  async function close() {
    if (preview) {
      if (form.formState.isDirty) {
        const confirmed = await confirm({
          title: t("products.import.mapping.cancelTitle"),
          description: t("products.import.mapping.cancelHint"),
          confirmLabel: t("products.import.mapping.cancelConfirm"),
          cancelLabel: t("products.import.mapping.cancelStay"),
          destructive: true,
        })
        if (!confirmed) return
      }
      discard(preview.id)
    }
    onViewChange(null)
  }

  const stepIndex = stage.name === "upload" ? 0 : stage.name === "mapping" ? 1 : 2
  const showSteps = stage.name !== "history" && stage.name !== "tracking"

  const title =
    stage.name === "history"
      ? t("products.menu.imports")
      : stage.name === "tracking"
        ? t("products.import.tracking.title")
        : t("products.list.import")

  const description =
    stage.name === "upload"
      ? t("products.import.upload.description")
      : stage.name === "mapping"
        ? t("products.import.mapping.description")
        : undefined

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void close()
      }}
      size="xl"
      title={title}
      description={description}
      // Clicar fora não pode jogar fora um mapeamento feito com cuidado.
      disablePointerDismissal={stage.name === "mapping"}
      onSubmit={stage.name === "mapping" ? submit : undefined}
      footer={
        stage.name === "mapping" ? (
          <FormActions
            form={form}
            submitLabel={t("products.import.mapping.start")}
            onCancel={() => void close()}
            disabled={!isTargetMapped(mapping, TITLE_TARGET)}
          />
        ) : stage.name === "tracking" ? (
          <TrackingFooter
            importId={stage.importId}
            feed={feed}
            onNew={() => setStage({ name: "upload" })}
            onHistory={() => setStage({ name: "history" })}
            onClose={() => onViewChange(null)}
            onDone={() => {
              onViewChange(null)
              navigate("/catalog")
            }}
          />
        ) : stage.name === "history" ? (
          <Button
            type="button"
            className="pointer-coarse:h-10"
            onClick={() => setStage({ name: "upload" })}
          >
            <Plus />
            {t("products.list.import")}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        {showSteps ? <ImportSteps current={stepIndex} /> : null}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={stage.name} {...preset.fade}>
            {stage.name === "upload" ? (
              <ImportUploadStep
                onUploaded={handleUploaded}
                onHistory={() => setStage({ name: "history" })}
              />
            ) : stage.name === "mapping" ? (
              <div className="flex flex-col gap-5">
                <ImportMappingStep
                  preview={stage.preview}
                  mapping={mapping}
                  onMappingChange={(next) =>
                    form.setValue("mapping", next, { shouldDirty: true })
                  }
                />
                {mappingError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {String(mappingError)}
                  </p>
                ) : null}
                <div className="flex flex-col gap-4 border-t pt-5">
                  <SwitchField
                    control={form.control}
                    name="dedupeByTitle"
                    label={t("products.import.mapping.dedupe")}
                    hint={t("products.import.mapping.dedupeHint")}
                  />
                  <SwitchField
                    control={form.control}
                    name="mirrorImages"
                    label={t("products.import.mapping.mirror")}
                    hint={t("products.import.mapping.mirrorHint")}
                  />
                </div>
              </div>
            ) : stage.name === "tracking" ? (
              <ImportTrackingStep importId={stage.importId} feed={feed} />
            ) : (
              <ImportHistory
                onNew={() => setStage({ name: "upload" })}
                onOpen={(entry) => setStage({ name: "tracking", importId: entry.id })}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </SidePanel>
  )
}

const STEP_KEYS = ["upload", "mapping", "progress"] as const

function ImportSteps({ current }: { current: number }) {
  const { t } = useTranslation()

  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEP_KEYS.map((key, index) => (
        <li
          key={key}
          aria-current={index === current ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5",
            index === current ? "font-medium text-foreground" : "text-muted-foreground"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-5 items-center justify-center rounded-full tabular-nums",
              index === current
                ? "bg-primary text-primary-foreground"
                : index < current
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {index < current ? <Check className="size-3" /> : index + 1}
          </span>
          {t(`products.import.steps.${key}`)}
        </li>
      ))}
    </ol>
  )
}

function TrackingFooter({
  importId,
  feed,
  onNew,
  onHistory,
  onClose,
  onDone,
}: {
  importId: string
  feed: ImportFeed
  onNew: () => void
  onHistory: () => void
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { deleteImport } = useImportMutations()
  const { entry } = useProductImport(importId, feed.connected)

  const running =
    !entry ||
    (isImportRunning(entry) &&
      feed.live[importId]?.kind !== "completed" &&
      feed.live[importId]?.kind !== "error")

  if (running) {
    return (
      <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={onClose}>
        {t("products.import.tracking.keepGoing")}
      </Button>
    )
  }

  async function remove() {
    const confirmed = await confirm({
      title: t("products.import.history.deleteTitle"),
      description: t("products.import.history.deleteHint"),
      confirmLabel: t("products.import.history.delete"),
      destructive: true,
      onConfirm: () => deleteImport(importId),
    })
    if (confirmed) {
      toast.success(t("products.import.history.deleted"))
      onHistory()
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground pointer-coarse:h-10 sm:mr-auto"
        onClick={() => void remove()}
      >
        <Trash2 />
        {t("products.import.history.delete")}
      </Button>
      <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={onNew}>
        {t("products.import.tracking.another")}
      </Button>
      <Button type="button" className="pointer-coarse:h-10" onClick={onDone}>
        {t("products.import.tracking.viewCatalog")}
      </Button>
    </>
  )
}
