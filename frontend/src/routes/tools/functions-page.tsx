import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useSearchParams } from "react-router"
import { ChevronRight, Code2, Lock, PencilRuler, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ToolLogo } from "@/components/tools/tool-logo"
import { useToolTexts } from "@/components/tools/tool-texts"
import { FunctionListSkeleton } from "@/components/tools/tools-skeletons"
import { ToolsNav } from "@/components/tools/tools-nav"
import { usePersonalize } from "@/components/tools/use-personalize"
import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  PageBody,
  PageHeader,
  RelativeTime,
  SortMenu,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useToolFunctionMutations, useToolFunctions } from "@/hooks/tools/use-tool-functions"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch } from "@/lib/search-text"
import { CUSTOM_GROUP, groupFunctions, type FunctionGroup } from "@/lib/tools/catalog"
import type { ToolFunction } from "@/lib/tools/types"
import { cn } from "@/lib/utils"

// As funções da organização: as escritas aqui e as que vieram de uma ferramenta. É a aba de quem programa, e os blocos
// dos fluxos escolhem daqui. A ferramenta fica como cabeçalho do grupo, e não como coluna: o que importa saber é o que
// dá para mexer e o que não dá.

type SortKey = "name" | "recent"

export default function FunctionsPage() {
  const { t } = useTranslation()
  const texts = useToolTexts()
  const language = useLanguage()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { functions, hasData, error, isLoading, reload } = useToolFunctions()

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("name")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // A origem fica no endereço: o painel da ferramenta e o link "só as minhas" chegam aqui prontos.
  const origins = useMemo(() => searchParams.getAll("origin"), [searchParams])
  const setOrigins = (next: string[]) =>
    setSearchParams(
      (current) => {
        const copy = new URLSearchParams(current)
        copy.delete("origin")
        next.forEach((value) => copy.append("origin", value))
        return copy
      },
      { replace: true }
    )

  const allGroups = useMemo(() => groupFunctions(functions, language), [functions, language])

  const originOptions = useMemo(
    () =>
      allGroups.map((group) => ({
        value: group.key,
        label: group.tool ? texts.name(group.tool) : t("tools.functions.customGroup"),
        count: group.functions.length,
      })),
    [allGroups, t, texts]
  )

  const visible = useMemo(() => {
    const searched = functions.filter((fn) => {
      if (origins.length > 0 && !origins.includes(fn.tool?.id ?? CUSTOM_GROUP)) return false
      return !query || matchesSearch(`${fn.name} ${fn.description ?? ""} ${fn.tool?.name ?? ""}`, query)
    })
    return [...searched].sort((a, b) => (sort === "recent" ? b.updatedAt - a.updatedAt : a.name.localeCompare(b.name, language)))
  }, [functions, language, origins, query, sort])

  const groups = useMemo(() => groupFunctions(visible, language), [language, visible])

  const clearFilters = () => {
    setQuery("")
    setOrigins([])
  }

  const toggleGroup = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const create = () => navigate("/tools/functions/new")

  const header = (
    <PageHeader
      description={t("tools.functions.description")}
      actions={
        <Button onClick={create} className="pointer-coarse:h-10">
          <Plus />
          {t("tools.functions.create")}
        </Button>
      }
      mobilePlacement="inline"
      mobileActions={
        <Button onClick={create} aria-label={t("tools.functions.create")} className="pointer-coarse:h-10">
          <Plus />
          {t("tools.functions.createShort")}
        </Button>
      }
    />
  )

  return (
    <PageBody>
      {header}
      <ToolsNav />

      {error && !hasData ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading && !hasData ? (
        <FunctionListSkeleton />
      ) : functions.length === 0 ? (
        <EmptyState
          icon={<Code2 className="size-5" />}
          title={t("tools.functions.emptyTitle")}
          description={t("tools.functions.emptyDescription")}
          action={{ label: t("tools.functions.create"), onClick: create }}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <FilterBar
            search={{ value: query, onChange: setQuery, debounce: 0, placeholder: t("tools.functions.search") }}
            activeCount={origins.length ? 1 : 0}
            onClear={clearFilters}
            resultLabel={t("tools.functions.count", { count: visible.length })}
            sort={
              <SortMenu
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name", label: t("tools.functions.sortName") },
                  { value: "recent", label: t("tools.functions.sortRecent") },
                ]}
              />
            }
            filters={<FacetedFilter title={t("tools.functions.origin")} options={originOptions} value={origins} onChange={setOrigins} />}
          />

          {visible.length === 0 ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title={t("tools.functions.noResultsTitle")}
              description={t("tools.functions.noResultsDescription")}
              action={{ label: t("tools.common.clearFilters"), onClick: clearFilters }}
            />
          ) : (
            groups.map((group) => (
              <GroupSection key={group.key} group={group} collapsed={collapsed.has(group.key)} onToggle={() => toggleGroup(group.key)} />
            ))
          )}
        </div>
      )}
    </PageBody>
  )
}

function GroupSection({ group, collapsed, onToggle }: { group: FunctionGroup; collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const texts = useToolTexts()
  const preset = useMotionPreset()
  const contentId = `functions-${group.key}`

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
        >
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !collapsed && "rotate-90")} aria-hidden />
          {group.tool ? <ToolLogo tool={group.tool} size="sm" /> : null}
          <span className="min-w-0">
            <span className="block truncate font-heading text-base leading-snug font-medium">
              {group.tool ? texts.name(group.tool) : t("tools.functions.customGroup")}
            </span>
            <span className="block text-xs text-pretty text-muted-foreground">
              {t(group.tool ? "tools.functions.toolGroupHint" : "tools.functions.customGroupHint", { count: group.functions.length })}
            </span>
          </span>
        </button>
        {group.tool ? (
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to={`/tools?tool=${group.tool.id}`} />}
            className="shrink-0 text-muted-foreground pointer-coarse:h-10"
          >
            {t("tools.functions.openTool")}
          </Button>
        ) : null}
      </div>

      {!collapsed ? (
        <ul id={contentId} className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
          <AnimatePresence initial={false}>
            {group.functions.map((fn) => (
              <motion.li key={fn.id} {...preset.listItem} className="min-w-0">
                <FunctionRow fn={fn} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </section>
  )
}

function FunctionRow({ fn }: { fn: ToolFunction }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const personalize = usePersonalize()
  const { deleteFunction } = useToolFunctionMutations()

  const open = () => navigate(`/tools/functions/${fn.id}`)

  const remove = async () => {
    const confirmed = await confirm({
      title: t("tools.functions.deleteTitle", { name: fn.name }),
      description: t("tools.functions.deleteDescription"),
      confirmLabel: t("tools.functions.delete"),
      destructive: true,
      onConfirm: () => deleteFunction(fn.id),
    })
    if (confirmed) toast.success(t("tools.functions.deleted", { name: fn.name }))
  }

  return (
    <div className="flex items-start gap-1 rounded-xl transition-colors hover:bg-muted/40">
      <Link
        to={`/tools/functions/${fn.id}`}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-3 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <code className="font-mono text-[13px] font-medium break-all">{fn.name}</code>
          {fn.locked ? <Lock className="size-3 shrink-0 text-muted-foreground" aria-label={t("tools.functions.managed")} /> : null}
        </span>
        {fn.description ? <span className="line-clamp-2 text-sm text-pretty text-muted-foreground">{fn.description}</span> : null}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {t("tools.functions.parameters", { count: fn.parameters.length })}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            {t("tools.functions.updated")} <RelativeTime value={fn.updatedAt} />
          </span>
        </span>
      </Link>
      <ActionsMenu
        className="mt-1.5 mr-1 shrink-0 pointer-coarse:size-10"
        label={t("tools.functions.actionsOf", { name: fn.name })}
        actions={[
          { label: t(fn.locked ? "tools.functions.view" : "tools.functions.edit"), icon: <Code2 />, onSelect: open },
          {
            label: t("tools.personalize.action"),
            icon: <PencilRuler />,
            hidden: !fn.locked,
            onSelect: () => void personalize(fn),
          },
          {
            label: t("tools.functions.delete"),
            icon: <Trash2 />,
            destructive: true,
            separatorBefore: true,
            hidden: fn.locked,
            onSelect: () => void remove(),
          },
        ]}
      />
    </div>
  )
}
