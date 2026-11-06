import { Trans, useTranslation } from "react-i18next"
import { Sparkles, Zap } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCredits } from "@/hooks/use-credits"
import { useAuth } from "@/lib/auth"

/** Saldo de créditos: bloco na barra e no painel "Mais", ícone com dica no trilho. */
export function CreditsSummary({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation()
  const { credits } = useCredits()
  const { session } = useAuth()
  // `left` é do servidor: subtrair aqui daria uma segunda opinião sobre o
  // saldo, e a única que vale é a de quem cobra.
  const remaining = credits?.left ?? 0
  const total = credits?.total ?? 0
  const usagePercent = total > 0 ? (credits!.used / total) * 100 : 0

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="w-full text-muted-foreground"
              onClick={() => toast(t("credits.upgradeToast"))}
              aria-label={t("credits.aria", { remaining, total })}
            />
          }
        >
          <Zap />
        </TooltipTrigger>
        <TooltipContent side="right">
          {t("credits.aria", { remaining, total })}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">
          <Trans
            i18nKey="credits.remaining"
            values={{ remaining, total }}
            components={{
              muted: <span className="font-normal text-muted-foreground" />,
            }}
          />
        </span>
        <span className="text-xs text-muted-foreground">
          {session ? t(`plans.${session.organization.plan}`) : null}
        </span>
      </div>
      <Progress
        value={usagePercent}
        aria-label={t("credits.used")}
        className="**:data-[slot=progress-track]:h-1.5"
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => toast(t("credits.upgradeToast"))}
      >
        <Sparkles /> {t("credits.upgrade")}
      </Button>
    </div>
  )
}
