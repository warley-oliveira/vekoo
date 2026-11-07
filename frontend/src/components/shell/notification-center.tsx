import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import {
  Bell,
  BellRing,
  CalendarClock,
  CheckCheck,
  Gift,
  MessageCircle,
  Settings2,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { InlineError } from "@/components/error-state"
import { BottomSheet } from "@/components/shell/bottom-sheet"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMobileNav } from "@/hooks/use-mobile-nav"
import { useMobileShell } from "@/hooks/use-mobile-shell"
import {
  NOTIFICATIONS_MAX_PER_PAGE,
  NOTIFICATIONS_PAGE_SIZE,
  useNotificationMutations,
  useNotifications,
  useNotificationsChannel,
  type NotificationsTab,
} from "@/hooks/use-notifications"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import type { AppNotification, NotificationAction } from "@/lib/types"
import { cn } from "@/lib/utils"
import { usePersistentState } from "@/lib/view-prefs"

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  chat: MessageCircle,
  calendar: CalendarClock,
  system: Settings2,
  general: Gift,
}

/** Como na API: aviso do produto conta como `system`. Desconhecida vira `general`. */
function categoryOf(notification: AppNotification): string {
  const category = notification.category ?? (notification.key ? "system" : "general")
  return category in CATEGORY_ICONS ? category : "general"
}

/** Os avisos do produto chegam só com a chave: é aqui que eles ganham para onde levar. */
const KEY_URLS: Record<string, string> = {
  welcome: "/carousels",
  folders: "/carousels",
  templates: "/templates",
}

function isExternalUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")
}

/**
 * O sino e o centro de avisos. Um corpo só, em dois contêineres: `Popover` no desktop e
 * folha de baixo no celular. Montado uma vez por casca: é aqui que o canal de avisos é
 * assinado.
 */
export function NotificationCenter() {
  const { t } = useTranslation()
  const { isMobileShell } = useMobileShell()
  const { unread } = useNotifications()
  useNotificationsChannel()

  const sheetOpen = useMobileNav((state) => state.activeSheet === "notifications")
  const openSheet = useMobileNav((state) => state.openSheet)
  const closeSheet = useMobileNav((state) => state.closeSheet)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const label =
    unread > 0
      ? t("navigation.notifications.ariaUnread", { count: unread })
      : t("navigation.notifications.title")

  const badge =
    unread > 0 ? (
      <span
        aria-hidden
        className="absolute -top-px -right-px flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-background lg:top-0 lg:right-0"
      >
        {unread > 9 ? "9+" : unread}
      </span>
    ) : null

  if (isMobileShell) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-10 text-muted-foreground"
          aria-label={label}
          onClick={() => openSheet("notifications")}
        >
          <Bell className="size-5" />
          {badge}
        </Button>
        <BottomSheet
          open={sheetOpen}
          onClose={closeSheet}
          title={t("navigation.notifications.title")}
          maxHeightRatio={0.85}
          bodyClassName="px-0"
        >
          <NotificationPanel fill onDone={closeSheet} />
        </BottomSheet>
      </>
    )
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground"
            aria-label={label}
          />
        }
      >
        <Bell />
        {badge}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(25rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
      >
        <NotificationPanel onDone={() => setPopoverOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

function NotificationPanel({
  fill = false,
  onDone,
}: {
  /** Na folha do celular, a lista ocupa o que houver em vez de ter teto próprio. */
  fill?: boolean
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<NotificationsTab>("all")
  const [perPage, setPerPage] = useState(NOTIFICATIONS_PAGE_SIZE)
  const { notifications, unread, hasMore, isLoading, error, reload } =
    useNotifications(tab, perPage)
  const { readAll } = useNotificationMutations()

  // Lida ao clicar sai da aba "Não lidas" na hora, sem esperar a nova leitura.
  const visible = (notifications ?? []).filter(
    (notification) => tab !== "unread" || !notification.read
  )

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
        <h2 className="font-heading text-base font-semibold tracking-tight">
          {t("navigation.notifications.title")}
        </h2>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:h-10"
            disabled={unread === 0}
            onClick={() => void readAll().catch(() => {})}
          >
            <CheckCheck /> {t("navigation.notifications.markAllRead")}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground pointer-coarse:size-10"
            nativeButton={false}
            onClick={onDone}
            render={
              <Link
                to="/settings/notifications"
                aria-label={t("navigation.routes.notificationSettings")}
              />
            }
          >
            <SlidersHorizontal />
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as NotificationsTab)
          setPerPage(NOTIFICATIONS_PAGE_SIZE)
        }}
        className="border-b px-3"
      >
        <TabsList variant="line" className="h-9 w-full justify-start gap-1">
          <TabsTrigger value="all" className="flex-none px-1.5">
            {t("navigation.notifications.tabs.all")}
          </TabsTrigger>
          <TabsTrigger value="unread" className="flex-none px-1.5">
            {t("navigation.notifications.tabs.unread")}
            {unread > 0 && (
              <span className="ml-0.5 text-xs text-muted-foreground tabular-nums">
                {unread}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" className="flex-none px-1.5">
            {t("navigation.notifications.tabs.archived")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div
        className={cn(
          "min-h-44 overflow-y-auto overscroll-contain",
          !fill && "max-h-[min(26rem,60dvh)]"
        )}
      >
        {isLoading && !notifications ? (
          <NotificationsSkeleton />
        ) : error && !notifications ? (
          <div className="p-2">
            <InlineError onRetry={reload} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyInbox tab={tab} />
        ) : (
          <>
            <ul>
              {visible.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onDone={onDone}
                />
              ))}
            </ul>
            {hasMore && perPage < NOTIFICATIONS_MAX_PER_PAGE && (
              <div className="border-t p-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground pointer-coarse:h-10"
                  onClick={() => setPerPage(NOTIFICATIONS_MAX_PER_PAGE)}
                >
                  {t("navigation.notifications.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <PushPrompt />
    </div>
  )
}

function NotificationRow({
  notification,
  onDone,
}: {
  notification: AppNotification
  onDone: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const { read: markRead, dismiss } = useNotificationMutations()

  const category = categoryOf(notification)
  const Icon = CATEGORY_ICONS[category]
  const title =
    notification.title ??
    (notification.key ? t(`notifications.${notification.key}.title`) : "")
  const description =
    notification.description ??
    (notification.key ? t(`notifications.${notification.key}.body`) : "")
  // Arquivar de novo o que já está arquivado não existe.
  const actions = (notification.actions ?? []).filter(
    (action) => action.action !== "dismiss" || !notification.archivedAt
  )

  function markAsRead() {
    if (!notification.read) void markRead(notification.id).catch(() => {})
  }

  function openUrl(url: string) {
    onDone()
    if (isExternalUrl(url)) {
      window.open(url, "_blank", "noopener,noreferrer")
    } else {
      navigate(url)
    }
  }

  function handleClick() {
    markAsRead()
    const url = notification.url ?? (notification.key ? KEY_URLS[notification.key] : undefined)
    if (url) openUrl(url)
  }

  function handleAction(action: NotificationAction) {
    if (action.action === "dismiss") {
      void dismiss(notification).catch(() => {})
      return
    }
    markAsRead()
    if (action.urlPath) openUrl(action.urlPath)
  }

  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-sm leading-snug",
              notification.read
                ? "text-muted-foreground"
                : "font-medium text-foreground"
            )}
          >
            {title}
          </span>
          {description && (
            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
              {description}
            </span>
          )}
          <span className="mt-1 block text-xs text-muted-foreground/80">
            {formatRelative(notification.at, language)}
            {" · "}
            {t(`navigation.notifications.categories.${category}`)}
          </span>
        </span>
        {!notification.read && (
          <>
            <span
              aria-hidden
              className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
            />
            <span className="sr-only">{t("navigation.notifications.unread")}</span>
          </>
        )}
      </button>
      {/* Fora do botão da linha: botão dentro de botão não existe em HTML. Alinhado ao
          texto, depois do ícone (px-4 + size-8 + gap-3). */}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pr-4 pb-3 pl-15">
          {actions.map((action) => (
            <Button
              key={`${action.action}-${action.title}`}
              size="sm"
              variant={action.action === "dismiss" ? "ghost" : "outline"}
              className={cn(
                "pointer-coarse:h-10",
                action.action === "dismiss" && "text-muted-foreground"
              )}
              onClick={() => handleAction(action)}
            >
              {action.title}
            </Button>
          ))}
        </div>
      )}
    </li>
  )
}

function NotificationsSkeleton() {
  return (
    <div aria-hidden className="space-y-4 p-4">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyInbox({ tab }: { tab: NotificationsTab }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
      <Bell className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">
        {t(`navigation.notifications.empty.${tab}`)}
      </p>
    </div>
  )
}

/**
 * O momento com contexto para pedir a permissão do navegador: a pessoa abriu os avisos
 * e vê o que está oferecendo. Nunca ao carregar a página, e um "agora não" vale.
 */
function PushPrompt() {
  const { t } = useTranslation()
  const { isAvailable, permission, isLoading, subscribe } = usePushNotifications()
  const [answer, setAnswer] = usePersistentState<"pending" | "dismissed">(
    "vekoo.push.prompt",
    "pending"
  )

  if (!isAvailable || permission !== "default" || answer === "dismissed") return null

  async function enable() {
    const subscribed = await subscribe()
    if (subscribed) toast(t("navigation.push.enabledToast"))
    else toast(t("navigation.push.failedToast"))
  }

  return (
    <div className="flex items-start gap-3 border-t bg-muted/40 px-4 py-3">
      <BellRing className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-medium">
          {t("navigation.push.title")}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {t("navigation.push.description")}
        </p>
        <div className="mt-2 flex gap-1.5">
          <Button
            size="sm"
            className="pointer-coarse:h-10"
            disabled={isLoading}
            onClick={() => void enable()}
          >
            {t("navigation.push.enable")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-10"
            onClick={() => setAnswer("dismissed")}
          >
            {t("navigation.push.notNow")}
          </Button>
        </div>
      </div>
    </div>
  )
}
