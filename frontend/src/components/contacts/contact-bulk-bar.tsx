import { useTranslation } from "react-i18next"
import {
  CircleCheck,
  CircleDot,
  Download,
  Tag,
  Tags,
  UserRoundCheck,
  Zap,
  ZapOff,
} from "lucide-react"

import { ActionsMenu, BulkActionsBar, type RowAction } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"

export type BulkAction =
  | "addTags"
  | "removeTags"
  | "assign"
  | "reopen"
  | "close"
  | "automationOn"
  | "automationOff"
  | "export"

export type ContactBulkBarProps = {
  count: number
  onClear: () => void
  onAction: (action: BulkAction) => void
}

/**
 * A barra de quem selecionou. O `DataTable` traz uma, mas ela não sabe tirar um contato de "todos
 * do filtro": é por isso que a tela usa a barra do kit diretamente. No celular só cabe o menu.
 */
export function ContactBulkBar({ count, onClear, onAction }: ContactBulkBarProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const primary: RowAction[] = [
    {
      label: t("contacts.bulk.actions.addTags"),
      icon: <Tag />,
      onSelect: () => onAction("addTags"),
    },
    {
      label: t("contacts.bulk.actions.assign"),
      icon: <UserRoundCheck />,
      onSelect: () => onAction("assign"),
    },
    {
      label: t("contacts.bulk.actions.export"),
      icon: <Download />,
      onSelect: () => onAction("export"),
    },
  ]

  const secondary: RowAction[] = [
    {
      label: t("contacts.bulk.actions.removeTags"),
      icon: <Tags />,
      onSelect: () => onAction("removeTags"),
    },
    {
      label: t("contacts.bulk.actions.reopen"),
      icon: <CircleDot />,
      separatorBefore: true,
      onSelect: () => onAction("reopen"),
    },
    {
      label: t("contacts.bulk.actions.close"),
      icon: <CircleCheck />,
      onSelect: () => onAction("close"),
    },
    {
      label: t("contacts.bulk.actions.automationOn"),
      icon: <Zap />,
      separatorBefore: true,
      onSelect: () => onAction("automationOn"),
    },
    {
      label: t("contacts.bulk.actions.automationOff"),
      icon: <ZapOff />,
      onSelect: () => onAction("automationOff"),
    },
  ]

  return (
    <BulkActionsBar
      count={count}
      onClear={onClear}
      label={(selected) => t("contacts.bulk.selected", selected)}
    >
      {isMobile ? null : (
        <>
          {primary.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant="ghost"
              size="sm"
              onClick={action.onSelect}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </>
      )}
      <ActionsMenu
        label={t("contacts.bulk.actions.more")}
        actions={isMobile ? [...primary, ...secondary] : secondary}
      />
    </BulkActionsBar>
  )
}
