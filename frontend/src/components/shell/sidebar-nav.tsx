import { useEffect, useId, type ReactNode } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { ChevronDown, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { AlertCount, AlertDot } from "@/components/shell/alert-count"
import { FoldersSection } from "@/components/shell/sidebar-folders"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCarouselDrop } from "@/hooks/use-carousel-drop"
import { useCarouselMutations } from "@/hooks/use-carousel-mutations"
import { useNavigation } from "@/hooks/use-navigation"
import type { NavChild, NavEntry } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { usePersistentState } from "@/lib/view-prefs"

const ROW =
  "flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10"
const ROW_IDLE =
  "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
const ROW_ACTIVE = "bg-accent text-accent-foreground"
const ROW_RAIL = "justify-center px-0"

export function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { groups } = useNavigation()

  return (
    <nav
      aria-label={t("navigation.aria")}
      className={cn("flex flex-col gap-4 pb-3", collapsed ? "px-2" : "px-3")}
    >
      {groups.map((group) => (
        <NavSection key={group.id} title={t(group.titleKey)} collapsed={collapsed}>
          {group.entries.map((entry) => (
            <li key={entry.id}>
              <SidebarEntry entry={entry} collapsed={collapsed} />
            </li>
          ))}
          {group.id === "creation" && (
            <li>
              <FoldersSection collapsed={collapsed} compactEmpty />
            </li>
          )}
        </NavSection>
      ))}
    </nav>
  )
}

function NavSection({
  title,
  collapsed,
  children,
}: {
  title: string
  collapsed: boolean
  children: ReactNode
}) {
  const id = useId()

  return (
    <section aria-labelledby={id}>
      {/* No trilho o rótulo sai da vista, mas continua nomeando a seção para quem
          navega por leitor de tela. */}
      <h2
        id={id}
        className={
          collapsed
            ? "sr-only"
            : "mb-1 px-2.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
        }
      >
        {title}
      </h2>
      {collapsed && (
        <div aria-hidden className="mx-auto mb-2 h-px w-5 bg-sidebar-border" />
      )}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  )
}

/* ---------- linhas ---------- */

function SidebarEntry({
  entry,
  collapsed,
}: {
  entry: NavEntry
  collapsed: boolean
}) {
  const expandable = (entry.children?.length ?? 0) > 0

  if (collapsed) {
    return expandable ? <RailFlyout entry={entry} /> : <EntryLink entry={entry} rail />
  }
  return expandable ? <ExpandableEntry entry={entry} /> : <EntryLink entry={entry} />
}

function EntryIcon({ icon: Icon, alert }: { icon: LucideIcon; alert: boolean }) {
  return (
    <span className="relative flex shrink-0">
      <Icon className="size-4" aria-hidden />
      {alert && <AlertDot />}
    </span>
  )
}

/** Linha que é um link. Em "Carrosséis", soltar um carrossel tira ele da pasta. */
function EntryLink({ entry, rail = false }: { entry: NavEntry; rail?: boolean }) {
  const { t } = useTranslation()
  const { isActive, getBadge } = useNavigation()
  const { move } = useCarouselMutations()
  const { dragOver, dropHandlers } = useCarouselDrop((id) => {
    move(id, null)
      .then(() => toast(t("carousels.actions.removedFromFolderToast")))
      .catch(() => toast.error(t("carousels.actions.moveFailed")))
  })

  const label = t(entry.titleKey)
  const active = isActive(entry)
  const badge = getBadge(entry)
  const railLabel =
    badge > 0 ? `${label} · ${t("navigation.alerts", { count: badge })}` : label

  const link = (
    <Link
      to={entry.to ?? "/"}
      aria-current={active ? "page" : undefined}
      aria-label={rail ? railLabel : undefined}
      {...(entry.id === "carousels" ? dropHandlers : {})}
      className={cn(
        ROW,
        active ? ROW_ACTIVE : ROW_IDLE,
        rail && ROW_RAIL,
        dragOver && "bg-accent text-accent-foreground ring-2 ring-ring/60"
      )}
    >
      <EntryIcon icon={entry.icon} alert={badge > 0} />
      {!rail && (
        <>
          <span className="flex-1 truncate">{label}</span>
          <AlertCount count={badge} />
        </>
      )}
    </Link>
  )

  if (!rail) return link
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{railLabel}</TooltipContent>
    </Tooltip>
  )
}

function childLabel(child: NavChild, t: (key: string) => string): string {
  return child.title ?? t(child.titleKey ?? child.id)
}

/**
 * Linha que expande (Pipelines, Configurações). O gatilho é sempre um `button` de
 * verdade, com `aria-expanded` e `aria-controls` do Collapsible: Tab chega nele e
 * Enter ou Espaço abre. Quando a área também tem tela própria (Pipelines), o link e o
 * gatilho são dois alvos separados, em vez de um link que também recolhe.
 */
function ExpandableEntry({ entry }: { entry: NavEntry }) {
  const { t } = useTranslation()
  const { isActive, getBadge } = useNavigation()
  const children = entry.children ?? []
  const childActive = children.some((child) => isActive(child))
  const [stored, setStored] = usePersistentState<"open" | "closed">(
    `vekoo.sidebar.${entry.id}`,
    "closed"
  )
  const open = stored === "open"
  const setOpen = (next: boolean) => setStored(next ? "open" : "closed")

  // Entrar numa área de fora (link, busca) abre o grupo onde a pessoa está.
  useEffect(() => {
    if (childActive) setStored("open")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childActive])

  const label = t(entry.titleKey)
  const badge = getBadge(entry)
  // Só a própria tela da área ganha fundo: com um filho ativo, quem acende é ele.
  const selfActive = isActive(entry) && !childActive
  const chevron = (
    <ChevronDown
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
        open && "rotate-180"
      )}
      aria-hidden
    />
  )

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {entry.to ? (
        <div
          className={cn(
            "flex items-center rounded-lg transition-colors",
            selfActive ? ROW_ACTIVE : ROW_IDLE,
            childActive && "text-foreground"
          )}
        >
          <Link
            to={entry.to}
            onClick={() => setOpen(true)}
            aria-current={selfActive ? "page" : undefined}
            className="flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-lg pl-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10"
          >
            <EntryIcon icon={entry.icon} alert={badge > 0} />
            <span className="flex-1 truncate">{label}</span>
            <AlertCount count={badge} />
          </Link>
          <CollapsibleTrigger
            aria-label={t(open ? "navigation.collapse" : "navigation.expand", {
              name: label,
            })}
            className="mx-1 flex size-6 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-8"
          >
            {chevron}
          </CollapsibleTrigger>
        </div>
      ) : (
        <CollapsibleTrigger
          className={cn(ROW, ROW_IDLE, childActive && "text-foreground")}
        >
          <EntryIcon icon={entry.icon} alert={badge > 0} />
          <span className="flex-1 truncate">{label}</span>
          <AlertCount count={badge} />
          {chevron}
        </CollapsibleTrigger>
      )}

      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <ul className="mt-0.5 ml-[1.0625rem] flex flex-col gap-0.5 border-l border-sidebar-border pb-0.5 pl-2">
          {children.map((child) => (
            <li key={child.id}>
              <ChildLink child={child} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ChildLink({ child }: { child: NavChild }) {
  const { t } = useTranslation()
  const { isActive, getBadge } = useNavigation()
  const active = isActive(child)

  return (
    <Link
      to={child.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-7.5 min-w-0 items-center gap-2 rounded-lg px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      )}
    >
      <span className="flex-1 truncate">{childLabel(child, t)}</span>
      <AlertCount count={getBadge(child)} />
    </Link>
  )
}

/**
 * No trilho, a linha que expande abre um menu ao lado (ao passar o mouse, ou com
 * Enter/Espaço pelo teclado), já que não há largura para a lista dentro do trilho.
 */
function RailFlyout({ entry }: { entry: NavEntry }) {
  const { t } = useTranslation()
  const { isActive, getBadge } = useNavigation()
  const label = t(entry.titleKey)
  const badge = getBadge(entry)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        openOnHover
        delay={80}
        render={
          <button
            type="button"
            aria-label={
              badge > 0
                ? `${label} · ${t("navigation.alerts", { count: badge })}`
                : label
            }
            className={cn(
              ROW,
              ROW_RAIL,
              isActive(entry) ? ROW_ACTIVE : ROW_IDLE,
              "data-popup-open:bg-sidebar-accent data-popup-open:text-foreground"
            )}
          />
        }
      >
        <EntryIcon icon={entry.icon} alert={badge > 0} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={10} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {entry.to && (
            <DropdownMenuItem
              render={<Link to={entry.to} />}
              className={cn("pointer-coarse:py-2.5")}
            >
              {t("navigation.allBoards")}
            </DropdownMenuItem>
          )}
          {entry.children?.map((child) => {
            const active = isActive(child)
            return (
              <DropdownMenuItem
                key={child.id}
                render={
                  <Link
                    to={child.to}
                    aria-current={active ? "page" : undefined}
                  />
                }
                className={cn(
                  "pointer-coarse:py-2.5",
                  active && "bg-accent font-medium text-accent-foreground"
                )}
              >
                <span className="flex-1 truncate">{childLabel(child, t)}</span>
                <AlertCount count={getBadge(child)} />
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
