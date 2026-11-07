import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CircleSlash, Copy, Pause, Play, Trash2 } from "lucide-react"

import { BulkActionsBar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { eligibleFor, type BulkKind, type CampaignActions } from "@/hooks/campaigns/use-campaign-actions"
import type { Campaign } from "@/lib/campaigns/types"

const KINDS: { kind: BulkKind; icon: typeof Pause; destructive?: boolean }[] = [
  { kind: "pause", icon: Pause },
  { kind: "resume", icon: Play },
  { kind: "cancel", icon: CircleSlash, destructive: true },
  { kind: "delete", icon: Trash2, destructive: true },
]

type CampaignBulkBarProps = {
  selected: Campaign[]
  actions: CampaignActions
  onClear: () => void
}

/**
 * O que dá para fazer com os selecionados. Cada botão diz quantos aceitam a ação, porque a seleção
 * pode misturar estados: pausar três campanhas de cinco é melhor que esconder o botão. Duplicar abre o
 * assistente, então só vale com uma.
 */
export function CampaignBulkBar({ selected, actions, onClear }: CampaignBulkBarProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  async function run(kind: BulkKind) {
    setBusy(true)
    try {
      if (await actions.bulk(kind, selected)) onClear()
    } finally {
      setBusy(false)
    }
  }

  const single = selected.length === 1 ? selected[0] : null

  return (
    <BulkActionsBar
      count={selected.length}
      onClear={onClear}
      label={(amount) => t("campaigns.bulk.selected", amount)}
    >
      {single ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => actions.duplicate(single)}
        >
          <Copy />
          {t("campaigns.actions.duplicate")}
        </Button>
      ) : null}
      {KINDS.map(({ kind, icon: Icon, destructive }) => {
        const count = eligibleFor(kind, selected).length
        if (count === 0) return null

        return (
          <Button
            key={kind}
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            className={destructive ? "text-destructive hover:text-destructive" : undefined}
            onClick={() => void run(kind)}
          >
            <Icon />
            {t(`campaigns.bulk.actions.${kind}`, { count })}
          </Button>
        )
      })}
    </BulkActionsBar>
  )
}
