import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import type { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import {
  Archive,
  CheckCircle2,
  Download,
  LayoutGrid,
  List,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Reply,
  Tag,
  Trash2,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ActionsMenu,
  AvatarStack,
  CardGridSkeleton,
  CheckboxField,
  ColorField,
  ComboboxField,
  ConfirmDialog,
  CopyButton,
  CurrencyField,
  DataTable,
  DateField,
  DateRangeField,
  DateRangePicker,
  DateTimeField,
  DetailSkeleton,
  ChipsInput,
  type DateRangeValue,
  type DropzoneFile,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FileDropzone,
  FilterBar,
  FilterPopover,
  Form,
  FormActions,
  InfiniteList,
  KeyValueList,
  ListSkeleton,
  Money,
  MultiSelectField,
  MultiSelectInput,
  NumberField,
  PageBody,
  PageHeader,
  PageSkeleton,
  PhoneField,
  RadioField,
  RelativeTime,
  ResponsiveDialog,
  SearchInput,
  SectionCard,
  SegmentedControl,
  type SelectOption,
  SelectField,
  SettingsSection,
  SidePanel,
  SortMenu,
  Sparkline,
  StatTile,
  StatusBadge,
  type StatusTone,
  SwitchField,
  TableSkeleton,
  TagChip,
  TextField,
  TextareaField,
  Timeline,
  UnsavedChangesDialog,
  useConfirm,
  useFormSubmit,
  UserAvatar,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useBoolean } from "@/hooks/use-boolean"
import { ApiError, type PaginationMeta } from "@/lib/api"
import { isValidPhone } from "@/lib/format-phone"
import { matchesSearch } from "@/lib/search-text"
import { COLOR_SWATCHES } from "@/lib/tag-color"

/* ---------- dados de exemplo: conteúdo da pessoa, não interface ---------- */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const NOW = Date.now()

type Stage = "new" | "negotiating" | "won" | "lost"

type Contact = {
  id: string
  name: string
  company: string
  stage: Stage
  owner: string
  value: number
  lastContact: number
}

const CONTACTS: Contact[] = [
  { id: "1", name: "Marina Duarte", company: "Ateliê Duarte", stage: "won", owner: "Rafael Nunes", value: 4800, lastContact: NOW - 25 * MINUTE },
  { id: "2", name: "João Pedro Almeida", company: "Padaria Pão Quente", stage: "negotiating", owner: "Camila Rocha", value: 1250.5, lastContact: NOW - 3 * HOUR },
  { id: "3", name: "Ágata Lima", company: "Clínica Bem Viver", stage: "new", owner: "Rafael Nunes", value: 980, lastContact: NOW - 26 * HOUR },
  { id: "4", name: "Bruno Sá", company: "Oficina do Bruno", stage: "lost", owner: "Beatriz Ramos", value: 320, lastContact: NOW - 5 * DAY },
  { id: "5", name: "Fernanda Conceição", company: "Escola Aprender", stage: "negotiating", owner: "Camila Rocha", value: 15700, lastContact: NOW - 2 * DAY },
  { id: "6", name: "Thiago Araújo", company: "Barbearia Navalha", stage: "won", owner: "Beatriz Ramos", value: 640, lastContact: NOW - 9 * DAY },
  { id: "7", name: "Luciana Ferreira", company: "Doces da Lu", stage: "new", owner: "Rafael Nunes", value: 275, lastContact: NOW - 40 * MINUTE },
  { id: "8", name: "Renato Gonçalves", company: "RG Contabilidade", stage: "negotiating", owner: "Camila Rocha", value: 8900, lastContact: NOW - 12 * DAY },
  { id: "9", name: "Patrícia Moura", company: "Pet Shop Patinhas", stage: "won", owner: "Rafael Nunes", value: 2100, lastContact: NOW - 18 * DAY },
  { id: "10", name: "Élcio Barros", company: "Barros Imóveis", stage: "lost", owner: "Beatriz Ramos", value: 42000, lastContact: NOW - 33 * DAY },
  { id: "11", name: "Sofia Teixeira", company: "Studio Sofia Pilates", stage: "new", owner: "Camila Rocha", value: 1500, lastContact: NOW - 6 * HOUR },
  { id: "12", name: "Diego Cardoso", company: "Mercado Bom Preço", stage: "negotiating", owner: "Beatriz Ramos", value: 6300, lastContact: NOW - 4 * DAY },
]

const OWNERS = ["Rafael Nunes", "Camila Rocha", "Beatriz Ramos", "Marina Duarte", "Henrique Dias", "Júlia Prado"]

const STAGE_TONES: Record<Stage, StatusTone> = {
  new: "info",
  negotiating: "warning",
  won: "success",
  lost: "neutral",
}

const CITIES: SelectOption[] = [
  "Belo Horizonte", "Brasília", "Campinas", "Curitiba", "Florianópolis", "Fortaleza", "Goiânia",
  "Manaus", "Porto Alegre", "Recife", "Rio de Janeiro", "Salvador", "São Paulo", "Vitória",
].map((city) => ({ value: city, label: city }))

const TAG_OPTIONS: SelectOption[] = [
  "Cliente VIP", "Indicação", "Retorno", "Atacado", "Pós-venda", "Inadimplente",
].map((tag) => ({ value: tag, label: tag }))

// Conteúdo de exemplo de etiquetas e pessoas, como o que a pessoa cadastraria.
const SAMPLE = {
  vip: "Cliente VIP",
  referral: "Indicação",
  returning: "Retorno",
  wholesale: "Atacado",
  marina: "Marina Duarte",
  joao: "João Pedro Almeida",
  agata: "Ágata",
  bruno: "Bruno Sá",
  rafael: "Rafael Nunes",
  phone: "+55 31 98379-4137",
  phoneDigits: "5531983794137",
  email: "marina.duarte@exemplo.com.br",
  inviteLink: "https://vekoo.app/convite/9f3a",
}

const SECTIONS = ["page", "data", "collections", "overlays", "forms", "skeletons"] as const

/* ---------- moldura ---------- */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-5">
      <h2 className="border-b pb-2 font-heading text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function Example({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

/* ---------- página ---------- */

export default function KitPage() {
  const { t } = useTranslation()
  return (
    <PageBody variant="wide" className="gap-10 md:gap-12">
      <PageHeader
        title={t("kit.showcase.title")}
        description={t("kit.showcase.description")}
        breadcrumb={[
          { label: t("kit.showcase.crumbs.home"), to: "/" },
          { label: t("kit.showcase.crumbs.dev") },
          { label: t("kit.showcase.crumbs.kit") },
        ]}
        actions={
          <>
            <Button variant="outline">
              <Download />
              {t("kit.showcase.actions.export")}
            </Button>
            <Button>
              <Plus />
              {t("kit.showcase.actions.create")}
            </Button>
          </>
        }
      />

      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {SECTIONS.map((section) => (
          <a
            key={section}
            href={`#${section}`}
            className="rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:py-2.5"
          >
            {t(`kit.showcase.sections.${section}`)}
          </a>
        ))}
      </nav>

      <PageSection />
      <DataSection />
      <CollectionsSection />
      <OverlaysSection />
      <FormsSection />
      <SkeletonsSection />
    </PageBody>
  )
}

function PageSection() {
  const { t } = useTranslation()
  const form = useForm({ defaultValues: { push: true, digest: false } })

  return (
    <Section id="page" title={t("kit.showcase.sections.page")}>
      <div>
        <SettingsSection
          title={t("kit.showcase.page.settingsTitle")}
          description={t("kit.showcase.page.settingsDescription")}
        >
          <SwitchField
            control={form.control}
            name="push"
            label={t("kit.showcase.page.pushLabel")}
            hint={t("kit.showcase.page.pushHint")}
          />
          <SwitchField
            control={form.control}
            name="digest"
            label={t("kit.showcase.page.digestLabel")}
          />
        </SettingsSection>
      </div>
      <SectionCard
        title={t("kit.showcase.page.cardTitle")}
        description={t("kit.showcase.page.cardDescription")}
        actions={
          <Button variant="outline" size="sm">
            <Pencil />
            {t("kit.showcase.actions.edit")}
          </Button>
        }
        footer={
          <span className="mr-auto text-xs text-muted-foreground">
            {t("kit.showcase.page.cardFooter")}
          </span>
        }
      >
        <p className="text-sm text-muted-foreground">{t("kit.showcase.page.cardBody")}</p>
      </SectionCard>
    </Section>
  )
}

function DataSection() {
  const { t } = useTranslation()
  const [tags, setTags] = useState([
    { label: SAMPLE.vip, color: "#7c3aed" },
    { label: SAMPLE.returning, color: "#ffee00" },
    { label: SAMPLE.referral, color: "#059669" },
    { label: SAMPLE.wholesale, color: "#dc2626" },
  ])

  const people = OWNERS.map((name) => ({ name }))

  return (
    <Section id="data" title={t("kit.showcase.sections.data")}>
      <Example title={t("kit.showcase.data.stats")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile
            label={t("kit.showcase.data.conversations")}
            value={128}
            delta={{ value: 0.125, label: t("kit.showcase.data.vsLastWeek") }}
            sparkline={[92, 101, 97, 110, 108, 115, 112, 120, 118, 122, 125, 128]}
          />
          <StatTile
            label={t("kit.showcase.data.revenue")}
            value={<Money value={48250.9} compact />}
            delta={{ value: -0.043, label: t("kit.showcase.data.vsLastMonth") }}
          />
          <StatTile
            label={t("kit.showcase.data.responseTime")}
            value={t("kit.showcase.data.minutes", { value: 4 })}
            delta={{ value: -0.18, goodWhen: "down", label: t("kit.showcase.data.vsLastWeek") }}
            sparkline={[9, 8, 8, 7, 7, 6, 6, 6, 5, 5, 4, 4]}
            formatSparklineValue={(value) => t("kit.showcase.data.minutes", { value })}
          />
          <StatTile
            label={t("kit.showcase.data.contacts")}
            value={12940}
            delta={{ value: 0, label: t("kit.showcase.data.stable") }}
          />
          <StatTile label={t("kit.showcase.data.statLoading")} value={0} loading />
        </div>
      </Example>

      <div className="grid gap-6 md:grid-cols-2">
        <Example title={t("kit.showcase.data.status")}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">{t("kit.showcase.data.toneNeutral")}</StatusBadge>
            <StatusBadge tone="success">{t("kit.showcase.data.toneSuccess")}</StatusBadge>
            <StatusBadge tone="warning">{t("kit.showcase.data.toneWarning")}</StatusBadge>
            <StatusBadge tone="danger">{t("kit.showcase.data.toneDanger")}</StatusBadge>
            <StatusBadge tone="info">{t("kit.showcase.data.toneInfo")}</StatusBadge>
            <StatusBadge tone="accent">{t("kit.showcase.data.toneAccent")}</StatusBadge>
            <StatusBadge tone="success" icon={<CheckCircle2 />}>
              {t("kit.showcase.data.toneSuccess")}
            </StatusBadge>
            <StatusBadge dot={false}>{t("kit.showcase.data.toneNoDot")}</StatusBadge>
          </div>
        </Example>

        <Example title={t("kit.showcase.data.tags")}>
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <TagChip
                key={tag.label}
                color={tag.color}
                onRemove={() =>
                  setTags((current) => current.filter((item) => item.label !== tag.label))
                }
              >
                {tag.label}
              </TagChip>
            ))}
            <TagChip color="#ffee00" variant="solid">{SAMPLE.returning}</TagChip>
            <TagChip color="#1e3a8a" variant="solid">{SAMPLE.wholesale}</TagChip>
            <TagChip icon={<Tag />}>{t("kit.showcase.data.tagNoColor")}</TagChip>
          </div>
        </Example>

        <Example title={t("kit.showcase.data.people")}>
          <div className="flex flex-wrap items-center gap-3">
            <UserAvatar name={SAMPLE.marina} size="sm" />
            <UserAvatar name={SAMPLE.joao} status="online" />
            <UserAvatar name={SAMPLE.agata} size="lg" status="away" />
            <UserAvatar name={SAMPLE.bruno} src="/favicon.svg" size="lg" status="offline" />
            <UserAvatar />
            <AvatarStack users={people} />
            <AvatarStack users={people.slice(0, 2)} size="default" />
          </div>
        </Example>

        <Example title={t("kit.showcase.data.formats")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <RelativeTime value={NOW - 5 * MINUTE} />
            <RelativeTime value={NOW - 3 * HOUR} />
            <RelativeTime value={NOW - 26 * HOUR} />
            <RelativeTime value={NOW - 45 * DAY} />
            <RelativeTime value={NOW + 2 * DAY} />
            <RelativeTime value={null} className="text-muted-foreground" />
            <Money value={1250.5} />
            <Money cents={489900} />
            <Money value={48250.9} compact />
            <Money value="5000.0" currency="USD" />
            <Money value={null} className="text-muted-foreground" />
            <CopyButton value={SAMPLE.inviteLink} />
            <CopyButton
              value={SAMPLE.inviteLink}
              label={t("kit.showcase.data.copyLink")}
              variant="outline"
              size="sm"
            />
            <Sparkline
              label={t("kit.showcase.data.conversations")}
              values={[3, 5, 4, 7, 6, 9, 8, 11]}
            />
          </div>
        </Example>

        <Example title={t("kit.showcase.data.keyValue")}>
          <KeyValueList
            className="max-w-md"
            items={[
              { label: t("kit.showcase.data.fields.name"), value: SAMPLE.marina },
              {
                label: t("kit.showcase.data.fields.phone"),
                value: SAMPLE.phone,
                copyValue: SAMPLE.phoneDigits,
              },
              {
                label: t("kit.showcase.data.fields.email"),
                value: SAMPLE.email,
                copyValue: SAMPLE.email,
              },
              {
                label: t("kit.showcase.data.fields.owner"),
                value: (
                  <span className="inline-flex items-center gap-2">
                    <UserAvatar name={SAMPLE.rafael} size="sm" />
                    {SAMPLE.rafael}
                  </span>
                ),
              },
              { label: t("kit.showcase.data.fields.company") },
            ]}
          />
        </Example>

        <Example title={t("kit.showcase.data.timeline")}>
          <Timeline
            items={[
              {
                id: "failed",
                tone: "danger",
                title: t("kit.showcase.data.events.failed"),
                description: t("kit.showcase.data.events.failedDetail"),
                time: NOW - 20 * MINUTE,
              },
              {
                id: "assigned",
                icon: <UserPlus />,
                tone: "accent",
                title: t("kit.showcase.data.events.assigned"),
                time: NOW - 3 * HOUR,
              },
              {
                id: "tagged",
                icon: <Tag />,
                title: t("kit.showcase.data.events.tagged"),
                content: <TagChip color="#7c3aed">{SAMPLE.vip}</TagChip>,
                time: NOW - 2 * DAY,
              },
              {
                id: "created",
                tone: "success",
                icon: <CheckCircle2 />,
                title: t("kit.showcase.data.events.created"),
                description: t("kit.showcase.data.events.createdDetail"),
                time: NOW - 40 * DAY,
              },
            ]}
          />
        </Example>
      </div>
    </Section>
  )
}

/* ---------- coleções ---------- */

function useContactColumns(): ColumnDef<Contact, any>[] {
  const { t } = useTranslation()

  return useMemo<ColumnDef<Contact, any>[]>(() => {
    const stageOptions = (["new", "negotiating", "won", "lost"] as const).map((stage) => ({
      value: stage,
      label: t(`kit.showcase.collections.stages.${stage}`),
      count: CONTACTS.filter((contact) => contact.stage === stage).length,
    }))

    return [
      {
        accessorKey: "name",
        header: t("kit.showcase.collections.columns.name"),
        meta: { mobile: "primary", filter: { type: "text" } },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <UserAvatar name={row.original.name} size="sm" className="hidden md:flex" />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {row.original.company}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "stage",
        header: t("kit.showcase.collections.columns.stage"),
        meta: { filter: { type: "select", options: stageOptions } },
        cell: ({ row }) => (
          <StatusBadge tone={STAGE_TONES[row.original.stage]}>
            {t(`kit.showcase.collections.stages.${row.original.stage}`)}
          </StatusBadge>
        ),
      },
      {
        accessorKey: "owner",
        header: t("kit.showcase.collections.columns.owner"),
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.owner}</span>,
      },
      {
        accessorKey: "value",
        header: t("kit.showcase.collections.columns.value"),
        meta: { align: "right" },
        cell: ({ row }) => <Money value={row.original.value} />,
      },
      {
        accessorKey: "lastContact",
        header: t("kit.showcase.collections.columns.lastContact"),
        meta: {
          filter: { type: "dateRange" },
          sortLabels: {
            desc: t("kit.showcase.collections.sort.recent"),
            asc: t("kit.showcase.collections.sort.oldest"),
          },
        },
        cell: ({ row }) => (
          <RelativeTime value={row.original.lastContact} className="text-muted-foreground" />
        ),
      },
    ]
  }, [t])
}

function useContactRowActions() {
  const { t } = useTranslation()
  const confirm = useConfirm()

  return useCallback(
    (contact: Contact) => [
      {
        label: t("kit.showcase.actions.reply"),
        icon: <Reply />,
        onSelect: () => toast(contact.name),
      },
      {
        label: t("kit.showcase.actions.assign"),
        icon: <UserPlus />,
        onSelect: () => toast(contact.name),
      },
      {
        label: t("kit.showcase.actions.delete"),
        icon: <Trash2 />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => {
          void confirm({
            title: t("kit.showcase.overlays.deleteTitle"),
            description: t("kit.showcase.overlays.deleteDescription"),
            confirmLabel: t("kit.showcase.overlays.deleteConfirm"),
            destructive: true,
          })
        },
      },
    ],
    [confirm, t]
  )
}

function CollectionsSection() {
  const { t } = useTranslation()
  const columns = useContactColumns()
  const rowActions = useContactRowActions()

  /* Tabela local: a busca vem do FilterBar e os filtros, das colunas */
  const [query, setQuery] = useState("")

  /* FilterBar completa, sobre uma lista simples */
  const [barQuery, setBarQuery] = useState("")
  const [stages, setStages] = useState<string[]>([])
  const [owners, setOwners] = useState<string[]>([])
  const [period, setPeriod] = useState<DateRangeValue | null>(null)
  const [barSort, setBarSort] = useState<"recent" | "oldest" | "nameAsc">("recent")

  const stageOptions = (["new", "negotiating", "won", "lost"] as const).map((stage) => ({
    value: stage,
    label: t(`kit.showcase.collections.stages.${stage}`),
    count: CONTACTS.filter((contact) => contact.stage === stage).length,
  }))
  const ownerOptions = OWNERS.map((owner) => ({
    value: owner,
    label: owner,
    count: CONTACTS.filter((contact) => contact.owner === owner).length,
  }))

  const barResults = useMemo(() => {
    const found = CONTACTS.filter(
      (contact) =>
        (!barQuery || matchesSearch(`${contact.name} ${contact.company}`, barQuery)) &&
        (stages.length === 0 || stages.includes(contact.stage)) &&
        (owners.length === 0 || owners.includes(contact.owner)) &&
        (!period ||
          (contact.lastContact >= period.from.getTime() &&
            contact.lastContact <= period.to.getTime()))
    )
    return [...found].sort((a, b) =>
      barSort === "recent"
        ? b.lastContact - a.lastContact
        : barSort === "oldest"
          ? a.lastContact - b.lastContact
          : a.name.localeCompare(b.name, "pt-BR")
    )
  }, [barQuery, barSort, owners, period, stages])

  const activeFilters = (stages.length > 0 ? 1 : 0) + (owners.length > 0 ? 1 : 0) + (period ? 1 : 0)
  const clearAll = () => {
    setBarQuery("")
    setStages([])
    setOwners([])
    setPeriod(null)
  }

  /* Estados */
  const [state, setState] = useState<"real" | "loading" | "empty" | "error">("loading")

  /* Peças soltas */
  const [sort, setSort] = useState<"recent" | "oldest" | "nameAsc">("recent")
  const [view, setView] = useState("list")
  const [status, setStatus] = useState("open")
  const [layout, setLayout] = useState("grid")
  const [search, setSearch] = useState("")
  const [facets, setFacets] = useState<string[]>(["won"])
  const [popoverFacets, setPopoverFacets] = useState<string[]>([])
  const [popoverPeriod, setPopoverPeriod] = useState<DateRangeValue | null>(null)

  return (
    <Section id="collections" title={t("kit.showcase.sections.collections")}>
      <Example
        title={t("kit.showcase.collections.dataTable")}
        hint={t("kit.showcase.collections.dataTableHint")}
      >
        <FilterBar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: t("kit.showcase.collections.searchLabel"),
          }}
          onClear={() => setQuery("")}
        />
        <DataTable
          aria-label={t("kit.showcase.collections.dataTable")}
          columns={columns}
          data={CONTACTS}
          pageSize={5}
          perPageOptions={[5, 10, 25]}
          globalFilter={query}
          onClearFilters={() => setQuery("")}
          defaultSorting={[{ id: "lastContact", desc: true }]}
          selectable
          selectAllMatching
          rowActions={rowActions}
          onRowClick={(contact) => toast(contact.name)}
          bulkActions={({ ids, clear }) => (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  toast.success(
                    t("kit.showcase.collections.bulkDone", { count: ids.length })
                  )
                  clear()
                }}
              >
                <Archive />
                {t("kit.showcase.actions.archive")}
              </Button>
              <Button variant="ghost" size="sm" onClick={clear}>
                <UserPlus />
                {t("kit.showcase.actions.assign")}
              </Button>
            </>
          )}
        />
      </Example>

      <Example
        title={t("kit.showcase.collections.filterBar")}
        hint={t("kit.showcase.collections.filterBarHint")}
      >
        <FilterBar
          search={{ value: barQuery, onChange: setBarQuery }}
          activeCount={activeFilters}
          onClear={clearAll}
          resultLabel={t("kit.showcase.collections.resultCount", { count: barResults.length })}
          sort={
            <SortMenu
              value={barSort}
              onChange={setBarSort}
              options={[
                { value: "recent", label: t("kit.showcase.collections.sort.recent") },
                { value: "oldest", label: t("kit.showcase.collections.sort.oldest") },
                { value: "nameAsc", label: t("kit.showcase.collections.sort.nameAsc") },
              ]}
            />
          }
          filters={
            <>
              <FacetedFilter
                title={t("kit.showcase.collections.columns.stage")}
                options={stageOptions}
                value={stages}
                onChange={setStages}
              />
              <FacetedFilter
                title={t("kit.showcase.collections.columns.owner")}
                options={ownerOptions}
                value={owners}
                onChange={setOwners}
              />
              <DateRangePicker
                className="md:w-52"
                label={t("kit.showcase.forms.period")}
                value={period}
                onChange={setPeriod}
              />
            </>
          }
        />
        {barResults.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {barResults.slice(0, 3).map((contact) => (
              <li key={contact.id} className="flex items-center gap-3 px-3 py-2.5">
                <UserAvatar name={contact.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{contact.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{contact.company}</p>
                </div>
                <StatusBadge tone={STAGE_TONES[contact.stage]}>
                  {t(`kit.showcase.collections.stages.${contact.stage}`)}
                </StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={t("kit.table.noResultsTitle")}
            description={t("kit.table.noResultsDescription")}
            action={{ label: t("kit.filters.clear"), onClick: clearAll }}
          />
        )}
      </Example>

      <Example title={t("kit.showcase.collections.states")}>
        <SegmentedControl
          aria-label={t("kit.showcase.collections.states")}
          value={state}
          onChange={setState}
          options={[
            { value: "real", label: t("kit.showcase.collections.stateReal") },
            { value: "loading", label: t("kit.showcase.collections.stateLoading") },
            { value: "empty", label: t("kit.showcase.collections.stateEmpty") },
            { value: "error", label: t("kit.showcase.collections.stateError") },
          ]}
        />
        <DataTable
          aria-label={t("kit.showcase.collections.states")}
          columns={columns}
          data={state === "real" ? CONTACTS.slice(0, 3) : []}
          isLoading={state === "loading"}
          error={state === "error" ? new ApiError({ status: 0, code: "network" }) : undefined}
          onRetry={() => setState("real")}
          density="compact"
          empty={{
            title: t("kit.showcase.collections.emptyTitle"),
            description: t("kit.showcase.collections.emptyDescription"),
            action: {
              label: t("kit.showcase.actions.create"),
              onClick: () => setState("real"),
            },
          }}
        />
      </Example>

      <ServerTableExample columns={columns} />

      <Example title={t("kit.showcase.collections.pieces")}>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            className="w-56"
            value={search}
            onChange={setSearch}
            shortcut={false}
            loading={search.length > 2}
          />
          <FacetedFilter
            title={t("kit.showcase.collections.columns.stage")}
            options={stageOptions}
            value={facets}
            onChange={setFacets}
          />
          <FacetedFilter
            title={t("kit.showcase.collections.columns.owner")}
            options={[...ownerOptions, ...CITIES]}
            value={[]}
            onChange={() => {}}
          />
          <SortMenu
            value={sort}
            onChange={setSort}
            options={[
              { value: "recent", label: t("kit.showcase.collections.sort.recent") },
              { value: "oldest", label: t("kit.showcase.collections.sort.oldest") },
              { value: "nameAsc", label: t("kit.showcase.collections.sort.nameAsc") },
            ]}
          />
          <ActionsMenu actions={rowActions(CONTACTS[0])} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            aria-label={t("kit.showcase.collections.viewList")}
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: t("kit.showcase.collections.viewList") },
              { value: "board", label: t("kit.showcase.collections.viewBoard") },
            ]}
          />
          <SegmentedControl
            aria-label={t("kit.showcase.collections.viewOpen")}
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: t("kit.showcase.collections.viewOpen"), count: 128 },
              { value: "closed", label: t("kit.showcase.collections.viewClosed"), count: 2041 },
              {
                value: "archived",
                label: t("kit.showcase.collections.disabledSegment"),
                disabled: true,
              },
            ]}
          />
          <SegmentedControl
            aria-label={t("kit.showcase.collections.gridView")}
            value={layout}
            onChange={setLayout}
            options={[
              {
                value: "grid",
                label: <LayoutGrid />,
                "aria-label": t("kit.showcase.collections.gridView"),
              },
              {
                value: "list",
                label: <List />,
                "aria-label": t("kit.showcase.collections.listView"),
              },
            ]}
          />
          <FilterPopover
            activeCount={(popoverFacets.length > 0 ? 1 : 0) + (popoverPeriod ? 1 : 0)}
            onClear={() => {
              setPopoverFacets([])
              setPopoverPeriod(null)
            }}
          >
            <FacetedFilter
              title={t("kit.showcase.collections.columns.stage")}
              options={stageOptions}
              value={popoverFacets}
              onChange={setPopoverFacets}
            />
            <FacetedFilter
              title={t("kit.showcase.forms.city")}
              options={CITIES}
              value={popoverFacets}
              onChange={setPopoverFacets}
            />
            <DateRangePicker
              label={t("kit.showcase.forms.period")}
              value={popoverPeriod}
              onChange={setPopoverPeriod}
            />
          </FilterPopover>
        </div>
      </Example>

      <div className="grid gap-6 lg:grid-cols-2">
        <InfiniteExample />
        <ReverseExample />
      </div>
    </Section>
  )
}

type ServerQuery = {
  page: number
  perPage: number
  sorting: { id: string; desc: boolean }[]
  filters: { id: string; value: unknown }[]
}

/**
 * Simula `GET /contacts?page=&perPage=&sort=&direction=&stage=`: mesma forma de resposta,
 * com atraso. Numa tela de verdade, tudo isto é uma chamada a `useApi`.
 */
function fetchContacts({ page, perPage, sorting, filters }: ServerQuery) {
  const stages = filters.find((filter) => filter.id === "stage")?.value as string[] | undefined
  const found = CONTACTS.filter((contact) => !stages || stages.includes(contact.stage))

  const [sort] = sorting
  if (sort) {
    const key = sort.id as keyof Contact
    found.sort((a, b) => {
      const order =
        typeof a[key] === "number"
          ? (a[key] as number) - (b[key] as number)
          : String(a[key]).localeCompare(String(b[key]), "pt-BR")
      return sort.desc ? -order : order
    })
  }

  const meta: PaginationMeta = {
    page,
    perPage,
    total: found.length,
    totalPages: Math.max(1, Math.ceil(found.length / perPage)),
    hasMore: page * perPage < found.length,
  }
  return { contacts: found.slice((page - 1) * perPage, page * perPage), meta }
}

function ServerTableExample({ columns }: { columns: ColumnDef<Contact, any>[] }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState<ServerQuery>({
    page: 1,
    perPage: 5,
    sorting: [],
    filters: [],
  })
  const [response, setResponse] = useState(() => fetchContacts(query))
  const [fetching, setFetching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  function load(changes: Partial<ServerQuery>) {
    const next = { ...query, ...changes }
    setQuery(next)
    setFetching(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setResponse(fetchContacts(next))
      setFetching(false)
    }, 500)
  }

  return (
    <Example
      title={t("kit.showcase.collections.serverTable")}
      hint={t("kit.showcase.collections.serverHint")}
    >
      <DataTable
        aria-label={t("kit.showcase.collections.serverTable")}
        columns={columns}
        data={response.contacts}
        meta={response.meta}
        isFetching={fetching}
        onPageChange={(page) => load({ page })}
        onPerPageChange={(perPage) => load({ perPage, page: 1 })}
        perPageOptions={[5, 10]}
        sorting={query.sorting}
        onSortingChange={(sorting) => load({ sorting, page: 1 })}
        columnFilters={query.filters}
        onColumnFiltersChange={(filters) => load({ filters, page: 1 })}
        selectable
        selectAllMatching
        bulkActions={({ allMatching, ids, clear }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              toast.success(
                t("kit.showcase.collections.bulkDone", {
                  count: allMatching ? response.meta.total : ids.length,
                })
              )
              clear()
            }}
          >
            <Archive />
            {t("kit.showcase.actions.archive")}
          </Button>
        )}
      />
    </Example>
  )
}

type Conversation = { id: string; name: string; preview: string; at: number }

const INFINITE_TOTAL = 200
const PAGE = 20

function makeConversations(from: number, count: number): Conversation[] {
  return Array.from({ length: count }, (_, index) => {
    const position = from + index
    return {
      id: `conversation-${position}`,
      name: `${OWNERS[position % OWNERS.length]} ${position + 1}`,
      preview: CONTACTS[position % CONTACTS.length].company,
      at: NOW - position * 37 * MINUTE,
    }
  })
}

function InfiniteExample() {
  const { t } = useTranslation()
  const [items, setItems] = useState(() => makeConversations(0, PAGE))
  const [loadingMore, setLoadingMore] = useState(false)

  return (
    <Example
      title={t("kit.showcase.collections.infinite")}
      hint={t("kit.showcase.collections.infiniteHint", { count: INFINITE_TOTAL })}
    >
      <div className="h-80 overflow-hidden rounded-lg border">
        <InfiniteList
          aria-label={t("kit.showcase.collections.infinite")}
          items={items}
          getItemKey={(item) => item.id}
          hasMore={items.length < INFINITE_TOTAL}
          loadingMore={loadingMore}
          endLabel={t("kit.showcase.collections.endLabel")}
          onLoadMore={() => {
            setLoadingMore(true)
            setTimeout(() => {
              setItems((current) => [
                ...current,
                ...makeConversations(current.length, PAGE),
              ])
              setLoadingMore(false)
            }, 500)
          }}
          renderItem={(item) => (
            <div className="flex items-center gap-3 border-b px-3 py-2.5">
              <UserAvatar name={item.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">{item.preview}</p>
              </div>
              <RelativeTime value={item.at} className="shrink-0 text-xs text-muted-foreground" />
            </div>
          )}
        />
      </div>
    </Example>
  )
}

const BUBBLES = [
  "Oi! Vocês entregam em Contagem?",
  "Entregamos sim, em até dois dias úteis.",
  "Ótimo. Qual o valor do frete para o centro?",
  "Para o centro fica R$ 12,90.",
  "Perfeito, vou fechar o pedido hoje.",
]

type Bubble = { id: string; text: string; mine: boolean }

let bubbleCursor = 0

function makeBubbles(count: number): Bubble[] {
  return Array.from({ length: count }, () => {
    const position = ++bubbleCursor
    return {
      id: `bubble-${position}`,
      text: BUBBLES[position % BUBBLES.length],
      mine: position % 2 === 0,
    }
  })
}

function ReverseExample() {
  const { t } = useTranslation()
  const [items, setItems] = useState(() => makeBubbles(30))
  const [loadingMore, setLoadingMore] = useState(false)

  return (
    <Example
      title={t("kit.showcase.collections.reverse")}
      hint={t("kit.showcase.collections.reverseHint")}
    >
      <div className="h-80 overflow-hidden rounded-lg border">
        <InfiniteList
          reverse
          aria-label={t("kit.showcase.collections.reverse")}
          items={items}
          getItemKey={(item) => item.id}
          hasMore={items.length < 90}
          loadingMore={loadingMore}
          onLoadMore={() => {
            setLoadingMore(true)
            setTimeout(() => {
              setItems((current) => [...makeBubbles(20), ...current])
              setLoadingMore(false)
            }, 500)
          }}
          renderItem={(item) => (
            <div className={item.mine ? "flex justify-end px-3 py-1" : "flex px-3 py-1"}>
              <p
                className={
                  item.mine
                    ? "max-w-[75%] rounded-xl bg-accent px-3 py-1.5 text-sm text-accent-foreground"
                    : "max-w-[75%] rounded-xl bg-muted px-3 py-1.5 text-sm"
                }
              >
                {item.text}
              </p>
            </div>
          )}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setItems((current) => [...current, ...makeBubbles(1)])}
      >
        <MessageCircle />
        {t("kit.showcase.collections.newMessage")}
      </Button>
    </Example>
  )
}

/* ---------- sobreposições ---------- */

function OverlaysSection() {
  const { t } = useTranslation()
  const dialog = useBoolean()
  const panel = useBoolean()
  const destructive = useBoolean()
  const typed = useBoolean()
  const failing = useBoolean()
  const confirm = useConfirm()

  const schema = useMemo(
    () => z.object({ name: z.string().min(1, t("kit.showcase.forms.nameRequired")) }),
    [t]
  )
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "Cliente VIP" },
    mode: "onBlur",
  })
  const submit = useFormSubmit(form, async () => {
    await new Promise((resolve) => setTimeout(resolve, 600))
    toast.success(t("kit.showcase.overlays.confirmed"))
    dialog.onFalse()
  })

  async function askFromPanel() {
    const confirmed = await confirm({
      title: t("kit.showcase.overlays.deleteTitle"),
      description: t("kit.showcase.overlays.deleteDescription"),
      confirmLabel: t("kit.showcase.overlays.deleteConfirm"),
      destructive: true,
      onConfirm: () => new Promise((resolve) => setTimeout(resolve, 600)),
    })
    toast(confirmed ? t("kit.showcase.overlays.confirmed") : t("kit.showcase.overlays.declined"))
    if (confirmed) panel.onFalse()
  }

  return (
    <Section id="overlays" title={t("kit.showcase.sections.overlays")}>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" data-testid="open-dialog" onClick={dialog.onTrue}>
          {t("kit.showcase.overlays.openDialog")}
        </Button>
        <Button variant="outline" data-testid="open-panel" onClick={panel.onTrue}>
          {t("kit.showcase.overlays.openPanel")}
        </Button>
        <Button variant="outline" data-testid="open-confirm" onClick={destructive.onTrue}>
          {t("kit.showcase.overlays.openConfirm")}
        </Button>
        <Button variant="outline" data-testid="open-typed" onClick={typed.onTrue}>
          {t("kit.showcase.overlays.openTyped")}
        </Button>
        <Button variant="outline" data-testid="open-failing" onClick={failing.onTrue}>
          {t("kit.showcase.overlays.openFailing")}
        </Button>
        <Button
          variant="outline"
          data-testid="open-hook"
          onClick={async () => {
            const confirmed = await confirm({
              title: t("kit.showcase.overlays.hookTitle"),
              description: t("kit.showcase.overlays.hookDescription"),
              confirmLabel: t("kit.showcase.overlays.hookConfirm"),
            })
            toast(
              confirmed
                ? t("kit.showcase.overlays.confirmed")
                : t("kit.showcase.overlays.declined")
            )
          }}
        >
          {t("kit.showcase.overlays.openHook")}
        </Button>
      </div>

      <ResponsiveDialog
        open={dialog.value}
        onOpenChange={dialog.setValue}
        title={t("kit.showcase.overlays.dialogTitle")}
        description={t("kit.showcase.overlays.dialogDescription")}
        onSubmit={submit}
        footer={
          <FormActions
            form={form}
            submitLabel={t("kit.showcase.overlays.dialogSubmit")}
            onCancel={dialog.onFalse}
          />
        }
      >
        <TextField
          control={form.control}
          name="name"
          label={t("kit.showcase.overlays.dialogField")}
          autoFocus
        />
      </ResponsiveDialog>

      <SidePanel
        open={panel.value}
        onOpenChange={panel.setValue}
        title={t("kit.showcase.overlays.panelTitle")}
        description={t("kit.showcase.overlays.panelDescription")}
        headerActions={<CopyButton value={SAMPLE.email} />}
        footer={
          <>
            <Button
              variant="destructive"
              data-testid="panel-delete"
              className="sm:mr-auto"
              onClick={() => void askFromPanel()}
            >
              <Trash2 />
              {t("kit.showcase.overlays.panelDelete")}
            </Button>
            <Button variant="outline" onClick={panel.onFalse}>
              {t("kit.actions.close")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">{t("kit.showcase.overlays.panelBody")}</p>
          <KeyValueList
            items={[
              { label: t("kit.showcase.data.fields.name"), value: SAMPLE.marina },
              { label: t("kit.showcase.data.fields.phone"), value: SAMPLE.phone },
              { label: t("kit.showcase.data.fields.email"), value: SAMPLE.email },
            ]}
          />
          <DetailSkeleton />
          <ListSkeleton rows={12} avatar />
        </div>
      </SidePanel>

      <ConfirmDialog
        open={destructive.value}
        onOpenChange={destructive.setValue}
        destructive
        title={t("kit.showcase.overlays.deleteTitle")}
        description={t("kit.showcase.overlays.deleteDescription")}
        confirmLabel={t("kit.showcase.overlays.deleteConfirm")}
        onConfirm={() => new Promise((resolve) => setTimeout(resolve, 800))}
      />
      <ConfirmDialog
        open={typed.value}
        onOpenChange={typed.setValue}
        destructive
        requireText={t("kit.showcase.overlays.typedWord")}
        title={t("kit.showcase.overlays.typedTitle")}
        description={t("kit.showcase.overlays.typedDescription")}
        confirmLabel={t("kit.showcase.overlays.typedConfirm")}
      />
      <ConfirmDialog
        open={failing.value}
        onOpenChange={failing.setValue}
        title={t("kit.showcase.overlays.failingTitle")}
        description={t("kit.showcase.overlays.failingDescription")}
        confirmLabel={t("kit.showcase.overlays.failingConfirm")}
        onConfirm={() =>
          Promise.reject(
            new ApiError({
              status: 422,
              code: "unprocessable",
              serverMessage: t("kit.showcase.forms.serverRootError"),
            })
          )
        }
      />
    </Section>
  )
}

/* ---------- formulários ---------- */

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(1, t("kit.showcase.forms.nameRequired")),
    email: z.string().email(t("kit.showcase.forms.emailInvalid")),
    website: z.string(),
    password: z.string().min(8, t("kit.showcase.forms.passwordShort")),
    notes: z.string(),
    phone: z.string().refine(isValidPhone, t("kit.showcase.forms.phoneInvalid")),
    stage: z.string().nullable().refine(Boolean, t("kit.showcase.forms.stageRequired")),
    owner: z.string().nullable(),
    city: z.string().nullable(),
    tags: z.array(z.string()).min(1, t("kit.showcase.forms.tagsRequired")),
    dealValue: z.number().nullable(),
    seats: z.number().nullable(),
    discount: z.number().nullable(),
    birthday: z.date().nullable(),
    followUp: z.date().nullable(),
    period: z.object({ from: z.date(), to: z.date() }).nullable(),
    color: z.string(),
    channel: z.string(),
    priority: z.string(),
    marketing: z.boolean(),
    terms: z.boolean().refine(Boolean, t("kit.showcase.forms.termsRequired")),
    refuse: z.boolean(),
  })
}

type ProfileValues = z.infer<ReturnType<typeof buildSchema>>

// Todo campo com padrão, inclusive os vazios (`null`): campo sem padrão faz o
// `isDirty` nascer verdadeiro e o aviso de sair sem salvar apareceria à toa.
const PROFILE_DEFAULTS: ProfileValues = {
  name: "",
  email: "",
  website: "",
  password: "",
  notes: "",
  phone: "",
  stage: null,
  owner: null,
  city: null,
  tags: [],
  dealValue: 1250.5,
  seats: 3,
  discount: 0.1,
  birthday: null,
  followUp: null,
  period: null,
  color: "#7c3aed",
  channel: "whatsapp",
  priority: "medium",
  marketing: true,
  terms: false,
  refuse: false,
}

/** Busca simulada: no app, `apiGet` com o `signal` para cancelar a anterior. */
function searchOwners(query: string, signal: AbortSignal): Promise<SelectOption[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(
        OWNERS.filter((owner) => matchesSearch(owner, query)).map((owner) => ({
          value: owner,
          label: owner,
          description: `${owner.split(" ")[0].toLowerCase()}@exemplo.com.br`,
        }))
      )
    }, 400)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

/**
 * Envio simulado, para a vitrine não depender de rota: um arquivo com "falha" no nome
 * rejeita, para dar para ver o erro e o tentar de novo. Na tela de verdade, use
 * `upload={{ path: "/attachments" }}`.
 */
function simulateUpload(
  file: File,
  { onProgress, signal }: { onProgress: (fraction: number) => void; signal: AbortSignal }
) {
  return new Promise<void>((resolve, reject) => {
    let progress = 0
    const timer = setInterval(() => {
      progress += 0.2
      onProgress(Math.min(progress, 1))
      if (progress >= 1) {
        clearInterval(timer)
        if (file.name.includes("falha")) reject(new Error("simulado"))
        else resolve()
      }
    }, 200)
    signal.addEventListener("abort", () => {
      clearInterval(timer)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

function FormsSection() {
  const { t } = useTranslation()
  const schema = useMemo(() => buildSchema(t), [t])

  const form = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: PROFILE_DEFAULTS,
    mode: "onBlur",
  })
  const statesForm = useForm({
    defaultValues: {
      text: "Marina Duarte",
      select: "new",
      toggle: true,
      check: true,
      invalid: "",
    },
  })

  const stageOptions = (["new", "negotiating", "won", "lost"] as const).map((stage) => ({
    value: stage,
    label: t(`kit.showcase.collections.stages.${stage}`),
  }))

  const [files, setFiles] = useState<DropzoneFile[]>([])

  return (
    <Section id="forms" title={t("kit.showcase.sections.forms")}>
      <Example
        title={t("kit.showcase.forms.profile")}
        hint={t("kit.showcase.forms.profileHint")}
      >
        <Form
          form={form}
          className="flex max-w-3xl flex-col gap-5"
          onSubmit={async (values) => {
            await new Promise((resolve) => setTimeout(resolve, 700))
            if (values.refuse) {
              throw new ApiError({
                status: 422,
                code: "unprocessable",
                field: "email",
                serverMessage: t("kit.showcase.forms.serverRootError"),
                details: {
                  email: [t("kit.showcase.forms.serverFieldError")],
                  organizationLimit: [t("kit.showcase.forms.serverRootError")],
                },
              })
            }
            toast.success(t("kit.showcase.forms.saved"))
            form.reset(values)
          }}
        >
          <UnsavedChangesDialog when={form.formState.isDirty} />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="name"
              label={t("kit.showcase.forms.name")}
              placeholder={t("kit.showcase.forms.namePlaceholder")}
              autoComplete="name"
            />
            <TextField
              control={form.control}
              name="email"
              type="email"
              label={t("kit.showcase.forms.email")}
              hint={t("kit.showcase.forms.emailHint")}
              autoComplete="email"
            />
            <TextField
              control={form.control}
              name="website"
              optional
              label={t("kit.showcase.forms.website")}
              startAdornment="https://"
            />
            <TextField
              control={form.control}
              name="password"
              type="password"
              label={t("kit.showcase.forms.password")}
              hint={t("kit.showcase.forms.passwordHint")}
              autoComplete="new-password"
            />
            <PhoneField
              control={form.control}
              name="phone"
              label={t("kit.showcase.forms.phone")}
            />
            <SelectField
              control={form.control}
              name="stage"
              label={t("kit.showcase.forms.stage")}
              options={stageOptions}
            />
            <ComboboxField
              control={form.control}
              name="owner"
              clearable
              label={t("kit.showcase.forms.owner")}
              hint={t("kit.showcase.forms.ownerHint")}
              loadOptions={searchOwners}
            />
            <ComboboxField
              control={form.control}
              name="city"
              optional
              clearable
              label={t("kit.showcase.forms.city")}
              options={CITIES}
            />
          </div>

          <MultiSelectField
            control={form.control}
            name="tags"
            label={t("kit.showcase.forms.tags")}
            placeholder={t("kit.showcase.forms.tagsPlaceholder")}
            options={TAG_OPTIONS}
          />

          <TextareaField
            control={form.control}
            name="notes"
            optional
            showCount
            maxLength={280}
            label={t("kit.showcase.forms.notes")}
            placeholder={t("kit.showcase.forms.notesPlaceholder")}
          />

          <div className="grid gap-5 sm:grid-cols-3">
            <CurrencyField
              control={form.control}
              name="dealValue"
              label={t("kit.showcase.forms.dealValue")}
            />
            <NumberField
              control={form.control}
              name="seats"
              steppers
              min={1}
              max={50}
              label={t("kit.showcase.forms.seats")}
            />
            <NumberField
              control={form.control}
              name="discount"
              step={0.05}
              min={0}
              max={1}
              format={{ style: "percent" }}
              label={t("kit.showcase.forms.discount")}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <DateField
              control={form.control}
              name="birthday"
              optional
              clearable
              label={t("kit.showcase.forms.birthday")}
              min={new Date(1930, 0, 1)}
              max={new Date()}
            />
            <DateTimeField
              control={form.control}
              name="followUp"
              optional
              label={t("kit.showcase.forms.followUp")}
              min={new Date(NOW - DAY)}
            />
            <DateRangeField
              control={form.control}
              name="period"
              optional
              label={t("kit.showcase.forms.period")}
            />
            <ColorField
              control={form.control}
              name="color"
              label={t("kit.showcase.forms.color")}
              swatches={COLOR_SWATCHES}
            />
          </div>

          <RadioField
            control={form.control}
            name="channel"
            variant="cards"
            orientation="horizontal"
            label={t("kit.showcase.forms.channel")}
            options={[
              {
                value: "whatsapp",
                label: t("kit.showcase.forms.channelWhatsapp"),
                description: t("kit.showcase.forms.channelWhatsappHint"),
                icon: <MessageCircle />,
              },
              {
                value: "email",
                label: t("kit.showcase.forms.channelEmail"),
                description: t("kit.showcase.forms.channelEmailHint"),
                icon: <Mail />,
              },
            ]}
          />
          <RadioField
            control={form.control}
            name="priority"
            orientation="horizontal"
            label={t("kit.showcase.forms.priority")}
            options={[
              { value: "low", label: t("kit.showcase.forms.priorityLow") },
              { value: "medium", label: t("kit.showcase.forms.priorityMedium") },
              { value: "high", label: t("kit.showcase.forms.priorityHigh") },
            ]}
          />

          <SwitchField
            control={form.control}
            name="marketing"
            label={t("kit.showcase.forms.marketing")}
            hint={t("kit.showcase.forms.marketingHint")}
          />
          <CheckboxField
            control={form.control}
            name="refuse"
            label={t("kit.showcase.forms.serverTrigger")}
          />
          <CheckboxField
            control={form.control}
            name="terms"
            label={t("kit.showcase.forms.terms")}
          />

          <FormActions
            submitLabel={t("kit.showcase.forms.submit")}
            cancelLabel={t("kit.showcase.forms.cancel")}
            onCancel={() => form.reset()}
          />
        </Form>
      </Example>

      <Example title={t("kit.showcase.forms.states")}>
        <div className="grid max-w-3xl gap-5 sm:grid-cols-3">
          <TextField
            control={statesForm.control}
            name="text"
            disabled
            label={t("kit.showcase.forms.disabled")}
          />
          <SelectField
            control={statesForm.control}
            name="select"
            disabled
            label={t("kit.showcase.forms.disabled")}
            options={stageOptions}
          />
          <InvalidExample control={statesForm} />
          <SwitchField
            control={statesForm.control}
            name="toggle"
            disabled
            label={t("kit.showcase.forms.disabled")}
          />
          <CheckboxField
            control={statesForm.control}
            name="check"
            disabled
            label={t("kit.showcase.forms.disabled")}
          />
        </div>
      </Example>

      <div className="grid gap-6 md:grid-cols-2">
        <Example
          title={t("kit.showcase.forms.dropzone")}
          hint={t("kit.showcase.forms.dropzoneHint")}
        >
          <FileDropzone
            value={files}
            onChange={setFiles}
            accept={{ "image/*": [], "application/pdf": [".pdf"] }}
            maxSize={5 * 1024 * 1024}
            maxFiles={3}
            upload={{ send: simulateUpload }}
          />
        </Example>
        <Example title={t("kit.showcase.forms.dropzoneStates")}>
          <FileDropzone
            maxFiles={1}
            value={[
              {
                id: "uploading",
                name: "contrato-marina-duarte.pdf",
                size: 2_480_000,
                type: "application/pdf",
                status: "uploading",
                progress: 0.45,
              },
              {
                id: "done",
                name: "tabela-de-precos-2026.xlsx",
                size: 84_000,
                type: "application/vnd.ms-excel",
                status: "done",
                progress: 1,
              },
              {
                id: "failed",
                name: "foto-da-loja.jpg",
                size: 3_100_000,
                type: "image/jpeg",
                status: "error",
                progress: 0,
                error: t("kit.dropzone.uploadFailed"),
              },
            ]}
            onChange={() => {}}
            disabled
          />
        </Example>
      </div>
    </Section>
  )
}

function InvalidExample({
  control,
}: {
  control: ReturnType<
    typeof useForm<{
      text: string
      select: string
      toggle: boolean
      check: boolean
      invalid: string
    }>
  >
}) {
  const { t } = useTranslation()
  const { setError } = control
  const marked = useRef(false)

  // Marca o erro uma vez só, para o exemplo mostrar o estado sem precisar enviar.
  if (!marked.current) {
    marked.current = true
    queueMicrotask(() =>
      setError("invalid", { type: "manual", message: t("kit.showcase.forms.invalidMessage") })
    )
  }

  return (
    <TextField
      control={control.control}
      name="invalid"
      label={t("kit.showcase.forms.invalidField")}
    />
  )
}

/* ---------- esqueletos ---------- */

function SkeletonsSection() {
  const { t } = useTranslation()

  return (
    <Section id="skeletons" title={t("kit.showcase.sections.skeletons")}>
      <div className="grid gap-6 md:grid-cols-2">
        <Example title={t("kit.showcase.skeletons.progress")} hint={t("kit.showcase.skeletons.progressHint")}>
          <Progress value={40} aria-label={t("kit.showcase.skeletons.progress")} />
          <Progress value={null} aria-label={t("kit.showcase.skeletons.progress")} />
        </Example>
        <Example title={t("kit.showcase.skeletons.disabled")}>
          <MultiSelectInput
            disabled
            aria-label={t("kit.showcase.forms.tags")}
            options={TAG_OPTIONS}
            value={TAG_OPTIONS.slice(0, 2).map((option) => option.value)}
            onChange={() => {}}
          />
          <ChipsInput
            disabled
            aria-label={t("kit.showcase.forms.tags")}
            value={TAG_OPTIONS.slice(0, 2).map((option) => option.label)}
            onChange={() => {}}
          />
        </Example>
        <Example title={t("kit.showcase.skeletons.list")}>
          <ListSkeleton rows={4} avatar />
        </Example>
        <Example title={t("kit.showcase.skeletons.table")}>
          <TableSkeleton rows={4} />
        </Example>
        <Example title={t("kit.showcase.skeletons.detail")}>
          <DetailSkeleton rows={4} />
        </Example>
        <Example title={t("kit.showcase.skeletons.cards")}>
          <CardGridSkeleton cards={2} media className="lg:grid-cols-2" />
        </Example>
      </div>
      <Example title={t("kit.showcase.skeletons.page")}>
        <div className="overflow-hidden rounded-lg border">
          <PageSkeleton />
        </div>
      </Example>
      <div className="grid gap-4 md:grid-cols-2">
        <EmptyState
          title={t("kit.showcase.collections.emptyTitle")}
          description={t("kit.showcase.collections.emptyDescription")}
          action={{ label: t("kit.showcase.actions.create"), onClick: () => {} }}
        />
        <ErrorState error={new ApiError({ status: 0, code: "network" })} onRetry={() => {}} />
      </div>
    </Section>
  )
}
