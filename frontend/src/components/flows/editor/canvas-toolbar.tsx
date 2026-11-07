import { useReactFlow, useStore as useFlowStore } from "@xyflow/react"
import { useTranslation } from "react-i18next"
import { Keyboard, LayoutGrid, ListTree, Maximize, Minus, Plus, Redo2, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { ResponsivePopover } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FIT_OPTIONS } from "@/lib/flows/layout"
import { formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

import { isMac, modKey, motionMs } from "./keys"
import { useEditor, useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"

// A barra flutuante do quadro. Zoom em componente próprio: é o único pedaço que acompanha cada pincelada
// da roda do mouse, e o resto da barra não precisa redesenhar por isso.

function ToolButton({
  label,
  shortcut,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  disabled?: boolean
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={onClick}
            className="rounded-lg data-[pressed=true]:bg-accent data-[pressed=true]:text-accent-foreground"
            data-pressed={pressed}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-2">
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  )
}

function ZoomControls() {
  const { t } = useTranslation()
  const language = useLanguage()
  const flow = useReactFlow()
  const zoom = useFlowStore((state) => state.transform[2])

  return (
    <>
      <ToolButton label={t("flows.toolbar.zoomOut")} onClick={() => void flow.zoomOut({ duration: motionMs(120) })}>
        <Minus />
      </ToolButton>
      <button
        type="button"
        onClick={() => void flow.zoomTo(1, { duration: motionMs(150) })}
        aria-label={t("flows.toolbar.zoomReset")}
        title={t("flows.toolbar.zoomReset")}
        className="h-7 w-11 rounded-lg text-xs text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {formatPercent(zoom, language, { maximumFractionDigits: 0 })}
      </button>
      <ToolButton label={t("flows.toolbar.zoomIn")} onClick={() => void flow.zoomIn({ duration: motionMs(120) })}>
        <Plus />
      </ToolButton>
      <ToolButton
        label={t("flows.toolbar.fit")}
        shortcut="F"
        onClick={() => void flow.fitView({ ...FIT_OPTIONS, duration: motionMs(250) })}
      >
        <Maximize />
      </ToolButton>
    </>
  )
}

export function CanvasToolbar() {
  const { t } = useTranslation()
  const api = useEditorApi()
  const flow = useReactFlow()
  const readOnly = useEditor((state) => state.readOnly)
  const canUndo = useEditor((state) => state.past.length > 0)
  const canRedo = useEditor((state) => state.future.length > 0)
  const outlineOpen = useEditorUi((state) => state.outlineOpen)
  const toggleOutline = useEditorUi((state) => state.toggleOutline)

  const arrange = () => {
    api.getState().arrange()
    window.setTimeout(() => void flow.fitView({ ...FIT_OPTIONS, duration: motionMs(300) }), 30)
    toast.success(t("flows.toolbar.arranged"), {
      action: { label: t("flows.toolbar.undo"), onClick: () => api.getState().undo() },
    })
  }

  return (
    <div
      role="toolbar"
      aria-label={t("flows.toolbar.label")}
      className="flex items-center gap-0.5 rounded-xl border bg-popover p-1 shadow-md"
    >
      {!readOnly ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => api.getState().openPicker({})}
            className="rounded-lg"
            title={`${t("flows.toolbar.add")} (${modKey()}+K)`}
          >
            <Plus />
            {t("flows.toolbar.add")}
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <ToolButton
            label={t("flows.toolbar.undo")}
            shortcut={`${modKey()}+Z`}
            disabled={!canUndo}
            onClick={() => api.getState().undo()}
          >
            <Undo2 />
          </ToolButton>
          <ToolButton
            label={t("flows.toolbar.redo")}
            shortcut={`${modKey()}+Shift+Z`}
            disabled={!canRedo}
            onClick={() => api.getState().redo()}
          >
            <Redo2 />
          </ToolButton>
          <Separator orientation="vertical" className="mx-1 h-5" />
        </>
      ) : null}

      <ZoomControls />

      {!readOnly ? (
        <>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <ToolButton label={t("flows.toolbar.arrange")} onClick={arrange}>
            <LayoutGrid />
          </ToolButton>
        </>
      ) : null}
      {!readOnly ? (
        <ToolButton label={t("flows.toolbar.outline")} shortcut="L" pressed={outlineOpen} onClick={toggleOutline}>
          <ListTree />
        </ToolButton>
      ) : null}
      {!readOnly ? <ShortcutsPopover /> : null}
    </div>
  )
}

const SHORTCUTS: { keys: string[]; labelKey: string }[] = [
  { keys: ["mod", "K"], labelKey: "add" },
  { keys: ["mod", "S"], labelKey: "save" },
  { keys: ["mod", "Z"], labelKey: "undo" },
  { keys: ["mod", "Shift", "Z"], labelKey: "redo" },
  { keys: ["mod", "D"], labelKey: "duplicate" },
  { keys: ["mod", "C"], labelKey: "copy" },
  { keys: ["mod", "V"], labelKey: "paste" },
  { keys: ["Delete"], labelKey: "delete" },
  { keys: ["Esc"], labelKey: "close" },
  { keys: ["F"], labelKey: "fit" },
  { keys: ["L"], labelKey: "outline" },
  { keys: ["T"], labelKey: "test" },
  { keys: ["Shift"], labelKey: "box" },
]

function ShortcutsPopover() {
  const { t } = useTranslation()
  return (
    <ResponsivePopover
      title={t("flows.shortcuts.title")}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("flows.shortcuts.title")}
          title={t("flows.shortcuts.title")}
          className="rounded-lg"
        >
          <Keyboard />
        </Button>
      }
      className="w-80"
    >
      <dl className="flex flex-col gap-1.5 text-sm">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.labelKey} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t(`flows.shortcuts.${shortcut.labelKey}`)}</dt>
            <dd>
              <KbdGroup>
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key === "mod" ? (isMac() ? "⌘" : "Ctrl") : key}</Kbd>
                ))}
              </KbdGroup>
            </dd>
          </div>
        ))}
      </dl>
    </ResponsivePopover>
  )
}
