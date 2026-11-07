import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  ChevronDown,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  MapPin,
  Phone,
  SearchX,
  Star,
  Store,
} from "lucide-react"
import { toast } from "@/lib/campaigns-wizard/notify"

import {
  Callout,
  EmptyState,
  ErrorState,
  KeyValueList,
  ListSkeleton,
  NumberInput,
  ResponsiveDialog,
  SearchInput,
  SegmentedControl,
  SelectInput,
  SidePanel,
  TablePagination,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useRecipientImport } from "@/hooks/campaigns-wizard/use-recipient-import"
import { useApi } from "@/hooks/use-api"
import { useCan } from "@/hooks/use-can"
import { useChannel } from "@/hooks/use-channel"
import { ApiError, apiGet, apiPost, type PaginationMeta } from "@/lib/api"
import { hasPhone, placeKey, placePhone, placeToContact, REVIEW_SORTS } from "@/lib/campaigns-wizard/places"
import type {
  PlaceChannelEvent,
  PlaceContact,
  PlaceExtraction,
  PlaceResult,
} from "@/lib/campaigns-wizard/types"
import { formatNumber } from "@/lib/format-number"
import { formatPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { SendingProgress } from "./column-mapping"

const RESULTS_PER_PAGE = 10
const EXISTING_PER_PAGE = 25
/** O canal não recupera evento perdido: enquanto a busca roda, confere de vez em quando. */
const POLL_MS = 8000

type Tab = "search" | "existing"
type SearchPhase = "form" | "running" | "results"

function PlaceRow({
  place,
  selected,
  onToggle,
  onDetails,
}: {
  place: PlaceResult
  selected: boolean
  onToggle: () => void
  onDetails: () => void
}) {
  const { t } = useTranslation()
  const phone = placePhone(place)
  const withPhone = hasPhone(place)

  return (
    <li className={cn("flex items-center gap-1 pr-1 transition-colors", selected && "bg-primary/5")}>
      <label
        className={cn(
          "flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2",
          !withPhone && "cursor-not-allowed opacity-60"
        )}
      >
        <Checkbox
          checked={selected}
          disabled={!withPhone}
          onCheckedChange={onToggle}
          aria-label={t("campaignsWizard.places.select", { name: place.title })}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{place.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[
              place.categoryName,
              place.city,
              // O mesmo lugar pode ter sido encontrado em duas buscas: diz de qual veio.
              "extractionQuery" in place ? (place as PlaceContact).extractionQuery : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            {place.totalScore ? (
              <span className="inline-flex items-center gap-0.5">
                <Star aria-hidden className="size-3" />
                {place.totalScore}
              </span>
            ) : null}
            <span className="truncate">
              {withPhone ? formatPhone(phone) : t("campaignsWizard.places.noPhone")}
            </span>
          </span>
        </span>
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground pointer-coarse:size-10"
        aria-label={t("campaignsWizard.places.details", { name: place.title })}
        onClick={onDetails}
      >
        <Info />
      </Button>
    </li>
  )
}

function ExternalValue({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
    >
      {children}
      <ExternalLink aria-hidden className="size-3" />
    </a>
  )
}

function PlaceDetails({ place, onClose }: { place: PlaceResult | null; onClose: () => void }) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <ResponsiveDialog
      open={place !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={place?.title ?? ""}
      description={place?.categoryName || undefined}
      size="md"
    >
      {place ? (
        <div className="flex flex-col gap-4">
          {place.imageUrl ? (
            <img src={place.imageUrl} alt="" loading="lazy" className="max-h-40 w-full rounded-lg object-cover" />
          ) : null}
          <KeyValueList
            items={[
              ...(place.address
                ? [{ label: t("campaignsWizard.places.fields.address"), value: place.address }]
                : []),
              ...(hasPhone(place)
                ? [{ label: t("campaignsWizard.places.fields.phone"), value: formatPhone(placePhone(place)) }]
                : []),
              ...(place.totalScore
                ? [
                    {
                      label: t("campaignsWizard.places.fields.rating"),
                      value: t("campaignsWizard.places.ratingValue", {
                        score: place.totalScore,
                        count: place.reviewsCount ?? 0,
                        formatted: formatNumber(place.reviewsCount ?? 0, language),
                      }),
                    },
                  ]
                : []),
              ...(place.website
                ? [
                    {
                      label: t("campaignsWizard.places.fields.website"),
                      value: <ExternalValue href={place.website}>{place.website}</ExternalValue>,
                    },
                  ]
                : []),
              ...(place.instagram
                ? [
                    {
                      label: t("campaignsWizard.places.fields.instagram"),
                      value: <ExternalValue href={place.instagram}>{place.instagram}</ExternalValue>,
                    },
                  ]
                : []),
              ...(place.facebook
                ? [
                    {
                      label: t("campaignsWizard.places.fields.facebook"),
                      value: <ExternalValue href={place.facebook}>{place.facebook}</ExternalValue>,
                    },
                  ]
                : []),
              ...(place.url
                ? [
                    {
                      label: t("campaignsWizard.places.fields.map"),
                      value: <ExternalValue href={place.url}>{t("campaignsWizard.places.openMap")}</ExternalValue>,
                    },
                  ]
                : []),
            ]}
          />
          {place.openingHours.length > 0 ? (
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">{t("campaignsWizard.places.fields.hours")}</h3>
              <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                {place.openingHours.map((entry) => (
                  <li key={entry.day} className="flex justify-between gap-4">
                    <span>{entry.day}</span>
                    <span className="tabular-nums">{entry.hours}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </ResponsiveDialog>
  )
}

type SearchForm = {
  query: string
  location: string
  maxPlaces: number
  minScore: number
  categoryFilter: string
  reviewsSort: string | null
  skipClosed: boolean
}

const EMPTY_FORM: SearchForm = {
  query: "",
  location: "",
  maxPlaces: 100,
  minScore: 0,
  categoryFilter: "",
  reviewsSort: null,
  skipClosed: false,
}

/**
 * Busca de estabelecimentos: procurar por tipo e cidade, acompanhar a busca e escolher quem entra, ou
 * reaproveitar o que já foi encontrado antes. Sem a chave do Apify, a busca nova explica o que falta, e o
 * que já foi encontrado continua valendo.
 */
export default function PlacesPanel({ available, onClose }: { available: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const canConfigure = useCan("core_settings")
  const sender = useRecipientImport()

  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<Tab>(available ? "search" : "existing")
  const [form, setForm] = useState(EMPTY_FORM)
  const [phase, setPhase] = useState<SearchPhase>("form")
  const [runStatus, setRunStatus] = useState<PlaceExtraction["status"]>("pending")
  const [searchError, setSearchError] = useState<string | null>(null)
  const [results, setResults] = useState<PlaceResult[]>([])
  const [resultsFilter, setResultsFilter] = useState("")
  const [resultsPage, setResultsPage] = useState(1)
  const [selected, setSelected] = useState(new Map<string, PlaceResult>())
  const [existingQuery, setExistingQuery] = useState("")
  const [existingPage, setExistingPage] = useState(1)
  const [details, setDetails] = useState<PlaceResult | null>(null)
  const [includeCountryCode, setIncludeCountryCode] = useState(true)

  const extractionRef = useRef<string | null>(null)
  const sending = sender.state.phase !== "idle" && sender.state.phase !== "done"

  useEffect(() => {
    if (sender.state.phase !== "done") return

    const { imported, skipped, invalid } = sender.state
    toast.success(
      t("campaignsWizard.import.done", { count: imported, formatted: formatNumber(imported, language) }),
      skipped + invalid > 0
        ? {
            description: t("campaignsWizard.import.doneDetail", {
              skipped: formatNumber(skipped, language),
              invalid: formatNumber(invalid, language),
            }),
          }
        : undefined
    )
    setOpen(false)
    onClose()
  }, [language, onClose, sender.state, t])

  const finish = useCallback(
    async (id: string) => {
      try {
        const response = await apiGet<{ results: PlaceResult[] }>(`/place-extractions/${id}/results`)
        if (extractionRef.current !== id) return

        extractionRef.current = null
        if (response.results.length === 0) {
          setSearchError(t("campaignsWizard.places.noResultsFound"))
          setPhase("form")
          return
        }
        setResults(response.results)
        setResultsPage(1)
        setPhase("results")
      } catch {
        extractionRef.current = null
        setSearchError(t("campaignsWizard.places.searchFailed"))
        setPhase("form")
      }
    },
    [t]
  )

  const fail = useCallback(
    (message: string | null) => {
      extractionRef.current = null
      setSearchError(message ?? t("campaignsWizard.places.searchFailed"))
      setPhase("form")
    },
    [t]
  )

  useChannel<PlaceChannelEvent>(phase === "running" ? "PlaceExtractionChannel" : null, undefined, (event) => {
    if (event.data.id !== extractionRef.current) return

    if (event.action === "extraction_completed" || event.data.status === "completed") {
      void finish(event.data.id)
    } else if (event.data.status === "failed") {
      fail(event.data.errorMessage)
    } else {
      setRunStatus(event.data.status)
    }
  })

  useEffect(() => {
    if (phase !== "running") return

    const timer = window.setInterval(() => {
      const id = extractionRef.current
      if (!id) return

      void apiGet<{ extraction: PlaceExtraction }>(`/place-extractions/${id}`)
        .then(({ extraction }) => {
          if (extraction.status === "completed") void finish(id)
          else if (extraction.status === "failed") fail(extraction.errorMessage)
          else setRunStatus(extraction.status)
        })
        .catch(() => {})
    }, POLL_MS)

    return () => window.clearInterval(timer)
  }, [fail, finish, phase])

  async function startSearch() {
    if (!form.query.trim()) return

    setSearchError(null)
    setResults([])
    setSelected(new Map())
    setRunStatus("pending")
    setPhase("running")
    try {
      const { extraction } = await apiPost<{ extraction: PlaceExtraction }>("/place-extractions", {
        searchQuery: form.query.trim(),
        location: form.location.trim() || undefined,
        maxPlaces: form.maxPlaces,
        language: "pt-BR",
        ...(form.minScore > 0 ? { minScore: form.minScore } : {}),
        ...(form.categoryFilter.trim() ? { categoryFilter: form.categoryFilter.trim() } : {}),
        ...(form.reviewsSort ? { reviewsSort: form.reviewsSort } : {}),
        ...(form.skipClosed ? { skipClosedPlaces: true } : {}),
      })
      extractionRef.current = extraction.id
      setRunStatus(extraction.status)
    } catch (error) {
      setPhase("form")
      setSearchError(
        error instanceof ApiError && error.serverMessage
          ? error.serverMessage
          : t("campaignsWizard.places.searchFailed")
      )
    }
  }

  /* ---------- já encontrados ---------- */

  const existingParams = new URLSearchParams({
    page: String(existingPage),
    perPage: String(EXISTING_PER_PAGE),
  })
  if (existingQuery.trim()) existingParams.set("search", existingQuery.trim())

  const existing = useApi<{ contacts: PlaceContact[]; meta: PaginationMeta }>(
    tab === "existing" ? `/place-extractions/contacts?${existingParams}` : null,
    { keepPreviousData: true, revalidateOnFocus: false }
  )

  /* ---------- seleção ---------- */

  const toggle = useCallback((place: PlaceResult) => {
    const key = placeKey(place)
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(key)) next.delete(key)
      else next.set(key, place)
      return next
    })
  }, [])

  const visibleResults = useMemo(
    () =>
      results.filter(
        (place) =>
          !resultsFilter.trim() ||
          matchesSearch(place.title, resultsFilter) ||
          matchesSearch(place.address, resultsFilter) ||
          matchesSearch(place.categoryName, resultsFilter) ||
          matchesSearch(place.phone, resultsFilter)
      ),
    [results, resultsFilter]
  )
  const resultsPages = Math.max(1, Math.ceil(visibleResults.length / RESULTS_PER_PAGE))
  const pagedResults = visibleResults.slice(
    (resultsPage - 1) * RESULTS_PER_PAGE,
    resultsPage * RESULTS_PER_PAGE
  )

  const scope: PlaceResult[] =
    tab === "existing" ? (existing.data?.contacts ?? []) : visibleResults
  const selectable = scope.filter(hasPhone)
  const allSelected = selectable.length > 0 && selectable.every((place) => selected.has(placeKey(place)))
  const someSelected = !allSelected && selectable.some((place) => selected.has(placeKey(place)))

  function toggleAll() {
    setSelected((current) => {
      const next = new Map(current)
      for (const place of selectable) {
        if (allSelected) next.delete(placeKey(place))
        else next.set(placeKey(place), place)
      }
      return next
    })
  }

  const count = selected.size

  function add() {
    const contacts = [...selected.values()]
      .filter(hasPhone)
      .map((place) => placeToContact(place, includeCountryCode))

    void sender.start(contacts.length, (offset, size) =>
      Promise.resolve(contacts.slice(offset, offset + size))
    )
  }

  async function close() {
    if (sender.state.phase === "sending") {
      const stop = await confirm({
        title: t("campaignsWizard.import.stopTitle"),
        description: t("campaignsWizard.import.stopHint", {
          sent: formatNumber(sender.state.sent, language),
        }),
        confirmLabel: t("campaignsWizard.import.stop"),
        cancelLabel: t("campaignsWizard.import.keepGoing"),
        destructive: true,
      })
      if (!stop) return
      sender.stop()
    } else if (count > 0) {
      const leave = await confirm({
        title: t("campaignsWizard.places.discardTitle"),
        description: t("campaignsWizard.places.discardHint"),
        confirmLabel: t("campaignsWizard.places.discard"),
        cancelLabel: t("campaignsWizard.places.keep"),
        destructive: true,
      })
      if (!leave) return
    }
    setOpen(false)
    onClose()
  }

  // Nos já encontrados a seleção é da página: a lista inteira pode ter milhares.
  const severalPages = tab === "existing" && (existing.data?.meta.totalPages ?? 1) > 1
  const selectAllLabel = t(
    severalPages ? "campaignsWizard.places.selectAllPage" : "campaignsWizard.places.selectAll",
    { count: selectable.length, formatted: formatNumber(selectable.length, language) }
  )

  const selectAllRow = (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      <Checkbox
        checked={allSelected}
        indeterminate={someSelected}
        onCheckedChange={toggleAll}
        aria-label={selectAllLabel}
      />
      <span className="font-medium">{selectAllLabel}</span>
    </label>
  )

  const update = <K extends keyof SearchForm>(key: K, value: SearchForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  return (
    <>
      <SidePanel
        open={open}
        onOpenChange={(next) => {
          if (!next) void close()
        }}
        size="xl"
        title={t("campaignsWizard.places.title")}
        description={t("campaignsWizard.places.description")}
        disablePointerDismissal={count > 0 || sending}
        footer={
          sending ? undefined : tab === "search" && phase === "form" ? (
            <Button
              type="button"
              disabled={!available || !form.query.trim()}
              className="pointer-coarse:h-10"
              onClick={() => void startSearch()}
            >
              {t("campaignsWizard.places.search")}
            </Button>
          ) : (tab === "search" && phase === "results") || tab === "existing" ? (
            <>
              <p className="min-w-0 flex-1 self-center text-sm text-muted-foreground" aria-live="polite">
                {t("campaignsWizard.places.selected", {
                  count,
                  formatted: formatNumber(count, language),
                })}
              </p>
              <Button type="button" disabled={count === 0} className="pointer-coarse:h-10" onClick={add}>
                {t("campaignsWizard.places.add", {
                  count,
                  formatted: formatNumber(count, language),
                })}
              </Button>
            </>
          ) : undefined
        }
      >
        {sending ? (
          <SendingProgress state={sender.state} onStop={sender.stop} onResume={() => void sender.resume()} />
        ) : (
          <div className="flex flex-col gap-4">
            <SegmentedControl<Tab>
              aria-label={t("campaignsWizard.places.tabs.label")}
              value={tab}
              onChange={setTab}
              fullWidth
              options={[
                { value: "search", label: t("campaignsWizard.places.tabs.search") },
                { value: "existing", label: t("campaignsWizard.places.tabs.existing") },
              ]}
            />

            {tab === "search" ? (
              !available ? (
                <div className="flex flex-col gap-3">
                  <Callout tone="neutral" title={t("campaignsWizard.places.unavailableTitle")}>
                    {t("campaignsWizard.places.unavailableHint")}
                  </Callout>
                  {canConfigure ? (
                    <p className="text-xs text-pretty text-muted-foreground">
                      {t("campaignsWizard.places.unavailableAdmin", { variable: "APIFY_API_TOKEN" })}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start pointer-coarse:h-10"
                    onClick={() => setTab("existing")}
                  >
                    {t("campaignsWizard.places.useExisting")}
                  </Button>
                </div>
              ) : phase === "running" ? (
                <div role="status" className="flex flex-col gap-3 rounded-lg border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                    {runStatus === "running"
                      ? t("campaignsWizard.places.running")
                      : t("campaignsWizard.places.queued")}
                  </p>
                  {/* Sem porcentagem: o serviço não diz quanto falta, e um número inventado seria mentira. */}
                  <div aria-hidden className="h-1 w-full animate-pulse rounded-full bg-primary/60" />
                  <p className="text-xs text-pretty text-muted-foreground">
                    {t("campaignsWizard.places.runningHint")}
                  </p>
                </div>
              ) : phase === "results" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {t("campaignsWizard.places.found", {
                        count: results.length,
                        formatted: formatNumber(results.length, language),
                      })}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="pointer-coarse:h-10"
                      onClick={() => {
                        setPhase("form")
                        setSelected(new Map())
                      }}
                    >
                      {t("campaignsWizard.places.newSearch")}
                    </Button>
                  </div>
                  <SearchInput
                    value={resultsFilter}
                    onChange={(next) => {
                      setResultsFilter(next)
                      setResultsPage(1)
                    }}
                    debounce={0}
                    shortcut={false}
                    placeholder={t("campaignsWizard.places.filterResults")}
                  />
                  {visibleResults.length === 0 ? (
                    <EmptyState
                      icon={<SearchX className="size-5" />}
                      title={t("campaignsWizard.places.noFilterResults")}
                      className="border-0 p-6"
                    />
                  ) : (
                    <>
                      {selectAllRow}
                      <ul className="divide-y rounded-lg border">
                        {pagedResults.map((place) => (
                          <PlaceRow
                            key={placeKey(place)}
                            place={place}
                            selected={selected.has(placeKey(place))}
                            onToggle={() => toggle(place)}
                            onDetails={() => setDetails(place)}
                          />
                        ))}
                      </ul>
                      <TablePagination
                        page={resultsPage}
                        totalPages={resultsPages}
                        total={visibleResults.length}
                        perPage={RESULTS_PER_PAGE}
                        onPageChange={setResultsPage}
                      />
                    </>
                  )}
                  <CountryCodeSwitch checked={includeCountryCode} onChange={setIncludeCountryCode} />
                </div>
              ) : (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void startSearch()
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="places-query">{t("campaignsWizard.places.query")}</Label>
                      <Input
                        id="places-query"
                        value={form.query}
                        placeholder={t("campaignsWizard.places.queryPlaceholder")}
                        onChange={(event) => update("query", event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="places-location">{t("campaignsWizard.places.location")}</Label>
                      <Input
                        id="places-location"
                        value={form.location}
                        placeholder={t("campaignsWizard.places.locationPlaceholder")}
                        onChange={(event) => update("location", event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>{t("campaignsWizard.places.maxPlaces", { count: form.maxPlaces })}</Label>
                    <Slider
                      aria-label={t("campaignsWizard.places.maxPlacesLabel")}
                      value={[form.maxPlaces]}
                      min={10}
                      max={200}
                      step={10}
                      onValueChange={(value) =>
                        update("maxPlaces", Array.isArray(value) ? value[0] : value)
                      }
                    />
                  </div>

                  <Collapsible>
                    <CollapsibleTrigger
                      render={
                        <button
                          type="button"
                          className="group flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                      }
                    >
                      {t("campaignsWizard.places.advanced")}
                      <ChevronDown
                        aria-hidden
                        className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="grid gap-4 pt-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="places-score">{t("campaignsWizard.places.minScore")}</Label>
                          <NumberInput
                            id="places-score"
                            value={form.minScore || null}
                            min={0}
                            max={5}
                            step={0.5}
                            placeholder={t("campaignsWizard.places.anyScore")}
                            onChange={(value) => update("minScore", value ?? 0)}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="places-category">{t("campaignsWizard.places.category")}</Label>
                          <Input
                            id="places-category"
                            value={form.categoryFilter}
                            placeholder={t("campaignsWizard.places.categoryPlaceholder")}
                            onChange={(event) => update("categoryFilter", event.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">{t("campaignsWizard.places.reviewsSort")}</span>
                          <SelectInput
                            aria-label={t("campaignsWizard.places.reviewsSort")}
                            value={form.reviewsSort}
                            onChange={(value) => update("reviewsSort", value)}
                            placeholder={t("campaignsWizard.places.sorts.default")}
                            clearLabel={t("campaignsWizard.places.sorts.default")}
                            options={REVIEW_SORTS.map((value) => ({
                              value,
                              label: t(`campaignsWizard.places.sorts.${value}`),
                            }))}
                          />
                        </div>
                        <label className="flex cursor-pointer items-center justify-between gap-3 self-end pointer-coarse:min-h-10">
                          <span className="text-sm font-medium">{t("campaignsWizard.places.skipClosed")}</span>
                          <Switch
                            checked={form.skipClosed}
                            onCheckedChange={(checked) => update("skipClosed", checked)}
                          />
                        </label>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {searchError ? (
                    <Callout tone="danger" role="alert">
                      {searchError}
                    </Callout>
                  ) : null}

                  <p className="flex items-start gap-1.5 text-xs text-pretty text-muted-foreground">
                    <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {t("campaignsWizard.places.searchHint")}
                  </p>
                  {/* O botão de buscar mora no rodapé; o Enter nos campos continua valendo. */}
                  <button type="submit" hidden aria-hidden tabIndex={-1} />
                </form>
              )
            ) : (
              <div className="flex flex-col gap-3">
                <SearchInput
                  value={existingQuery}
                  onChange={(next) => {
                    setExistingQuery(next)
                    setExistingPage(1)
                  }}
                  loading={existing.isValidating}
                  shortcut={false}
                  placeholder={t("campaignsWizard.places.searchExisting")}
                />

                {existing.isLoading && !existing.data ? (
                  <ListSkeleton rows={6} />
                ) : existing.error ? (
                  <ErrorState
                    error={existing.error}
                    onRetry={() => void existing.mutate()}
                    className="border-0 p-4"
                  />
                ) : existing.data && existing.data.contacts.length > 0 ? (
                  <>
                    {selectAllRow}
                    <ul className="divide-y rounded-lg border">
                      {existing.data.contacts.map((place) => (
                        <PlaceRow
                          key={placeKey(place)}
                          place={place}
                          selected={selected.has(placeKey(place))}
                          onToggle={() => toggle(place)}
                          onDetails={() => setDetails(place)}
                        />
                      ))}
                    </ul>
                    <TablePagination
                      page={existing.data.meta.page}
                      totalPages={existing.data.meta.totalPages}
                      total={existing.data.meta.total}
                      perPage={existing.data.meta.perPage}
                      onPageChange={setExistingPage}
                    />
                    <CountryCodeSwitch checked={includeCountryCode} onChange={setIncludeCountryCode} />
                  </>
                ) : (
                  <EmptyState
                    icon={existingQuery.trim() ? <SearchX className="size-5" /> : <Store className="size-5" />}
                    title={
                      existingQuery.trim()
                        ? t("campaignsWizard.places.noFilterResults")
                        : t("campaignsWizard.places.noneYet")
                    }
                    description={existingQuery.trim() ? undefined : t("campaignsWizard.places.noneYetHint")}
                    className="border-0 p-6"
                  />
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Phone aria-hidden className="size-3" />
                {t("campaignsWizard.places.phoneOnly")}
              </span>
              <span className="inline-flex items-center gap-1">
                <Globe aria-hidden className="size-3" />
                {t("campaignsWizard.places.dataKept")}
              </span>
            </div>
          </div>
        )}
      </SidePanel>
      <PlaceDetails place={details} onClose={() => setDetails(null)} />
    </>
  )
}

function CountryCodeSwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  const { t } = useTranslation()

  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 pointer-coarse:min-h-10">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{t("campaignsWizard.mapping.countryCode")}</span>
        <span className="block text-xs text-pretty text-muted-foreground">
          {t("campaignsWizard.mapping.countryCodeHint")}
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
