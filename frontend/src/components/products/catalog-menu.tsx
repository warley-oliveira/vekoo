import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@/lib/router"
import {
  FolderTree,
  History,
  MoreHorizontal,
  RefreshCw,
  ScanSearch,
  SlidersHorizontal,
  Upload,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type CatalogMenuProps = {
  categoriesCount?: number
  fieldsCount?: number
  /** No celular, importar não cabe na barra e vem para cá. */
  onImport?: () => void
  onHistory: () => void
  onSearchTest: () => void
  onRefresh: () => void
}

/** O que configura o catálogo e não é ação do dia a dia: fica à mão, mas fora do caminho. */
export function CatalogMenu({
  categoriesCount,
  fieldsCount,
  onImport,
  onHistory,
  onSearchTest,
  onRefresh,
}: CatalogMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("products.menu.label")}
            className="pointer-coarse:size-10"
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-60">
        {onImport ? (
          <>
            <MenuEntry
              icon={<Upload />}
              label={t("products.list.import")}
              onClick={onImport}
            />
            <DropdownMenuSeparator />
          </>
        ) : null}
        <MenuEntry
          icon={<FolderTree />}
          label={t("products.menu.categories")}
          hint={
            categoriesCount !== undefined
              ? t("products.menu.categoriesCount", { count: categoriesCount })
              : undefined
          }
          onClick={() => navigate("/catalog/categories")}
        />
        <MenuEntry
          icon={<SlidersHorizontal />}
          label={t("products.menu.fields")}
          hint={
            fieldsCount !== undefined
              ? t("products.menu.fieldsCount", { count: fieldsCount })
              : undefined
          }
          onClick={() => navigate("/catalog/fields")}
        />
        <DropdownMenuSeparator />
        <MenuEntry
          icon={<History />}
          label={t("products.menu.imports")}
          onClick={onHistory}
        />
        <MenuEntry
          icon={<ScanSearch />}
          label={t("products.menu.searchTest")}
          onClick={onSearchTest}
        />
        <MenuEntry
          icon={<RefreshCw />}
          label={t("products.menu.refresh")}
          onClick={onRefresh}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuEntry({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
      {hint ? <span className="pl-4 text-xs text-muted-foreground tabular-nums">{hint}</span> : null}
    </DropdownMenuItem>
  )
}
