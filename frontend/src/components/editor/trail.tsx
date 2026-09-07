import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { Reorder } from "motion/react"
import {
  Hash,
  LayoutGrid,
  List,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Quote,
  Type,
  type LucideIcon,
} from "lucide-react"

import { CardArt } from "@/components/editor/card-art"
import { useEditor, type EditorDoc } from "@/components/editor/editor-store"
import { TrailItem, type TrailView } from "@/components/editor/trail-item"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  cardTitle,
  type Block,
  type BlockAlign,
  type CarouselCard,
  type TextRole,
} from "@/lib/doc"
import { newId } from "@/lib/doc"
import { usePersistentState } from "@/lib/view-prefs"
import { cn } from "@/lib/utils"

// A trilha: os cards do carrossel em sequência, à esquerda. Clique ativa,
// arrastar reordena (com o commit de histórico só no fim do arrasto).
// Recolhe, e alterna entre miniaturas e só títulos.

type NewCardKind = "text" | "list" | "quote" | "stat" | "cta"

const NEW_CARD_KINDS: ReadonlyArray<{ kind: NewCardKind; icon: LucideIcon }> = [
  { kind: "text", icon: Type },
  { kind: "list", icon: List },
  { kind: "quote", icon: Quote },
  { kind: "stat", icon: Hash },
  { kind: "cta", icon: Megaphone },
]

function buildCard(kind: NewCardKind): CarouselCard {
  const text = (role: TextRole, align: BlockAlign = "start"): Block => ({
    id: newId("block"),
    type: "text",
    role,
    spans: [],
    align,
    color: role === "body" ? "muted" : "ink",
  })
  const base = {
    id: newId("card"),
    layout: "no-image" as const,
    bg: null,
    align: "top" as const,
    image: null,
  }

  switch (kind) {
    case "text":
      return { ...base, blocks: [text("title"), text("body")] }
    case "list":
      return {
        ...base,
        blocks: [
          text("title"),
          { id: newId("block"), type: "list", style: "bullet", items: [[]], color: "ink" },
        ],
      }
    case "quote":
      return {
        ...base,
        align: "center",
        blocks: [{ id: newId("block"), type: "quote", spans: [], color: "ink" }],
      }
    case "stat":
      return {
        ...base,
        align: "center",
        blocks: [
          {
            id: newId("block"),
            type: "stat",
            value: "",
            label: "",
            align: "start",
            color: "accent",
          },
        ],
      }
    case "cta":
      return {
        ...base,
        align: "center",
        blocks: [
          text("title", "center"),
          text("body", "center"),
          {
            id: newId("block"),
            type: "button",
            label: "",
            variant: "solid",
            align: "center",
          },
        ],
      }
  }
}

export function Trail() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const dragBefore = useRef<EditorDoc | null>(null)
  const [view, setView] = usePersistentState<TrailView>(
    "vekoo.editor.trail.view",
    "thumbs"
  )
  const [trailState, setTrailState] = usePersistentState<"open" | "closed">(
    "vekoo.editor.trail.state",
    "open"
  )

  if (trailState === "closed") {
    return (
      <aside className="hidden w-11 shrink-0 flex-col items-center border-r py-2 md:flex">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("editor.trail.expandAria")}
          onClick={() => setTrailState("open")}
        >
          <PanelLeftOpen />
        </Button>
      </aside>
    )
  }

  const { cards, theme, format } = state.doc
  const activeIndex = cards.findIndex((c) => c.id === state.activeCardId)

  return (
    <aside
      aria-label={t("editor.trail.label")}
      className="hidden w-48 shrink-0 flex-col border-r md:flex"
    >
      <div className="flex shrink-0 items-center justify-between gap-1 border-b p-2">
        <ToggleGroup
          value={[view]}
          onValueChange={(groupValue) => {
            const next = groupValue[0] as TrailView | undefined
            if (next) setView(next)
          }}
        >
          <ToggleGroupItem value="thumbs" aria-label={t("editor.trail.viewThumbs")}>
            <LayoutGrid />
          </ToggleGroupItem>
          <ToggleGroupItem value="titles" aria-label={t("editor.trail.viewTitles")}>
            <List />
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("editor.trail.collapseAria")}
          onClick={() => setTrailState("closed")}
        >
          <PanelLeftClose />
        </Button>
      </div>

      <Reorder.Group
        as="ul"
        axis="y"
        values={cards.map((c) => c.id)}
        onReorder={(ids: string[]) => dispatch({ type: "card/reorder", ids })}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto p-3",
          view === "thumbs" ? "space-y-3" : "space-y-0.5"
        )}
      >
        {cards.map((card, index) => (
          <TrailItem
            key={card.id}
            card={card}
            theme={theme}
            format={format}
            index={index}
            active={card.id === state.activeCardId}
            view={view}
            onSelect={() => dispatch({ type: "card/activate", id: card.id })}
            onDragStart={() => {
              dragBefore.current = state.doc
            }}
            onDragEnd={() => {
              const before = dragBefore.current
              dragBefore.current = null
              if (before) dispatch({ type: "card/reorder-commit", before })
            }}
          />
        ))}
      </Reorder.Group>

      <div className="shrink-0 border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="sm" className="w-full" />}
          >
            <Plus />
            {t("editor.trail.newCard")}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {NEW_CARD_KINDS.map(({ kind, icon: Icon }) => (
              <DropdownMenuItem
                key={kind}
                onClick={() =>
                  dispatch({
                    type: "card/insert",
                    index: activeIndex + 1,
                    card: buildCard(kind),
                  })
                }
              >
                <Icon /> {t(`editor.trail.newCardTypes.${kind}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

/** Versão de bolso da trilha: faixa horizontal abaixo do canvas. */
export function MobileTrail() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const { cards, theme, format } = state.doc

  return (
    <div
      aria-label={t("editor.trail.label")}
      className="flex shrink-0 gap-2 overflow-x-auto border-t p-2 md:hidden"
    >
      {cards.map((card, index) => {
        const label =
          cardTitle(card) ||
          t("editor.trail.cardFallback", { number: index + 1 })
        const active = card.id === state.activeCardId
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => dispatch({ type: "card/activate", id: card.id })}
            aria-current={active ? "true" : undefined}
            aria-label={t("editor.trail.cardAria", {
              number: index + 1,
              title: label,
            })}
            className={cn(
              "w-12 shrink-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active && "ring-2 ring-primary ring-offset-1 ring-offset-background"
            )}
          >
            <CardArt card={card} theme={theme} format={format} />
          </button>
        )
      })}
    </div>
  )
}
