import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { CircleHelp, ListChecks, Plus, Sparkles } from "lucide-react"
import { Link, useSearchParams } from "@/lib/router"
import { toast } from "sonner"

import { useCalendarArea } from "@/components/calendar/area/area-context"
import { SequenceCard } from "@/components/calendar/sequences/sequence-card"
import { newSequence } from "@/components/calendar/sequences/sequence-form"
import { SequencePanel } from "@/components/calendar/sequences/sequence-panel"
import {
  findTemplate,
  sequenceFromTemplate,
} from "@/components/calendar/sequences/sequence-templates"
import { SequenceTemplatesDialog } from "@/components/calendar/sequences/sequence-templates-dialog"
import { SequencesShowcase } from "@/components/calendar/sequences/sequences-showcase"
import { useSequenceList } from "@/components/calendar/sequences/use-sequence-list"
import { calendarErrorMessage } from "@/components/calendar/settings/error-message"
import {
  Callout,
  EmptyState,
  ErrorState,
  LoadingRegion,
  SettingsSection,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAttendanceSequences } from "@/hooks/calendar/use-attendance-sequences"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import type { AttendanceSequence, SequenceTrigger } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"

const TRIGGERS: SequenceTrigger[] = ["show", "no_show"]

function parseTrigger(value: string | null): SequenceTrigger | null {
  return value === "show" || value === "no_show" ? value : null
}

/**
 * As sequências de um calendário, por resultado: quem veio e quem faltou. O painel aberto fica no
 * endereço (`?sequence=<id>`, `?new=show&template=<modelo>`), para dar para mandar o link.
 */
export default function SequencesPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const preset = useMotionPreset()
  const { calendar } = useCalendarArea()
  const { sequences, error, isLoading, reload } = useAttendanceSequences(calendar.id)
  const list = useSequenceList(calendar.id)

  /* ---------- painel: o endereço diz o que está aberto ---------- */

  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get("sequence")
  const newTrigger = parseTrigger(searchParams.get("new"))
  const templateKey = searchParams.get("template")

  const openSequence = (id: string | undefined) => {
    if (!id) return
    setSearchParams(
      (current) => {
        current.delete("new")
        current.delete("template")
        current.set("sequence", id)
        return current
      },
      { replace: true }
    )
  }
  const openNew = (trigger: SequenceTrigger, template?: string) =>
    setSearchParams(
      (current) => {
        current.delete("sequence")
        current.set("new", trigger)
        if (template) current.set("template", template)
        else current.delete("template")
        return current
      },
      { replace: true }
    )
  // Salvar pode terminar com a página já fora da tela: fechar a arrastaria de volta para cá.
  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])
  const closePanel = () => {
    if (!isMounted.current) return
    setSearchParams(
      (current) => {
        current.delete("sequence")
        current.delete("new")
        current.delete("template")
        return current
      },
      { replace: true }
    )
  }

  const editing = selectedId ? (sequences?.find((item) => item.id === selectedId) ?? null) : null
  const panelContent = useMemo(() => {
    if (editing) return { draft: editing, base: editing as AttendanceSequence | null }
    if (!newTrigger) return null
    const template = findTemplate(templateKey, newTrigger)
    return {
      draft: template ? sequenceFromTemplate(template, language) : newSequence(newTrigger, t),
      base: null,
    }
  }, [editing, language, newTrigger, t, templateKey])
  const shownPanel = useRetained(panelContent)

  // Outra pessoa excluiu com o painel aberto: ele fica, e salvar pergunta o que fazer.
  const keptOpen = Boolean(selectedId && shownPanel?.base?.id === selectedId)
  const panelOpen = Boolean(panelContent) || keptOpen
  const panelKey = useOpenCount(panelOpen)

  // Link para uma sequência que não existe mais.
  const isMissing = Boolean(selectedId && sequences && !editing && !keptOpen)
  useEffect(() => {
    if (!isMissing) return
    toast.error(t("calendar.sequences.notFound"))
    setSearchParams(
      (current) => {
        current.delete("sequence")
        return current
      },
      { replace: true }
    )
  }, [isMissing, setSearchParams, t])

  /* ---------- diálogos ---------- */

  const [templatesFor, setTemplatesFor] = useState<SequenceTrigger | null>(null)
  const shownTemplates = useRetained(templatesFor)
  const [showcaseOpen, setShowcaseOpen] = useState(false)

  /* ---------- ações ---------- */

  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>({})

  async function toggle(sequence: AttendanceSequence, enabled: boolean) {
    const id = sequence.id ?? ""
    setPendingToggles((current) => ({ ...current, [id]: enabled }))
    try {
      const applied = await list.setEnabled(sequence.id, enabled)
      if (applied) {
        toast.success(
          t(enabled ? "calendar.sequences.card.turnedOn" : "calendar.sequences.card.turnedOff", {
            name: sequence.name,
          })
        )
      } else {
        toast.error(t("calendar.sequences.notFound"))
      }
    } catch (cause) {
      toast.error(calendarErrorMessage(t, cause))
    } finally {
      setPendingToggles((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }

  async function remove(sequence: AttendanceSequence) {
    const confirmed = await confirm({
      title: t("calendar.sequences.delete.title", { name: sequence.name }),
      description: t("calendar.sequences.delete.description"),
      confirmLabel: t("calendar.sequences.delete.confirm"),
      destructive: true,
      onConfirm: () => list.remove(sequence.id),
    })
    if (confirmed) {
      closePanel()
      toast.success(t("calendar.sequences.delete.done", { name: sequence.name }))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-6">
        <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
          {t("calendar.sequences.description")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 shrink-0 sm:-mt-1 sm:ml-0 pointer-coarse:h-10"
          onClick={() => setShowcaseOpen(true)}
        >
          <CircleHelp />
          {t("calendar.sequences.howItWorks")}
        </Button>
      </div>

      {error && !sequences ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : (
        <div className="flex flex-col gap-6">
          {TRIGGERS.map((trigger) => {
            const items = (sequences ?? []).filter((item) => item.trigger === trigger)
            const autoEnrolling = items.filter(
              (item) => (pendingToggles[item.id ?? ""] ?? item.enabled) && item.autoEnroll
            )
            return (
              <SettingsSection
                key={trigger}
                title={t(`calendar.sequences.trigger.${trigger}`)}
                description={t(`calendar.sequences.triggerDescription.${trigger}`)}
              >
                {isLoading && !sequences ? (
                  <LoadingRegion>
                    <div className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10">
                      <Skeleton className="h-5 w-1/2" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </LoadingRegion>
                ) : items.length === 0 ? (
                  <EmptyState
                    icon={<ListChecks className="size-5" />}
                    title={t(`calendar.sequences.empty.${trigger}.title`)}
                    description={t(`calendar.sequences.empty.${trigger}.description`)}
                    action={{
                      label: t("calendar.sequences.useTemplate"),
                      onClick: () => setTemplatesFor(trigger),
                    }}
                  />
                ) : (
                  <ul className="flex flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {items.map((sequence) => (
                        <motion.li key={sequence.id} {...preset.listItem}>
                          <SequenceCard
                            sequence={sequence}
                            enabled={pendingToggles[sequence.id ?? ""] ?? sequence.enabled}
                            togglePending={(sequence.id ?? "") in pendingToggles}
                            onOpen={() => openSequence(sequence.id)}
                            onToggle={(enabled) => void toggle(sequence, enabled)}
                            onDelete={() => void remove(sequence)}
                          />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}

                {autoEnrolling.length > 1 ? (
                  <Callout tone="warning">
                    {t("calendar.sequences.autoEnrollOnlyFirst", { name: autoEnrolling[0].name })}
                  </Callout>
                ) : null}

                {sequences ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="pointer-coarse:h-10"
                      onClick={() => openNew(trigger)}
                    >
                      <Plus />
                      {t("calendar.sequences.create")}
                    </Button>
                    {items.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="pointer-coarse:h-10"
                        onClick={() => setTemplatesFor(trigger)}
                      >
                        <Sparkles />
                        {t("calendar.sequences.useTemplate")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </SettingsSection>
            )
          })}

          <SettingsSection
            title={t("calendar.sequences.manual.title")}
            description={t("calendar.sequences.manual.description")}
          >
            <div>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                className="pointer-coarse:h-10"
                render={<Link to="/calendar" />}
              >
                {t("calendar.sequences.manual.action")}
              </Button>
            </div>
          </SettingsSection>
        </div>
      )}

      {shownPanel ? (
        <SequencePanel
          key={panelKey}
          calendar={calendar}
          draft={shownPanel.draft}
          base={shownPanel.base}
          open={panelOpen}
          onOpenChange={(next) => {
            if (!next) closePanel()
          }}
          onSave={list.upsert}
          onDelete={(sequence) => void remove(sequence)}
        />
      ) : null}

      <SequenceTemplatesDialog
        trigger={shownTemplates}
        open={Boolean(templatesFor)}
        onOpenChange={(next) => {
          if (!next) setTemplatesFor(null)
        }}
        onUse={(template) => {
          setTemplatesFor(null)
          openNew(template.trigger, template.key)
        }}
      />

      <SequencesShowcase
        open={showcaseOpen}
        onOpenChange={setShowcaseOpen}
        calendarId={calendar.id}
      />
    </div>
  )
}
