import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"
import { Hammer } from "lucide-react"

// Ocupa o lugar de uma tela enquanto ela é migrada. Export default porque entra por
// `lazy()` (ver `routes/placeholder.ts`).

export default function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-6 py-12 text-center"
    >
      <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Hammer className="size-5" aria-hidden />
      </span>
      <h2 className="font-heading text-xl font-semibold tracking-tight">
        {t(titleKey)}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t("navigation.placeholder.description")}
      </p>
    </motion.div>
  )
}
