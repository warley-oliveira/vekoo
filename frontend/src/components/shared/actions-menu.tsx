import { Fragment, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type RowAction = {
  label: string
  icon?: ReactNode
  onSelect: () => void
  /** Vermelho e no fim da lista. Confirme com `useConfirm` em `onSelect`. */
  destructive?: boolean
  disabled?: boolean
  /** Some do menu, sem precisar montar a lista com condicionais. */
  hidden?: boolean
  separatorBefore?: boolean
}

export type ActionsMenuProps = {
  actions: RowAction[]
  /** Nome do botão para leitor de tela: "Ações de Marina Duarte". */
  label?: string
  className?: string
}

/** O menu "..." de um registro: linha de tabela, card, item de lista. */
export function ActionsMenu({ actions, label, className }: ActionsMenuProps) {
  const { t } = useTranslation()
  const visible = actions.filter((action) => !action.hidden)

  if (visible.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label ?? t("kit.actions.more")}
            className={cn("text-muted-foreground", className)}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">
        {visible.map((action) => (
          <Fragment key={action.label}>
            {action.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={action.destructive ? "destructive" : "default"}
              disabled={action.disabled}
              onClick={action.onSelect}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
