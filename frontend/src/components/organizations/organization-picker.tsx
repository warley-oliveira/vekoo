import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { Building2, Check, ExternalLink, LifeBuoy, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { OrganizationBadge } from "@/components/organizations/organization-badge"
import { EmptyState, ErrorState, InlineError, LoadingRegion, SearchInput } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useSupportOrganizations,
  type SupportOrganization,
} from "@/hooks/organizations/use-support-organizations"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useIsTouch } from "@/hooks/use-media-query"
import { accountPath } from "@/lib/account-scope"
import { apiPost } from "@/lib/api"
import { useAuth, type AccountSummary, type OrganizationSummary } from "@/lib/auth"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { Link, useNavigate } from "@/lib/router"
import { matchesSearch, normalizeSearchText } from "@/lib/search-text"
import { cn } from "@/lib/utils"

/** A partir disto as organizações da pessoa ganham busca: até aqui, cabem numa olhada. */
const SEARCH_FROM = 6

const ITEM = "[data-picker-item]"

const NO_ACCOUNTS: AccountSummary[] = []

const ROW =
  "flex min-h-14 w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none aria-[current=true]:bg-muted/50"

export type OrganizationPickerProps = {
  /** Onde a lista mora: o fundo da busca presa no topo acompanha o do modal ou o da tela. */
  variant: "dialog" | "page"
  /** O caminho a abrir dentro da organização escolhida (`/chat`). */
  target: string
  /** Depois de trocar nesta aba (o modal fecha). */
  onNavigated?: () => void
  onCreate: () => void
}

/** Clique simples: os outros (Ctrl/⌘, Shift, botão do meio) são do navegador, ou abrem aba nova. */
function isPlainClick(event: ReactMouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/** A última usada primeiro; quem nunca abriu, por nome. */
function byLastUsed(a: AccountSummary, b: AccountSummary) {
  const seen = (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0)
  return seen !== 0 ? seen : a.organization.name.localeCompare(b.organization.name)
}

/**
 * O seletor de organização, um só: no modal (topo da barra lateral, "Trocar" no celular, Ctrl/⌘ +
 * Shift + O) e na tela `/organizations`. Cada pessoa vê as organizações em que tem vínculo ativo,
 * a última usada no topo e a atual marcada; o suporte do Vekoo vê também "Todas", as do sistema,
 * com busca no servidor e rolagem infinita.
 *
 * Teclado: setas, Home e End andam pela lista; Enter abre; digitar busca (ou, sem busca, pula para
 * o nome com aquela letra); Ctrl/⌘ + Enter, Ctrl/⌘ + clique e o botão do meio abrem numa aba nova.
 */
export function OrganizationPicker({ variant, target, onNavigated, onCreate }: OrganizationPickerProps) {
  const { t } = useTranslation()
  const { identity, session } = useAuth()
  const navigate = useNavigate()
  const preset = useMotionPreset()
  // Com dedo, o teclado virtual não sobe sozinho ao abrir (a mesma regra do `ResponsiveDialog`).
  const isTouch = useIsTouch()
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [entering, setEntering] = useState<string | null>(null)

  const user = identity?.user ?? session?.user
  const master = Boolean(user?.master)
  const accounts = identity?.accounts ?? session?.accounts ?? NO_ACCOUNTS
  const currentHashid = session?.account.hashid ?? null
  const currentOrganizationId = session?.organization.id ?? null
  const term = query.trim()
  const serverQuery = useDebouncedValue(term, 300)
  const showSearch = master || accounts.length >= SEARCH_FROM
  const all = useSupportOrganizations(serverQuery, master)

  // O vínculo de suporte não está entre os da pessoa: a organização em que o suporte está agora
  // entra no topo, marcada como atual. Quantas pessoas, só se "Todas" já trouxe essa organização.
  const supportAccount = session?.account.support ? session.account : null
  const supportOrganization = supportAccount ? session?.organization : null
  const supportCredits = session?.credits.left ?? 0
  const supportMembers = all.organizations.find((item) => item.id === supportOrganization?.id)?.membersCount ?? null
  const supportHere = useMemo<AccountSummary | null>(
    () =>
      supportAccount && supportOrganization
        ? {
            id: supportAccount.id,
            hashid: supportAccount.hashid,
            role: supportAccount.role,
            support: true,
            lastSeenAt: null,
            organization: {
              id: supportOrganization.id,
              name: supportOrganization.name,
              logoUrl: supportOrganization.logoUrl,
              plan: supportOrganization.plan,
              membersCount: supportMembers ?? -1,
              creditsLeft: supportCredits,
            },
          }
        : null,
    [supportAccount, supportOrganization, supportMembers, supportCredits]
  )

  const mine = useMemo(() => {
    const list = [...(supportHere ? [supportHere] : []), ...[...accounts].sort(byLastUsed)]
    return term ? list.filter((account) => matchesSearch(account.organization.name, term)) : list
  }, [accounts, supportHere, term])

  async function enterAsSupport(organization: SupportOrganization, newTab: boolean) {
    if (entering) return
    if (organization.id === currentOrganizationId && !newTab) {
      onNavigated?.()
      return
    }
    // A aba nova abre já, no gesto da pessoa: depois da resposta, o navegador a bloquearia.
    const tab = newTab ? window.open("", "_blank") : null
    if (tab) tab.opener = null
    setEntering(organization.id)
    try {
      const account = await apiPost<AccountSummary>(`/support/organizations/${organization.id}/enter`)
      const href = accountPath(account.hashid, target)
      if (tab) {
        tab.location.href = href
        return
      }
      toast(t("organizations.support.entered", { name: account.organization.name }))
      navigate(href)
      onNavigated?.()
    } catch {
      tab?.close()
      toast.error(t("organizations.support.enterFailed"))
    } finally {
      setEntering(null)
    }
  }

  function items(): HTMLElement[] {
    return Array.from(rootRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])
  }

  function searchBox(): HTMLInputElement | null {
    return rootRef.current?.querySelector<HTMLInputElement>("input[role='searchbox']") ?? null
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const list = items()
    const target = event.target as HTMLElement
    const inSearch = target.matches("input")
    const index = list.indexOf(target)

    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (inSearch) list[0]?.focus()
      else if (index === list.length - 1 && all.hasMore && !all.loadingMore) all.loadMore()
      else list[Math.min(index + 1, list.length - 1)]?.focus()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      if (index > 0) list[index - 1].focus()
      else if (index === 0) searchBox()?.focus()
    } else if ((event.key === "Home" || event.key === "End") && !inSearch) {
      event.preventDefault()
      list[event.key === "Home" ? 0 : list.length - 1]?.focus()
    } else if (event.key === "Enter" && inSearch && term) {
      event.preventDefault()
      list[0]?.click()
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !inSearch) {
      const search = searchBox()
      // O foco muda antes de a tecla chegar: a letra cai no campo de busca.
      if (search) search.focus()
      else typeahead(list, index, event.key)
    }
  }

  function typeahead(list: HTMLElement[], from: number, key: string) {
    const letter = normalizeSearchText(key)
    const ordered = [...list.slice(from + 1), ...list.slice(0, from + 1)]
    ordered.find((item) => normalizeSearchText(item.dataset.name ?? "").startsWith(letter))?.focus()
  }

  const noAccounts = accounts.length === 0 && !supportHere

  return (
    <div ref={rootRef} onKeyDown={onKeyDown} className="flex flex-col gap-5">
      {showSearch && (
        <div
          className={cn(
            "sticky top-0 z-10 pb-1",
            variant === "dialog" ? "-mx-4 bg-popover px-4 pt-1" : "bg-background px-3 pt-2"
          )}
        >
          <SearchInput
            value={query}
            onChange={setQuery}
            debounce={0}
            shortcut={false}
            loading={all.searching}
            autoFocus={variant === "dialog" && !isTouch}
            placeholder={t(master ? "organizations.picker.searchAll" : "organizations.searchPlaceholder")}
          />
        </div>
      )}

      {noAccounts && !master ? (
        <EmptyState
          icon={<Building2 />}
          title={t("organizations.empty.title")}
          description={t("organizations.empty.description")}
          action={{ label: t("organizations.create.open"), onClick: onCreate }}
        />
      ) : master && noAccounts && term ? null : (
        <PickerSection
          title={master ? t("organizations.picker.mine") : null}
          count={master ? mine.length : null}
        >
          {mine.length === 0 && term ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {t(master ? "organizations.picker.mineNoMatch" : "organizations.noMatch")}
            </p>
          ) : mine.length === 0 && master ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("organizations.picker.mineEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              <AnimatePresence initial={false}>
                {mine.map((account) => (
                  <motion.li key={account.hashid} {...preset.listItem} className="group/row relative">
                    <MineRow
                      account={account}
                      current={account.hashid === currentHashid}
                      href={accountPath(account.hashid, target)}
                      onNavigated={onNavigated}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          {!term && (
            <button type="button" data-picker-item data-name="" onClick={onCreate} className={cn(ROW, "min-h-12")}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                <Plus className="size-4" aria-hidden />
              </span>
              <span className="text-sm font-medium">{t("organizations.create.open")}</span>
            </button>
          )}
        </PickerSection>
      )}

      {master && (
        <PickerSection
          title={t("organizations.picker.all")}
          count={all.total}
          icon={<LifeBuoy className="size-3.5 text-primary" aria-hidden />}
          hint={t("organizations.picker.allHint")}
        >
          {all.loading ? (
            <RowsSkeleton rows={5} />
          ) : all.error && all.organizations.length === 0 ? (
            <ErrorState error={all.error} onRetry={all.retry} className="py-6" />
          ) : all.organizations.length === 0 ? (
            <EmptyState icon={<Building2 />} title={t("organizations.support.empty")} className="py-6" />
          ) : (
            <>
              <ul className="flex flex-col gap-0.5">
                {all.organizations.map((organization) => (
                  <li key={organization.id}>
                    <SupportRow
                      organization={organization}
                      current={organization.id === currentOrganizationId}
                      entering={entering === organization.id}
                      disabled={entering !== null}
                      onEnter={(newTab) => void enterAsSupport(organization, newTab)}
                    />
                  </li>
                ))}
              </ul>
              {all.loadingMore ? (
                <RowsSkeleton rows={3} />
              ) : all.error ? (
                <InlineError onRetry={all.loadMore} />
              ) : all.hasMore ? (
                <LoadMoreSentinel onVisible={all.loadMore} />
              ) : null}
            </>
          )}
        </PickerSection>
      )}
    </div>
  )
}

function PickerSection({
  title,
  count,
  icon,
  hint,
  children,
}: {
  title: string | null
  count: number | null
  icon?: ReactNode
  hint?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  return (
    <section className="flex flex-col gap-1">
      {title && (
        <header className="flex flex-col gap-0.5 px-3 pb-1">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {icon}
            <span>
              {title}
              {count !== null && (
                <span className="tabular-nums" aria-label={t("organizations.picker.count", { count })}>
                  {` · ${formatNumber(count, language)}`}
                </span>
              )}
            </span>
          </h3>
          {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * Pessoas, plano e créditos, numa linha discreta abaixo do nome. `membersCount` negativo é "não
 * sabemos" (a organização do suporte antes de "Todas" chegar) e fica de fora.
 */
function useOrganizationFacts(organization: Omit<OrganizationSummary, "id" | "name" | "logoUrl">) {
  const { t } = useTranslation()
  const language = useLanguage()
  return [
    ...(organization.membersCount >= 0
      ? [t("organizations.picker.members", { count: organization.membersCount })]
      : []),
    t(`plans.${organization.plan}`, { defaultValue: organization.plan }),
    t("organizations.picker.credits", {
      count: organization.creditsLeft,
      value: formatNumber(organization.creditsLeft, language),
    }),
  ]
}

function RowText({ name, facts, title }: { name: string; facts: string[]; title?: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5" title={title}>
      <span className="truncate text-sm font-medium text-foreground">{name}</span>
      <span className="truncate text-xs text-muted-foreground">{facts.join(" · ")}</span>
    </span>
  )
}

function CurrentMark() {
  const { t } = useTranslation()
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
      <Check className="size-4" aria-hidden />
      <span className="max-sm:sr-only">{t("organizations.picker.current")}</span>
    </span>
  )
}

function MineRow({
  account,
  current,
  href,
  onNavigated,
}: {
  account: AccountSummary
  current: boolean
  href: string
  onNavigated?: () => void
}) {
  const { t } = useTranslation()
  const { organization } = account
  const role = account.support ? t("organizations.support.badge") : t(`organizations.roles.${account.role}`)
  const facts = [role, ...useOrganizationFacts(organization)]

  return (
    <>
      <Link
        to={href}
        data-picker-item
        data-name={organization.name}
        aria-current={current ? "true" : undefined}
        aria-label={current ? t("organizations.switcher.current", { name: organization.name }) : undefined}
        onClick={(event) => {
          if (!isPlainClick(event)) return
          // A atual não recarrega a tela: só fecha.
          if (current) event.preventDefault()
          onNavigated?.()
        }}
        className={cn(ROW, !current && "md:pr-12")}
      >
        <span className="relative shrink-0">
          <OrganizationBadge name={organization.name} logoUrl={organization.logoUrl} className="size-9 text-sm" />
          {account.support && (
            <LifeBuoy
              className="absolute -right-1 -bottom-1 size-4 rounded-full bg-popover p-0.5 text-primary"
              aria-hidden
            />
          )}
        </span>
        <RowText name={organization.name} facts={facts} />
        {current && <CurrentMark />}
      </Link>
      {!current && (
        <a
          href={href}
          target="_blank"
          rel="noopener"
          tabIndex={-1}
          aria-label={t("organizations.openInNewTab", { name: organization.name })}
          title={t("organizations.openInNewTab", { name: organization.name })}
          className="absolute top-1/2 right-2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-background hover:text-foreground md:flex"
        >
          <ExternalLink className="size-4" aria-hidden />
        </a>
      )}
    </>
  )
}

function SupportRow({
  organization,
  current,
  entering,
  disabled,
  onEnter,
}: {
  organization: SupportOrganization
  current: boolean
  entering: boolean
  disabled: boolean
  onEnter: (newTab: boolean) => void
}) {
  const { t } = useTranslation()
  const owner = organization.owner
  const facts = [owner ? owner.name : t("organizations.support.noOwner"), ...useOrganizationFacts(organization)]

  return (
    <button
      type="button"
      data-picker-item
      data-name={organization.name}
      aria-current={current ? "true" : undefined}
      aria-busy={entering || undefined}
      disabled={disabled && !entering}
      onClick={(event) => onEnter(!isPlainClick(event) && (event.ctrlKey || event.metaKey))}
      onMouseDown={(event) => {
        // O botão do meio não liga a rolagem automática do navegador.
        if (event.button === 1) event.preventDefault()
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return
        event.preventDefault()
        onEnter(true)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          event.stopPropagation()
          onEnter(true)
        }
      }}
      className={ROW}
    >
      <OrganizationBadge name={organization.name} logoUrl={organization.logoUrl} className="size-9 text-sm" />
      <RowText name={organization.name} facts={facts} title={owner ? `${owner.name} · ${owner.email}` : undefined} />
      {entering ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label={t("organizations.picker.entering")} />
      ) : current ? (
        <CurrentMark />
      ) : null}
    </button>
  )
}

/** Esqueleto no formato da linha: logo quadrado, nome e a linha de detalhes. */
function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <LoadingRegion className="flex flex-col gap-0.5">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-3 px-3 py-2">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className={cn("h-3.5", index % 2 ? "w-2/5" : "w-1/2")} />
            <Skeleton className={cn("h-3", index % 2 ? "w-3/5" : "w-2/3")} />
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

/** Chegou perto do fim da lista: pede a próxima página (a rolagem do modal ou da tela). */
function LoadMoreSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const callback = useRef(onVisible)
  useEffect(() => {
    callback.current = onVisible
  })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && callback.current(), {
      rootMargin: "240px 0px",
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} aria-hidden className="h-px" />
}
