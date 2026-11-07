import { useMemo, type ReactNode } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"
import { ChevronUp, Menu, type LucideIcon } from "lucide-react"

import { useOffscreenAfterExit } from "@/components/shell/motion"
import { useAppShell } from "@/hooks/use-app-shell"
import { useMobileNav } from "@/hooks/use-mobile-nav"
import { useMobileShell } from "@/hooks/use-mobile-shell"
import { useNavigation } from "@/hooks/use-navigation"
import {
  PIPELINES_ENTRY_ID,
  selectMobileTabs,
  type NavEntry,
} from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { spring } from "@/lib/motion"

const INDICATOR_LAYOUT_ID = "mobile-nav-indicator"
const MAX_VISIBLE_BADGE = 99

/** Barra inferior: quatro abas fixas, filtradas por permissão, e o "Mais". */
export function MobileBottomNav() {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const { entries, activeEntry, getBadge } = useNavigation()
  const { isKeyboardOpen, isCompactPhone } = useMobileShell()
  const immersive = useAppShell((shell) => shell.immersive)

  const activeSheet = useMobileNav((state) => state.activeSheet)
  const openSheet = useMobileNav((state) => state.openSheet)
  const closeSheet = useMobileNav((state) => state.closeSheet)
  const setExpandedEntry = useMobileNav((state) => state.setExpandedEntry)

  const isMoreOpen = activeSheet === "more"
  const isPipelinesOpen = activeSheet === "pipelines"

  const { tabs, overflow, activeTabId } = useMemo(
    () => selectMobileTabs(entries, activeEntry?.id ?? null),
    [entries, activeEntry]
  )
  const overflowBadge = overflow.reduce((total, item) => total + getBadge(item), 0)

  const { offscreen, onAnimationStart, onAnimationComplete } = useOffscreenAfterExit(
    immersive,
    reducedMotion
  )

  // `null`, não um transform: uma barra deslocada continua focável, em cima do teclado.
  if (isKeyboardOpen) return null

  // Fora das abas (uma tela do "Mais", uma pasta, o perfil), quem acende é o "Mais".
  const isMoreActive = isMoreOpen || (!activeTabId && !isPipelinesOpen)

  function handleMoreClick() {
    if (isMoreOpen) {
      closeSheet()
      return
    }
    // Já abre com a área onde a pessoa está expandida.
    setExpandedEntry(activeEntry && !activeTabId ? activeEntry.id : null)
    openSheet("more")
  }

  return (
    <motion.nav
      aria-label={t("navigation.aria")}
      aria-hidden={immersive || undefined}
      // `initial` igual ao alvo: quando o teclado fecha com a conversa aberta a barra
      // remonta, e não pode nascer em cena para só então descer.
      initial={{ y: immersive ? "110%" : 0 }}
      animate={{ y: immersive ? "110%" : 0 }}
      transition={reducedMotion ? { duration: 0 } : spring}
      onAnimationStart={onAnimationStart}
      onAnimationComplete={onAnimationComplete}
      style={{
        pointerEvents: immersive ? "none" : "auto",
        visibility: offscreen ? "hidden" : "visible",
      }}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pr-safe pb-safe pl-safe",
        !isCompactPhone && "supports-backdrop-filter:backdrop-blur-md"
      )}
    >
      <div className="flex h-(--app-bottom-nav-h) items-stretch px-1">
        {tabs.map((entry) => (
          <EntryTab
            key={entry.id}
            entry={entry}
            active={
              entry.id === PIPELINES_ENTRY_ID
                ? isPipelinesOpen || (activeTabId === entry.id && !isMoreOpen)
                : activeTabId === entry.id && !isMoreOpen && !isPipelinesOpen
            }
            pipelinesOpen={isPipelinesOpen}
            badge={getBadge(entry)}
            onToggleSheet={() =>
              isPipelinesOpen ? closeSheet() : openSheet("pipelines")
            }
            onNavigate={closeSheet}
          />
        ))}
        <TabButton
          icon={Menu}
          label={t("navigation.more")}
          active={isMoreActive}
          badge={overflowBadge}
          ariaLabel={t("navigation.moreAria")}
          expanded={isMoreOpen}
          onClick={handleMoreClick}
        />
      </div>
    </motion.nav>
  )
}

function EntryTab({
  entry,
  active,
  pipelinesOpen,
  badge,
  onToggleSheet,
  onNavigate,
}: {
  entry: NavEntry
  active: boolean
  pipelinesOpen: boolean
  badge: number
  onToggleSheet: () => void
  onNavigate: () => void
}) {
  const { t } = useTranslation()
  const label = t(entry.titleKey)

  // Pipelines não navega: escolher QUAL pipeline abrir é a ação. Sem quadros, não há
  // o que escolher, e a aba segue direto para a tela.
  if (entry.id === PIPELINES_ENTRY_ID && (entry.children?.length ?? 0) > 0) {
    return (
      <TabButton
        icon={entry.icon}
        label={label}
        active={active}
        badge={badge}
        ariaLabel={t("navigation.boardsAria")}
        expanded={pipelinesOpen}
        chevron
        onClick={onToggleSheet}
      />
    )
  }

  return (
    <TabLink
      to={entry.to ?? "/"}
      icon={entry.icon}
      label={label}
      active={active}
      badge={badge}
      onClick={onNavigate}
    />
  )
}

const TAB_CLASS =
  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"

function tabColor(active: boolean) {
  return active ? "text-accent-foreground" : "text-muted-foreground"
}

function TabContent({
  icon: Icon,
  label,
  active,
  badge,
  chevron = false,
  rotated = false,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  badge: number
  chevron?: boolean
  rotated?: boolean
}) {
  const reducedMotion = useReducedMotion()

  return (
    <>
      <span className="relative flex h-7 w-12 items-center justify-center">
        {active && (
          <motion.span
            layoutId={INDICATOR_LAYOUT_ID}
            transition={reducedMotion ? { duration: 0 } : spring}
            className="absolute inset-0 rounded-full bg-accent"
          />
        )}
        <Icon className="relative size-5" aria-hidden />
        {badge > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] leading-none font-semibold text-background tabular-nums"
          >
            {badge > MAX_VISIBLE_BADGE ? `${MAX_VISIBLE_BADGE}+` : badge}
          </span>
        )}
      </span>
      <span className="flex max-w-full items-center gap-0.5 px-0.5 text-[11px] leading-none font-medium">
        <span className="truncate">{label}</span>
        {chevron && (
          <ChevronUp
            className={cn(
              "size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
              rotated && "rotate-180"
            )}
            aria-hidden
          />
        )}
      </span>
    </>
  )
}

/** Ouvido por inteiro: o nome da área e, se houver, quantos alertas ela tem. */
function BadgeNote({ count }: { count: number }): ReactNode {
  const { t } = useTranslation()
  if (count <= 0) return null
  return <span className="sr-only">{t("navigation.alerts", { count })}</span>
}

function TabLink({
  to,
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  to: string
  icon: LucideIcon
  label: string
  active: boolean
  badge: number
  onClick: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(TAB_CLASS, tabColor(active))}
    >
      <TabContent icon={icon} label={label} active={active} badge={badge} />
      <BadgeNote count={badge} />
    </Link>
  )
}

function TabButton({
  icon,
  label,
  active,
  badge,
  ariaLabel,
  expanded,
  chevron = false,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  badge: number
  ariaLabel: string
  expanded: boolean
  chevron?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-current={active ? "page" : undefined}
      className={cn(TAB_CLASS, tabColor(active))}
    >
      <TabContent
        icon={icon}
        label={label}
        active={active}
        badge={badge}
        chevron={chevron}
        rotated={expanded}
      />
      <BadgeNote count={badge} />
    </button>
  )
}
