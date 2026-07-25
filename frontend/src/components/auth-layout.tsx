import type { ReactNode } from "react"
import { Link } from "react-router"
import { Trans, useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"

import { VekooMark } from "@/components/app-sidebar"
import { CardArt } from "@/components/editor/card-art"
import { buildSeed, type Carousel } from "@/lib/mock-data"

// Moldura das telas de entrada. Duas colunas: à esquerda o formulário, com o
// mesmo silêncio do resto da interface; à direita a única coisa colorida da
// tela — capas de carrossel de verdade, que mostram em dois segundos o que a
// ferramenta entrega. No mobile a coluna da vitrine sai (ninguém se cadastra
// admirando decoração num celular).

const SHOWCASE: Carousel[] = buildSeed(0)
  .carousels.filter((c) => c.trashedAt === null)
  .slice(0, 3)

type AuthLayoutProps = {
  title: string
  description: ReactNode
  children: ReactNode
  /** Linha de rodapé do formulário (ex.: "Não tem conta? Criar conta"). */
  footer?: ReactNode
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Link
          to="/login"
          className="inline-flex w-fit rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={t("auth.layout.markAria")}
        >
          <VekooMark className="text-xl" />
        </Link>

        <motion.main
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10"
        >
          <div className="space-y-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
              {title}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="mt-7">{children}</div>

          {footer && (
            <div className="mt-7 text-sm text-muted-foreground">{footer}</div>
          )}
        </motion.main>

        <p className="mx-auto w-full max-w-sm text-xs text-muted-foreground/80">
          <Trans
            i18nKey="auth.layout.legal"
            components={{
              terms: <AuthFootnoteLink />,
              privacy: <AuthFootnoteLink />,
            }}
          />
        </p>
      </div>

      <Showcase reduceMotion={Boolean(reduceMotion)} />
    </div>
  )
}

function AuthFootnoteLink({ children }: { children?: ReactNode }) {
  return (
    <span className="underline decoration-border underline-offset-2">
      {children}
    </span>
  )
}

/** Vitrine: capas reais em leque, só no desktop. */
function Showcase({ reduceMotion }: { reduceMotion: boolean }) {
  const { t } = useTranslation()

  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden border-l bg-secondary/60 lg:flex lg:flex-col lg:justify-center"
    >
      <div className="px-12 xl:px-16">
        <p className="font-heading text-xl leading-snug font-semibold tracking-tight text-balance">
          {t("auth.layout.showcaseTitle")}
          <br />
          <span className="text-muted-foreground">
            {t("auth.layout.showcaseSubtitle")}
          </span>
        </p>

        <div className="mt-10 flex items-end gap-4">
          {SHOWCASE.map((carousel, index) => (
            <motion.div
              key={carousel.id}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: reduceMotion ? 0 : 0.1 + index * 0.08,
                ease: "easeOut",
              }}
              style={{ rotate: `${(index - 1) * 2.5}deg` }}
              className="min-w-0 max-w-[15rem] flex-1 shadow-[0_18px_40px_-24px_oklch(0.185_0.005_285/0.45)]"
            >
              <CardArt
                card={carousel.cards[0]}
                theme={carousel.theme}
                format={carousel.format}
              />
            </motion.div>
          ))}
        </div>

        <dl className="mt-12 flex gap-10">
          <ShowcaseStat
            value={t("auth.layout.statCardsValue")}
            label={t("auth.layout.statCardsLabel")}
          />
          <ShowcaseStat
            value={t("auth.layout.statCreditsValue")}
            label={t("auth.layout.statCreditsLabel")}
          />
        </dl>
      </div>
    </aside>
  )
}

function ShowcaseStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-heading text-lg font-semibold tracking-tight">
        {value}
      </dt>
      <dd className="mt-0.5 max-w-[14ch] text-xs leading-snug text-muted-foreground">
        {label}
      </dd>
    </div>
  )
}
