import {
  CalendarDays,
  Funnel,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  MessagesSquare,
  Palette,
  Settings,
  ShoppingBag,
  SquareKanban,
  Trash2,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react"

import type { PermissionKey } from "@/lib/auth"

// O "Menu final" do manifesto, como dado: a barra lateral, o painel "Mais" e a barra
// inferior desenham a mesma árvore. Módulo sem idioma: só chaves de tradução.

/** Sub-item. Quadro de pipeline chega com `title` (nome vindo da API). */
export type NavChild = {
  id: string
  titleKey?: string
  title?: string
  to: string
  /** Outros caminhos que contam como este item (abas da mesma área). */
  match?: string[]
  alertKey?: string
}

export type NavEntry = {
  id: string
  titleKey: string
  icon: LucideIcon
  /** Sem `to`, a linha só expande: a área não tem tela própria. */
  to?: string
  match?: string[]
  /** Casa só com o caminho exato. */
  end?: boolean
  permission?: PermissionKey
  alertKey?: string
  children?: NavChild[]
}

export type NavGroup = {
  id: string
  titleKey: string
  entries: NavEntry[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    titleKey: "navigation.groups.home",
    entries: [
      {
        id: "dashboard",
        titleKey: "navigation.dashboard",
        icon: LayoutDashboard,
        to: "/dashboard",
        permission: "dashboard",
      },
    ],
  },
  {
    id: "ai",
    titleKey: "navigation.groups.ai",
    entries: [
      {
        id: "flows",
        titleKey: "navigation.flows",
        icon: Workflow,
        to: "/flows",
        match: ["/flows", "/tools", "/automation-settings"],
        permission: "flows",
        alertKey: "flows",
      },
    ],
  },
  {
    id: "productivity",
    titleKey: "navigation.groups.productivity",
    entries: [
      {
        id: "calendar",
        titleKey: "navigation.calendar",
        icon: CalendarDays,
        to: "/calendar",
        permission: "calendar",
      },
      {
        // Os quadros entram como filhos em tempo de execução (useNavigationMenu).
        id: "pipelines",
        alertKey: "pipelines",
        titleKey: "navigation.pipelines",
        icon: SquareKanban,
        to: "/pipelines",
        permission: "pipelines",
      },
    ],
  },
  {
    id: "service",
    titleKey: "navigation.groups.service",
    entries: [
      {
        id: "chat",
        titleKey: "navigation.chat",
        icon: MessagesSquare,
        to: "/chat",
        permission: "chat",
      },
      {
        id: "contacts",
        titleKey: "navigation.contacts",
        icon: UsersRound,
        to: "/contacts",
        permission: "contacts",
      },
      {
        id: "catalog",
        titleKey: "navigation.catalog",
        icon: ShoppingBag,
        to: "/catalog",
        permission: "catalog",
      },
      {
        id: "funnels",
        titleKey: "navigation.funnels",
        icon: Funnel,
        to: "/funnels",
        permission: "funnel",
      },
      {
        id: "campaigns",
        titleKey: "navigation.campaigns",
        icon: Megaphone,
        to: "/campaigns",
        match: ["/campaigns", "/place-extractions"],
        permission: "campaigns",
      },
    ],
  },
  {
    // Sem permissão: é a ferramenta de carrosséis, aberta a toda a organização. Por
    // isso `/carousels` é o destino de último recurso de quem não acessa mais nada.
    id: "creation",
    titleKey: "navigation.groups.creation",
    entries: [
      {
        id: "carousels",
        titleKey: "navigation.carousels",
        icon: Layers,
        to: "/carousels",
        end: true,
      },
      {
        id: "templates",
        titleKey: "navigation.templates",
        icon: LayoutTemplate,
        to: "/templates",
      },
      {
        id: "brands",
        titleKey: "navigation.brands",
        icon: Palette,
        to: "/brands",
      },
      {
        id: "trash",
        titleKey: "navigation.trash",
        icon: Trash2,
        to: "/trash",
      },
    ],
  },
  {
    id: "system",
    titleKey: "navigation.groups.system",
    entries: [
      {
        id: "settings",
        titleKey: "navigation.settings",
        icon: Settings,
        permission: "core_settings",
        children: [
          {
            id: "settings.users",
            titleKey: "navigation.users",
            to: "/settings/users",
            match: [
              "/settings/users",
              "/settings/teams",
              "/settings/access-roles",
              "/settings/organization",
            ],
          },
          {
            id: "settings.integrations",
            titleKey: "navigation.integrations",
            to: "/settings/integrations",
            alertKey: "connectors",
          },
          {
            id: "settings.webhooks",
            titleKey: "navigation.webhooks",
            to: "/settings/webhooks",
            alertKey: "webhooks",
          },
          {
            id: "settings.quickReplies",
            titleKey: "navigation.quickReplies",
            to: "/settings/quick-replies",
          },
          {
            id: "settings.attachments",
            titleKey: "navigation.attachments",
            to: "/settings/attachments",
          },
          {
            id: "settings.customFields",
            titleKey: "navigation.customFields",
            to: "/settings/custom-fields",
          },
        ],
      },
    ],
  },
]

/** A entrada que abre os quadros de pipeline (folha própria no celular). */
export const PIPELINES_ENTRY_ID = "pipelines"
/** A lista de todos. `/pipelines`, sozinho, leva ao último pipeline aberto. */
export const ALL_PIPELINES_PATH = "/pipelines?all=1"

/**
 * As abas fixas da barra inferior, nesta ordem. Fixas de propósito: memória muscular
 * vale mais que contexto numa barra de cinco alvos. Tudo o mais fica no painel "Mais",
 * e uma aba só some da barra quando a pessoa não tem acesso à área.
 */
export const MOBILE_TAB_IDS = ["dashboard", "chat", "calendar", PIPELINES_ENTRY_ID]

/**
 * Separa as abas do resto. Pura, sem React. `activeTabId` nulo quer dizer que a área
 * atual não está na barra: quem acende, então, é o "Mais".
 */
export function selectMobileTabs(entries: NavEntry[], activeEntryId: string | null) {
  const tabs = MOBILE_TAB_IDS.flatMap((id) => {
    const entry = entries.find((candidate) => candidate.id === id)
    return entry ? [entry] : []
  })
  const overflow = entries.filter((entry) => !tabs.includes(entry))
  const activeTabId = tabs.some((tab) => tab.id === activeEntryId)
    ? activeEntryId
    : null

  return { tabs, overflow, activeTabId }
}

/**
 * Para onde vai quem não pode ver a tela pedida (ou abriu `/`): a primeira área do
 * menu a que tem acesso. Sempre existe uma, porque `/carousels` não exige permissão.
 */
export function firstAllowedPath(
  can: (permission?: PermissionKey) => boolean
): string {
  for (const group of NAV_GROUPS) {
    for (const entry of group.entries) {
      if (entry.to && can(entry.permission)) return entry.to
    }
  }
  return "/carousels"
}
