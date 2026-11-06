import { Fragment, useMemo, type ReactNode } from "react"
import { Trans, useTranslation } from "react-i18next"

import { useLanguage } from "@/lib/i18n"
import type { Phrase, TriggerSentenceParts } from "@/lib/pipelines-admin/trigger-sentence"
import { cn } from "@/lib/utils"

const STRONG = { b: <strong className="font-medium text-foreground" /> }

function PhraseText({ phrase }: { phrase: Phrase }) {
  return <Trans i18nKey={phrase.key} values={phrase.values} components={STRONG} />
}

/** "A, B e C", com cada pedaço já marcado. O separador vem do `Intl`. */
function PhraseList({ phrases }: { phrases: Phrase[] }) {
  const language = useLanguage()

  const parts = useMemo(
    () =>
      new Intl.ListFormat(language, { style: "long", type: "conjunction" }).formatToParts(
        phrases.map((_, index) => String(index))
      ),
    [language, phrases]
  )

  return (
    <>
      {parts.map((part, index): ReactNode =>
        part.type === "element" ? (
          <PhraseText key={index} phrase={phrases[Number(part.value)]} />
        ) : (
          <Fragment key={index}>{part.value}</Fragment>
        )
      )}
    </>
  )
}

/**
 * O gatilho em uma frase: é assim que ele aparece na lista e, enquanto se edita, é a prova de que o
 * que está na tela diz o que a pessoa quis dizer.
 */
export function TriggerSentence({
  parts,
  className,
}: {
  parts: TriggerSentenceParts
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <p className={cn("text-sm text-pretty text-muted-foreground", className)}>
      <PhraseText phrase={parts.event} />
      {t("pipelinesAdmin.triggers.sentence.afterEvent")}
      {parts.conditions.length > 0 ? (
        <>
          {t("pipelinesAdmin.triggers.sentence.ifWord")} <PhraseList phrases={parts.conditions} />
          {t("pipelinesAdmin.triggers.sentence.afterEvent")}
        </>
      ) : null}
      <PhraseList phrases={parts.actions} />
      {t("pipelinesAdmin.triggers.sentence.end")}
    </p>
  )
}
