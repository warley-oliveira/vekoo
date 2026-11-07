import { create } from "zustand"

import { firstFreeSpot, newWidgetId, readingOrder } from "@/lib/custom-dashboards/layout"
import type { CustomDashboard, DashboardWidget, WidgetLayout } from "@/lib/custom-dashboards/types"

// A edição de um painel. Fica fora da árvore: trocar de aba (`?tab=`) não é sair da tela, e a pessoa volta e encontra o
// rascunho como deixou. Cada mudança é uma foto nova, e o desfazer anda entre fotos.
//
// `layouts` mora separado de `widgets`, de propósito: arrastar só troca o mapa de posições, e nenhum objeto de card muda
// de identidade. É isso que deixa os cards fora do render enquanto a grade se mexe.

export type Snapshot = {
  order: string[]
  widgets: Record<string, DashboardWidget>
  layouts: Record<string, WidgetLayout>
}

export type EditSession = {
  present: Snapshot
  /** A foto que está no servidor: igual a `present`, não há o que salvar. */
  saved: Snapshot
  past: Snapshot[]
  future: Snapshot[]
}

const HISTORY_LIMIT = 50

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Foto do que veio da API. O card que não mudou mantém o mesmo objeto, e não desenha de novo depois de salvar. */
export function toSnapshot(dashboard: CustomDashboard, previous?: Snapshot): Snapshot {
  const widgets: Record<string, DashboardWidget> = {}
  const layouts: Record<string, WidgetLayout> = {}
  const order: string[] = []

  for (const widget of readingOrder(dashboard.widgets)) {
    const known = previous?.widgets[widget.id]
    widgets[widget.id] = known && sameContent(known, widget) ? known : widget
    const knownLayout = previous?.layouts[widget.id]
    layouts[widget.id] = knownLayout && sameJson(knownLayout, widget.layout) ? knownLayout : widget.layout
    order.push(widget.id)
  }

  return { order, widgets, layouts }
}

function sameContent(left: DashboardWidget, right: DashboardWidget) {
  return (
    left.title === right.title &&
    left.widgetType === right.widgetType &&
    left.dataSource === right.dataSource &&
    sameJson(left.query, right.query) &&
    sameJson(left.visualConfig, right.visualConfig)
  )
}

/** A lista que vai para a API: em ordem de leitura, com a posição em cada card. */
export function snapshotToWidgets(snapshot: Snapshot): DashboardWidget[] {
  const merged = snapshot.order.map((id) => ({ ...snapshot.widgets[id], layout: snapshot.layouts[id] }))
  return readingOrder(merged).map((widget, position) => ({ ...widget, position }))
}

export function isDirtySession(session: EditSession | undefined) {
  return Boolean(session && session.present !== session.saved)
}

/** Os mesmos cards, nos mesmos lugares. Renomear o painel ou favoritar não conta: isso não é o que o "Salvar" guarda. */
export function sameWidgets(left: Snapshot, right: Snapshot) {
  return (
    left.order.length === right.order.length &&
    left.order.every(
      (id) =>
        right.widgets[id] && sameContent(left.widgets[id], right.widgets[id]) && sameJson(left.layouts[id], right.layouts[id])
    )
  )
}

type EditorState = {
  sessions: Record<string, EditSession>
  start: (dashboard: CustomDashboard) => void
  discard: (id: string) => void
  /** Depois de salvar: o servidor é a nova base, e o histórico recomeça. */
  finish: (id: string) => void
  addWidget: (id: string, widget: Omit<DashboardWidget, "position">, options?: { keepLayout?: boolean }) => void
  updateWidget: (id: string, widgetId: string, patch: Partial<DashboardWidget>) => void
  removeWidget: (id: string, widgetId: string) => void
  cloneWidget: (id: string, widgetId: string, title: string) => string | null
  toggleLock: (id: string, widgetId: string) => void
  commitLayouts: (id: string, layouts: Record<string, WidgetLayout>) => void
  undo: (id: string) => void
  redo: (id: string) => void
}

function commit(session: EditSession, next: Snapshot): EditSession {
  return {
    ...session,
    present: next,
    past: [...session.past.slice(-(HISTORY_LIMIT - 1)), session.present],
    future: [],
  }
}

function withSession(state: EditorState, id: string, change: (session: EditSession) => EditSession) {
  const session = state.sessions[id]
  if (!session) return state
  const next = change(session)
  return next === session ? state : { sessions: { ...state.sessions, [id]: next } }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  sessions: {},

  start: (dashboard) =>
    set((state) => {
      if (state.sessions[dashboard.id]) return state
      const snapshot = toSnapshot(dashboard)
      return {
        sessions: {
          ...state.sessions,
          [dashboard.id]: { present: snapshot, saved: snapshot, past: [], future: [] },
        },
      }
    }),

  discard: (id) =>
    set((state) => {
      if (!state.sessions[id]) return state
      const { [id]: _removed, ...sessions } = state.sessions
      return { sessions }
    }),

  finish: (id) => get().discard(id),

  addWidget: (id, widget, options) =>
    set((state) =>
      withSession(state, id, (session) => {
        const { present } = session
        const layout = options?.keepLayout
          ? widget.layout
          : firstFreeSpot(Object.values(present.layouts), widget.layout)
        return commit(session, {
          order: [...present.order, widget.id],
          widgets: { ...present.widgets, [widget.id]: { ...widget, layout, position: present.order.length } },
          layouts: { ...present.layouts, [widget.id]: layout },
        })
      })
    ),

  updateWidget: (id, widgetId, patch) =>
    set((state) =>
      withSession(state, id, (session) => {
        const current = session.present.widgets[widgetId]
        if (!current) return session
        const next = { ...current, ...patch }
        if (sameContent(current, next)) return session
        return commit(session, {
          ...session.present,
          widgets: { ...session.present.widgets, [widgetId]: next },
        })
      })
    ),

  removeWidget: (id, widgetId) =>
    set((state) =>
      withSession(state, id, (session) => {
        const { [widgetId]: _widget, ...widgets } = session.present.widgets
        const { [widgetId]: _layout, ...layouts } = session.present.layouts
        return commit(session, {
          order: session.present.order.filter((item) => item !== widgetId),
          widgets,
          layouts,
        })
      })
    ),

  cloneWidget: (id, widgetId, title) => {
    const present = get().sessions[id]?.present
    const source = present?.widgets[widgetId]
    if (!present || !source) return null

    const cloneId = newWidgetId()
    get().addWidget(id, { ...source, id: cloneId, title, layout: present.layouts[widgetId] })
    return cloneId
  },

  toggleLock: (id, widgetId) =>
    set((state) =>
      withSession(state, id, (session) => {
        const current = session.present.widgets[widgetId]
        if (!current) return session
        return commit(session, {
          ...session.present,
          widgets: {
            ...session.present.widgets,
            [widgetId]: { ...current, visualConfig: { ...current.visualConfig, locked: !current.visualConfig.locked } },
          },
        })
      })
    ),

  commitLayouts: (id, layouts) =>
    set((state) =>
      withSession(state, id, (session) => {
        const known = session.present.layouts
        let changed = false
        const next: Record<string, WidgetLayout> = {}
        for (const [widgetId, layout] of Object.entries(layouts)) {
          if (!known[widgetId]) continue
          // O mesmo objeto quando não mudou: quem não saiu do lugar não desenha de novo.
          next[widgetId] = sameJson(known[widgetId], layout) ? known[widgetId] : layout
          changed ||= next[widgetId] !== known[widgetId]
        }
        if (!changed) return session
        return commit(session, { ...session.present, layouts: { ...known, ...next } })
      })
    ),

  undo: (id) =>
    set((state) =>
      withSession(state, id, (session) => {
        const previous = session.past.at(-1)
        if (!previous) return session
        return {
          ...session,
          present: previous,
          past: session.past.slice(0, -1),
          future: [session.present, ...session.future],
        }
      })
    ),

  redo: (id) =>
    set((state) =>
      withSession(state, id, (session) => {
        const next = session.future[0]
        if (!next) return session
        return {
          ...session,
          present: next,
          past: [...session.past, session.present],
          future: session.future.slice(1),
        }
      })
    ),
}))

export function useEditSession(id: string) {
  return useEditorStore((state) => state.sessions[id])
}

/** Os painéis com alteração por salvar. Em texto, para o seletor não mudar de identidade a cada render. */
export function useDirtyDashboardIds(): string {
  return useEditorStore((state) =>
    Object.entries(state.sessions)
      .filter(([, session]) => isDirtySession(session))
      .map(([id]) => id)
      .join(",")
  )
}
