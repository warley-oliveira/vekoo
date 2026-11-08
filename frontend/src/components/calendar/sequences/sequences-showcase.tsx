import { Fragment, useState, type JSX } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, type Variants } from "motion/react"
import { ArrowLeft, ArrowRight, Check, Settings2, X } from "lucide-react"
import { useNavigate } from "@/lib/router"

import { ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useOpenCount } from "@/hooks/use-panel-session"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

const SLIDES = ["intro", "steps", "triggers", "start"] as const
type SlideKey = (typeof SLIDES)[number]

const SLIDE_OFFSET = 24

const slideVariants: Variants = {
  enter: (direction: number) => ({ x: direction * SLIDE_OFFSET, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -SLIDE_OFFSET, opacity: 0 }),
}

const fadeVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}

type SequencesShowcaseProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  calendarId: string
}

/** A apresentação do recurso, para quem ainda não conhece. Cada abertura começa do primeiro passo. */
export function SequencesShowcase(props: SequencesShowcaseProps): JSX.Element {
  const session = useOpenCount(props.open)
  return session > 0 ? <ShowcaseDialog key={session} {...props} /> : <></>
}

function ShowcaseDialog({ open, onOpenChange, calendarId }: SequencesShowcaseProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const preset = useMotionPreset()
  const [[index, direction], setSlide] = useState<[number, number]>([0, 0])

  const slide = SLIDES[index]
  const isFirst = index === 0
  const isLast = index === SLIDES.length - 1
  const close = () => onOpenChange(false)

  const goTo = (next: number) => setSlide([next, next > index ? 1 : -1])

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("calendar.sequences.showcase.title")}
      description={t("calendar.sequences.showcase.progress", {
        step: index + 1,
        total: SLIDES.length,
      })}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="pointer-coarse:h-10"
            onClick={isFirst ? close : () => goTo(index - 1)}
          >
            {isFirst ? null : <ArrowLeft />}
            {isFirst ? t("calendar.sequences.showcase.dismiss") : t("calendar.sequences.showcase.back")}
          </Button>

          {/* No cartão do celular, os pontos de 40 px empurravam "Continuar" para fora: lá, o passo
              já está no subtítulo, e os botões bastam. */}
          <div className="hidden items-center sm:flex">
            {SLIDES.map((key, position) => (
              <button
                key={key}
                type="button"
                aria-label={t("calendar.sequences.showcase.goTo", { step: position + 1 })}
                aria-current={position === index ? "step" : undefined}
                onClick={() => goTo(position)}
                className="flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-10"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    position === index ? "bg-primary" : "bg-foreground/20"
                  )}
                />
              </button>
            ))}
          </div>

          {isLast ? (
            <Button
              type="button"
              className="pointer-coarse:h-10"
              onClick={() => {
                close()
                navigate(`/calendar/${calendarId}/sequences`)
              }}
            >
              <Settings2 />
              {t("calendar.sequences.showcase.configure")}
            </Button>
          ) : (
            <Button type="button" className="pointer-coarse:h-10" onClick={() => goTo(index + 1)}>
              {t("calendar.sequences.showcase.next")}
              <ArrowRight />
            </Button>
          )}
        </div>
      }
    >
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={slide}
            custom={direction}
            variants={preset.reduced ? fadeVariants : slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={preset.spring}
            className="flex min-h-64 flex-col items-center gap-5 py-2 text-center"
          >
            <div className="flex min-h-24 items-center justify-center">
              <SlideIllustration slide={slide} />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading text-lg leading-snug font-medium">
                {t(`calendar.sequences.showcase.slides.${slide}.title`)}
              </h3>
              <p className="mx-auto max-w-sm text-sm text-pretty text-muted-foreground">
                {t(`calendar.sequences.showcase.slides.${slide}.description`)}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </ResponsiveDialog>
  )
}

/** Um desenho pequeno do que o texto diz, com as peças de verdade: mensagem, passos, comparecimento. */
function SlideIllustration({ slide }: { slide: SlideKey }) {
  const { t } = useTranslation()

  if (slide === "intro") {
    return (
      <div aria-hidden className="flex w-full max-w-xs flex-col gap-1.5 text-left text-sm">
        <p className="w-fit max-w-[85%] rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-pretty">
          {t("calendar.sequences.showcase.illustration.message")}
        </p>
        <p className="w-fit max-w-[85%] self-end rounded-lg rounded-tr-sm bg-accent px-3 py-2 text-pretty text-accent-foreground">
          {t("calendar.sequences.showcase.illustration.reply")}
        </p>
      </div>
    )
  }

  if (slide === "steps") {
    return (
      <ol aria-hidden className="flex items-center">
        {[1, 2, 3].map((step) => (
          <Fragment key={step}>
            {step > 1 ? <li className="h-px w-4 bg-border sm:w-6" /> : null}
            <li className="rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap sm:text-sm">
              {t("calendar.sequences.showcase.illustration.step", { step })}
            </li>
          </Fragment>
        ))}
      </ol>
    )
  }

  if (slide === "triggers") {
    return (
      <div aria-hidden className="flex gap-2">
        <div className="flex min-w-24 flex-col items-center gap-1.5 rounded-lg bg-status-success-soft px-4 py-3 text-status-success">
          <Check className="size-5" />
          <span className="text-sm font-medium">{t("calendar.sequences.trigger.show")}</span>
        </div>
        <div className="flex min-w-24 flex-col items-center gap-1.5 rounded-lg bg-status-danger-soft px-4 py-3 text-status-danger">
          <X className="size-5" />
          <span className="text-sm font-medium">{t("calendar.sequences.trigger.no_show")}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      aria-hidden
      className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground"
    >
      <Settings2 className="size-6" />
    </div>
  )
}
