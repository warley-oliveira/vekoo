import { Fragment, useMemo } from "react"
import { Link } from "@/lib/router"
import { useTranslation } from "react-i18next"
import {
  ArrowLeftRight,
  Bell,
  Building2,
  ChevronDown,
  LogOut,
  Search,
  UserPlus,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import { OrganizationBadge } from "@/components/organizations/organization-badge"
import { useOrganizationSwitcher } from "@/hooks/organizations/use-organization-switcher"
import { AlertCount } from "@/components/shell/alert-count"
import { BottomSheet } from "@/components/shell/bottom-sheet"
import { CreditsSummary } from "@/components/shell/credits-summary"
import { FoldersSection } from "@/components/shell/sidebar-folders"
import { ThemeSegmented } from "@/components/shell/theme-picker"
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCan } from "@/hooks/use-can"
import { useMobileNav } from "@/hooks/use-mobile-nav"
import { useNavigation } from "@/hooks/use-navigation"
import { useSignOut } from "@/hooks/use-sign-out"
import { useAuth } from "@/lib/auth"
import { SUPPORTED_LANGUAGES, useLanguage } from "@/lib/i18n"
import {
  selectMobileTabs,
  type NavChild,
  type NavEntry,
} from "@/lib/navigation"
import { cn } from "@/lib/utils"

const TILE =
  "group/tile relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl py-2 text-center outline-none transition-transform duration-100 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transform-none"
const TILE_ICON =
  "relative flex size-11 items-center justify-center rounded-xl transition-colors"
const TILE_LABEL = "w-full text-[11px] leading-tight font-medium"
const SECTION_TITLE =
  "mb-1 px-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase"

/**
 * O painel "Mais": o que não coube na barra, a conta e os créditos. Navegar daqui usa
 * `replace`: a entrada que a folha empilhou no histórico vira a rota nova.
 */
export function MoreSheet({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { t } = useTranslation()
  const { groups, entries, activeEntry } = useNavigation()
  const open = useMobileNav((state) => state.activeSheet === "more")
  const closeSheet = useMobileNav((state) => state.closeSheet)

  const overflowIds = useMemo(() => {
    const { overflow } = selectMobileTabs(entries, activeEntry?.id ?? null)
    return new Set(overflow.map((entry) => entry.id))
  }, [entries, activeEntry])

  const sections = groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => overflowIds.has(entry.id)),
    }))
    .filter((group) => group.entries.length > 0)

  return (
    <BottomSheet
      open={open}
      onClose={closeSheet}
      title={t("navigation.moreTitle")}
      maxHeightRatio={0.88}
    >
      <div className="flex flex-col gap-4 pb-4">
        <AccountHeader />

        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-10 items-center gap-2.5 rounded-lg bg-muted px-3 text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          {t("navigation.search")}
        </button>

        {sections.map((section) => (
          <section key={section.id}>
            <h3 className={SECTION_TITLE}>{t(section.titleKey)}</h3>
            <EntryGrid entries={section.entries} />
            {section.id === "creation" && (
              <div className="mt-1">
                <FoldersSection onNavigate={closeSheet} replaceHistory />
              </div>
            )}
          </section>
        ))}

        <AccountSection />
      </div>
    </BottomSheet>
  )
}

function AccountHeader() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const organizationName = session?.organization.name ?? t("account.fallbackName")
  const closeSheet = useMobileNav((state) => state.closeSheet)
  const openSwitcher = useOrganizationSwitcher((state) => state.setOpen)

  return (
    <div className="rounded-xl border p-3">
      <div className="mb-3 flex items-center gap-2.5">
        <OrganizationBadge
          name={organizationName}
          logoUrl={session?.organization.logoUrl}
          className="size-9 text-sm"
        />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{organizationName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {session?.account.name}
          </p>
        </div>
        {/* O mesmo seletor da barra lateral, em modal: a folha fecha antes, para não empilhar. */}
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => {
            closeSheet()
            openSwitcher(true)
          }}
        >
          <ArrowLeftRight />
          {t("organizations.switcher.switch")}
        </Button>
      </div>
      <CreditsSummary />
    </div>
  )
}

function EntryGrid({ entries }: { entries: NavEntry[] }) {
  const { isActive, getBadge } = useNavigation()
  const expandedEntryId = useMobileNav((state) => state.expandedEntryId)
  const setExpandedEntry = useMobileNav((state) => state.setExpandedEntry)
  const closeSheet = useMobileNav((state) => state.closeSheet)
  const { t } = useTranslation()

  return (
    // Três colunas nos celulares estreitos: "Configurações" não tem onde quebrar.
    <div className="grid grid-cols-4 gap-1 max-[374px]:grid-cols-3">
      {entries.map((entry) => {
        const children = entry.children ?? []
        const expandable = children.length > 0
        const expanded = expandedEntryId === entry.id
        const active = isActive(entry)
        const badge = getBadge(entry)
        const label = t(entry.titleKey)

        const content = (
          <>
            <span
              className={cn(
                TILE_ICON,
                active
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <entry.icon className="size-5" aria-hidden />
              <AlertCount
                count={badge}
                className="absolute -top-1 -right-1 bg-destructive text-background"
              />
            </span>
            <span className={cn(TILE_LABEL, active && "text-accent-foreground")}>
              {label}
            </span>
          </>
        )

        return (
          <Fragment key={entry.id}>
            {expandable ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`more-${entry.id}`}
                onClick={() => setExpandedEntry(expanded ? null : entry.id)}
                className={TILE}
              >
                {content}
                <ChevronDown
                  className={cn(
                    "absolute top-1.5 right-1 size-3 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                    expanded && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
            ) : (
              <Link
                to={entry.to ?? "/"}
                replace
                onClick={closeSheet}
                aria-current={active ? "page" : undefined}
                className={TILE}
              >
                {content}
              </Link>
            )}
            {expandable && (
              <Collapsible open={expanded} className="col-span-full">
                <CollapsibleContent
                  id={`more-${entry.id}`}
                  className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
                >
                  <ul className="mb-1 flex flex-col gap-0.5 rounded-xl bg-muted/50 p-1">
                    {children.map((child) => (
                      <ChildRow key={child.id} child={child} />
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

function ChildRow({ child }: { child: NavChild }) {
  const { t } = useTranslation()
  const { isActive, getBadge } = useNavigation()
  const closeSheet = useMobileNav((state) => state.closeSheet)
  const active = isActive(child)

  return (
    <li>
      <Link
        to={child.to}
        replace
        onClick={closeSheet}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-2 rounded-lg px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          active
            ? "bg-accent font-medium text-accent-foreground"
            : "text-foreground hover:bg-muted"
        )}
      >
        <span className="flex-1 truncate">
          {child.title ?? t(child.titleKey ?? child.id)}
        </span>
        <AlertCount count={getBadge(child)} />
      </Link>
    </li>
  )
}

function AccountSection() {
  const { t, i18n } = useTranslation()
  const language = useLanguage()
  const canInvite = useCan("core_settings")
  const closeSheet = useMobileNav((state) => state.closeSheet)
  const signOut = useSignOut()

  return (
    <section>
      <h3 className={SECTION_TITLE}>{t("navigation.account")}</h3>
      <div className="flex flex-col gap-0.5">
        <AccountLink
          to="/settings/profile"
          icon={UserRound}
          label={t("navigation.routes.profile")}
          onClick={closeSheet}
        />
        <AccountLink
          to="/settings/notifications"
          icon={Bell}
          label={t("navigation.routes.notificationSettings")}
          onClick={closeSheet}
        />
        {canInvite && (
          <>
            <AccountLink
              to="/settings/organization"
              icon={Building2}
              label={t("people.organization.title")}
              onClick={closeSheet}
            />
            <AccountLink
              to="/settings/users?new=1"
              icon={UserPlus}
              label={t("account.invite")}
              onClick={closeSheet}
            />
          </>
        )}

        <div className="flex h-11 items-center justify-between gap-3 px-3">
          <span className="text-sm">{t("language.label")}</span>
          <ToggleGroup
            value={[language]}
            onValueChange={(values) => {
              const next = values[0]
              if (next) void i18n.changeLanguage(next)
            }}
            variant="outline"
            aria-label={t("language.label")}
          >
            {SUPPORTED_LANGUAGES.map((code) => (
              <ToggleGroupItem
                key={code}
                value={code}
                className="h-8 px-2.5 text-xs"
                aria-label={t(`language.${code}`)}
              >
                {t(`navigation.languageShort.${code}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex h-11 items-center justify-between gap-3 px-3">
          <span className="text-sm">{t("theme.label")}</span>
          <ThemeSegmented compact />
        </div>

        <button
          type="button"
          onClick={() => {
            closeSheet()
            signOut()
          }}
          className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LogOut className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {t("account.signOut")}
        </button>
      </div>
    </section>
  )
}

function AccountLink({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <Link
      to={to}
      replace
      onClick={onClick}
      className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {label}
    </Link>
  )
}
