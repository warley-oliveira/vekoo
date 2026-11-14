import {
  CalendarDays,
  House,
  Images,
  Sparkles,
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
  /**
   * Entrada de Criação: o caminho dentro da marca ativa (`""` é o início dela). Com marca
   * conhecida, `to` vira `/brands/<marca><brandSub>`.
   */
  brandSub?: string
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
    // Sem permissão: é a ferramenta de criação, aberta a toda a organização. Tudo aqui mora na
    // marca ativa (`/brands/:brandId/...`): `brandSub` é o caminho dentro dela, e
    // `useNavigationMenu` troca `to` pelo caminho na marca de agora. O `to` daqui é o de quem
    // ainda não tem marca escolhida: `BrandGate` escolhe e leva à mesma tela.
    id: "creation",
    titleKey: "navigation.groups.creation",
    entries: [
      {
        id: "brandHome",
        titleKey: "navigation.brandHome",
        icon: House,
        to: "/brands",
        brandSub: "",
        match: ["/brands/:brandId"],
        end: true,
      },
      {
        id: "create",
        titleKey: "navigation.create",
        icon: Sparkles,
        to: "/brands?to=%2Fcreate",
        brandSub: "/create",
        match: ["/brands/:brandId/create"],
      },
      {
        id: "contents",
        titleKey: "navigation.contents",
        icon: Images,
        to: "/brands?to=%2Fcontents",
        brandSub: "/contents",
        match: ["/brands/:brandId/contents"],
      },
      {
        id: "carousels",
        titleKey: "navigation.carousels",
        icon: Layers,
        to: "/carousels",
        brandSub: "/carousels",
        match: ["/brands/:brandId/carousels", "/brands/:brandId/folders"],
      },
      {
        id: "templates",
        titleKey: "navigation.templates",
        icon: LayoutTemplate,
        to: "/templates",
        brandSub: "/templates",
        match: ["/brands/:brandId/templates"],
      },
      {
        id: "brand",
        titleKey: "navigation.brand",
        icon: Palette,
        to: "/brands?to=%2Fsettings",
        brandSub: "/settings",
        match: ["/brands/:brandId/settings", "/brands/:brandId/setup"],
      },
      {
        id: "trash",
        titleKey: "navigation.trash",
        icon: Trash2,
        to: "/trash",
        brandSub: "/trash",
        match: ["/brands/:brandId/trash"],
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

/** Telas sem linha no menu, que a busca global também acha. */
export const SEARCH_SHORTCUTS: {
  id: string
  titleKey: string
  parentKey?: string
  to: string
  permission?: PermissionKey
}[] = [
  { id: "profile", titleKey: "navigation.routes.profile", to: "/settings/profile" },
  { id: "notifications", titleKey: "navigation.routes.notificationSettings", to: "/settings/notifications" },
  { id: "tools", titleKey: "navigation.routes.tools", parentKey: "navigation.flows", to: "/tools", permission: "flows" },
  {
    id: "automationSettings",
    titleKey: "flows.settings.title",
    parentKey: "navigation.flows",
    to: "/automation-settings",
    permission: "flows",
  },
  {
    id: "placeExtractions",
    titleKey: "campaigns.places.title",
    parentKey: "navigation.campaigns",
    to: "/place-extractions",
    permission: "campaigns",
  },
  {
    id: "catalogCategories",
    titleKey: "navigation.routes.catalogCategories",
    parentKey: "navigation.catalog",
    to: "/catalog/categories",
    permission: "catalog",
  },
  {
    id: "catalogFields",
    titleKey: "navigation.routes.catalogFields",
    parentKey: "navigation.catalog",
    to: "/catalog/fields",
    permission: "catalog",
  },
  {
    id: "teams",
    titleKey: "navigation.routes.teams",
    parentKey: "navigation.settings",
    to: "/settings/teams",
    permission: "core_settings",
  },
  {
    id: "accessRoles",
    titleKey: "navigation.routes.accessRoles",
    parentKey: "navigation.settings",
    to: "/settings/access-roles",
    permission: "core_settings",
  },
  {
    id: "organization",
    titleKey: "people.organization.title",
    parentKey: "navigation.settings",
    to: "/settings/organization",
    permission: "core_settings",
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
 * menu a que tem acesso. Sempre existe uma, porque a Criação não exige permissão.
 */
export function firstAllowedPath(
  can: (permission?: PermissionKey) => boolean
): string {
  for (const group of NAV_GROUPS) {
    for (const entry of group.entries) {
      if (entry.to && can(entry.permission)) return entry.to
    }
  }
  return "/brands"
}
