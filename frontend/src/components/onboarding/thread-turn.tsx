import { useTranslation } from "react-i18next"
import { RotateCcw } from "lucide-react"

import { BrandSummary } from "@/components/onboarding/brand-summary"
import { AgentLine, Appear, QuestionLabel, StatusLine, Thinking, UserBubble } from "@/components/onboarding/chat-parts"
import { ChoiceEcho, OptionPicker } from "@/components/onboarding/option-picker"
import { Button } from "@/components/ui/button"
import type { BrandCore } from "@/lib/brand-core"
import { topicLabelKey, type OnboardingTurn, type ReplyItem } from "@/lib/onboarding"

type ThreadTurnProps = {
  turn: OnboardingTurn
  brandCore: BrandCore
  isLast: boolean
  /** Este turno tem o resumo mais recente — o único que ganha o cartão inteiro. */
  showsSummary: boolean
  /** A proposta escolhida das que este turno trouxe, se alguma. */
  chosen: number | null
  locked: boolean
  publishing: boolean
  onChoose: (turnId: string, index: number) => void
  onRetry: (turnId: string) => void
  onPublish: () => void
  onAdjust: () => void
}

/** Uma fala da pessoa e o que o agente respondeu a ela. */
export function ThreadTurn(props: ThreadTurnProps) {
  const { turn } = props
  return (
    <div className="space-y-4">
      <Appear>
        <PersonSide turn={turn} brandCore={props.brandCore} />
      </Appear>
      <AgentSide {...props} />
    </div>
  )
}

function PersonSide({ turn, brandCore }: { turn: OnboardingTurn; brandCore: BrandCore }) {
  const { t } = useTranslation()

  switch (turn.kind) {
    case "answer":
      return <UserBubble>{turn.text}</UserBubble>
    case "suggest":
      return <UserBubble className="font-mono text-xs">{t("onboarding.chip")}</UserBubble>
    case "choose":
      return turn.choice ? (
        <UserBubble>
          <ChoiceEcho option={turn.choice.option} assets={brandCore.assets} />
        </UserBubble>
      ) : null
    case "back": {
      // O tema reaberto é o da pergunta que o turno deixou no fio.
      const question = turn.reply.find((item) => item.type === "question")
      return question ? (
        <div className="flex justify-end">
          <StatusLine>{t("onboarding.back.echo", { topic: t(topicLabelKey(question.topic)) })}</StatusLine>
        </div>
      ) : null
    }
    case "logo": {
      const asset = brandCore.assets.find((item) => item.id === turn.assetId)
      return asset ? (
        <UserBubble className="p-2">
          <span className="grid h-20 w-32 place-items-center rounded-lg bg-background p-2">
            <img src={asset.url} alt={asset.name} className="max-h-full max-w-full object-contain" />
          </span>
        </UserBubble>
      ) : null
    }
  }
}

function AgentSide({
  turn,
  brandCore,
  isLast,
  showsSummary,
  chosen,
  locked,
  publishing,
  onChoose,
  onRetry,
  onPublish,
  onAdjust,
}: ThreadTurnProps) {
  const { t } = useTranslation()

  if (turn.status === "thinking") return <Thinking />

  if (turn.status === "failed") {
    return (
      <Appear className="space-y-2">
        <AgentLine>{t("onboarding.errors.modelDown")}</AgentLine>
        {isLast && (
          <Button variant="outline" size="sm" className="h-10" onClick={() => onRetry(turn.id)} disabled={locked}>
            <RotateCcw aria-hidden /> {t("onboarding.errors.retry")}
          </Button>
        )}
      </Appear>
    )
  }

  return (
    <Appear className="space-y-2.5">
      {turn.reply.map((item, index) => (
        <ReplyPiece
          key={index}
          item={item}
          brandCore={brandCore}
          showsSummary={showsSummary}
          chosen={chosen}
          locked={locked}
          publishing={publishing}
          onChoose={(option) => onChoose(turn.id, option)}
          onPublish={onPublish}
          onAdjust={onAdjust}
        />
      ))}
    </Appear>
  )
}

type ReplyPieceProps = {
  item: ReplyItem
  brandCore: BrandCore
  showsSummary: boolean
  chosen: number | null
  locked: boolean
  publishing: boolean
  onChoose: (index: number) => void
  onPublish: () => void
  onAdjust: () => void
}

function ReplyPiece({ item, brandCore, showsSummary, chosen, locked, publishing, onChoose, onPublish, onAdjust }: ReplyPieceProps) {
  const { t } = useTranslation()

  switch (item.type) {
    case "status":
      return <StatusLine>{t(`onboarding.status.${item.topic}`)}</StatusLine>
    case "confirm":
      return <StatusLine>{t(`onboarding.confirm.${item.topic}`)}</StatusLine>
    case "text":
      return <AgentLine>{t(`onboarding.agent.${item.code}`, item.params)}</AgentLine>
    case "followUp":
      return <AgentLine>{item.text}</AgentLine>
    case "question":
      return (
        <div className="space-y-1.5 pt-1">
          <QuestionLabel topic={item.topic} />
          <AgentLine>{t(`onboarding.questions.${item.topic}`)}</AgentLine>
        </div>
      )
    case "options":
      return (
        <div className="pt-1">
          <OptionPicker
            kind={item.kind}
            items={item.items}
            pending={item.pending ?? 0}
            failed={item.failed ?? 0}
            document={brandCore.document}
            assets={brandCore.assets}
            chosen={chosen}
            disabled={locked}
            onChoose={onChoose}
          />
        </div>
      )
    case "summary":
      // Resumos antigos ficam só como a linha do log: o cartão vale uma vez,
      // no fim, com a marca como está agora.
      if (!showsSummary) return <StatusLine>{t("onboarding.summary.done")}</StatusLine>
      return (
        <div className="space-y-3">
          <StatusLine>{t("onboarding.summary.done")}</StatusLine>
          <AgentLine>{t("onboarding.summary.body")}</AgentLine>
          <BrandSummary brandCore={brandCore} publishing={publishing} onPublish={onPublish} onAdjust={onAdjust} />
        </div>
      )
  }
}
