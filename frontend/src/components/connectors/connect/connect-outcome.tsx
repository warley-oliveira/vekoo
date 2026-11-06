import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { motion } from "motion/react"
import { Check, CircleAlert, Clock } from "lucide-react"

import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

type OutcomeTone = "success" | "danger" | "neutral"

const TONES: Record<OutcomeTone, string> = {
  success: "bg-status-success-soft text-status-success",
  danger: "bg-status-danger-soft text-status-danger",
  neutral: "bg-muted text-muted-foreground",
}

/**
 * Como a conexão terminou. A marca entra com uma mola curta e, no sucesso, um anel se abre
 * uma vez: é o que tira os olhos do celular e diz "pronto". Quem pediu menos movimento vê
 * só um fade, com a mesma informação.
 */
function OutcomeMark({ tone, icon }: { tone: OutcomeTone; icon: ReactNode }) {
  const preset = useMotionPreset()

  return (
    <span className="relative flex size-14 items-center justify-center">
      {tone === "success" && !preset.reduced ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-status-success-soft"
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      ) : null}
      <motion.span
        className={cn(
          "relative flex size-14 items-center justify-center rounded-full [&_svg]:size-6",
          TONES[tone]
        )}
        initial={preset.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
        animate={preset.reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={preset.spring}
      >
        {icon}
      </motion.span>
    </span>
  )
}

export type ConnectOutcomeProps = {
  tone: OutcomeTone
  icon?: ReactNode
  title: string
  description?: ReactNode
  /** O motivo do provedor, em geral técnico: fica como apoio, nunca como título. */
  detail?: string | null
  children?: ReactNode
}

export function ConnectOutcome({
  tone,
  icon,
  title,
  description,
  detail,
  children,
}: ConnectOutcomeProps) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const fallbackIcon =
    tone === "success" ? <Check /> : tone === "danger" ? <CircleAlert /> : <Clock />

  return (
    <motion.div
      {...preset.fade}
      role={tone === "danger" ? "alert" : "status"}
      className="flex flex-col items-center gap-3 py-4 text-center"
    >
      <OutcomeMark tone={tone} icon={icon ?? fallbackIcon} />
      <div className="space-y-1">
        <h3 className="font-heading text-lg font-medium">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-md text-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {detail ? (
        <p className="max-w-md rounded-lg bg-muted px-3 py-2 text-xs break-words text-muted-foreground">
          <span className="font-medium">{t("connectors.connect.detail")}</span> {detail}
        </p>
      ) : null}
      {children ? <div className="w-full text-left">{children}</div> : null}
    </motion.div>
  )
}
