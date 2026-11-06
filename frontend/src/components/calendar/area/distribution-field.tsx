import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Check } from "lucide-react"

import { Callout, NumberInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { Professional } from "@/lib/calendar/types"
import { getReadableTextColor } from "@/lib/tag-color"
import { cn } from "@/lib/utils"
import {
  FULL,
  MIN_SHARE,
  scaleTo,
  splitEvenly,
  sumOf,
  withBoundaryMoved,
  withMember,
  withoutMember,
  type Distribution,
} from "./distribution"

/** Sem cor gravada, o cinza do tema: a barra não pode ficar transparente. */
const NO_COLOR = "var(--muted-foreground)"
/** Abaixo disto, o número não cabe dentro da fatia. */
const LABEL_MIN_WIDTH = 9

type DragState = { leftId: string; rightId: string; startX: number; startLeft: number; unit: number }

/** A barra com as fatias: arrastar a divisa passa porcentagem de um vizinho para o outro. */
function ShareBar({
  professionals,
  value,
  onChange,
}: {
  professionals: Professional[]
  value: Distribution
  onChange: (next: Distribution) => void
}) {
  const { t } = useTranslation()
  const bar = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)

  const active = professionals.filter((professional) => (value[professional.id] ?? 0) > 0)
  const sum = sumOf(value)
  // Passando de 100, a barra encolhe tudo por igual: a fatia continua proporcional ao que está lá.
  const scale = Math.max(sum, FULL)
  const widthOf = (share: number) => (share / scale) * 100
  const missing = FULL - sum

  function onPointerDown(
    event: PointerEvent<HTMLDivElement>,
    leftId: string,
    rightId: string
  ) {
    const width = bar.current?.getBoundingClientRect().width
    if (!width) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      leftId,
      rightId,
      startX: event.clientX,
      startLeft: value[leftId],
      unit: scale / width,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const { leftId, rightId, startX, startLeft, unit } = drag.current
    onChange(
      withBoundaryMoved(value, leftId, rightId, startLeft + (event.clientX - startX) * unit)
    )
  }

  function onHandleKey(event: KeyboardEvent<HTMLDivElement>, leftId: string, rightId: string) {
    const step = event.shiftKey ? 5 : 1
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? step
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -step
          : 0
    if (delta === 0) return
    event.preventDefault()
    onChange(withBoundaryMoved(value, leftId, rightId, value[leftId] + delta))
  }

  let position = 0

  return (
    <div
      ref={bar}
      className="relative flex h-10 w-full overflow-hidden rounded-lg bg-muted select-none"
    >
      {active.map((professional) => {
        const color = professional.color ?? NO_COLOR
        const width = widthOf(value[professional.id])
        return (
          <div
            key={professional.id}
            title={t("calendar.services.card.share", {
              name: professional.name,
              value: value[professional.id],
            })}
            // Cor escolhida pela pessoa, com o texto calculado para continuar legível.
            style={{
              width: `${width}%`,
              backgroundColor: color,
              color: getReadableTextColor(color),
            }}
            className="flex shrink-0 items-center justify-center overflow-hidden text-xs font-medium tabular-nums"
          >
            {width >= LABEL_MIN_WIDTH
              ? t("calendar.services.distribution.percent", { value: value[professional.id] })
              : null}
          </div>
        )
      })}

      {missing > 0 ? (
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden text-xs text-muted-foreground">
          {sum > 0 && widthOf(missing) >= 18
            ? t("calendar.services.distribution.missing", { value: missing })
            : null}
        </div>
      ) : null}

      {active.slice(0, -1).map((professional, index) => {
        const next = active[index + 1]
        const left = value[professional.id]
        position += widthOf(left)
        return (
          <div
            key={professional.id}
            role="slider"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label={t("calendar.services.distribution.handle", {
              left: professional.name,
              right: next.name,
            })}
            aria-valuemin={MIN_SHARE}
            aria-valuemax={left + value[next.id] - MIN_SHARE}
            aria-valuenow={left}
            aria-valuetext={t("calendar.services.distribution.handleValue", {
              left: professional.name,
              leftValue: left,
              right: next.name,
              rightValue: value[next.id],
            })}
            style={{ left: `${position}%` }}
            className="group absolute inset-y-0 z-10 flex w-5 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center outline-none pointer-coarse:w-10"
            onPointerDown={(event) => onPointerDown(event, professional.id, next.id)}
            onPointerMove={onPointerMove}
            onPointerUp={() => {
              drag.current = null
            }}
            onPointerCancel={() => {
              drag.current = null
            }}
            onKeyDown={(event) => onHandleKey(event, professional.id, next.id)}
          >
            <span
              aria-hidden
              className="h-5 w-1 rounded-full bg-background shadow-xs ring-1 ring-foreground/20 transition-transform group-hover:scale-y-125 group-focus-visible:scale-y-125 group-focus-visible:ring-3 group-focus-visible:ring-ring/60"
            />
          </div>
        )
      })}
    </div>
  )
}

type DistributionFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> = {
  control: Control<TValues, any, any>
  name: TName
  professionals: Professional[]
  /** A soma já vinha errada ao abrir o painel: alguém saiu do serviço. */
  brokenAtStart: boolean
}

/**
 * Quem atende o serviço e com quanto. A tela ajuda a fechar os 100: mostra quanto falta, reparte por
 * igual, completa mantendo a proporção, e explica o caso em que a soma caiu porque alguém saiu.
 */
export function DistributionField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  professionals,
  brokenAtStart,
}: DistributionFieldProps<TValues, TName>) {
  const { t } = useTranslation()
  const { field, fieldState, formState } = useController({ control, name })
  const value = field.value as Distribution

  const sum = sumOf(value)
  const members = professionals.filter((professional) => (value[professional.id] ?? 0) > 0)
  const balanced = sum === FULL
  const showError = !balanced && formState.submitCount > 0
  const serverError = fieldState.error?.type === "server" ? fieldState.error.message : undefined
  const showBrokenNotice = brokenAtStart && !balanced

  const splitAll = () => {
    const ids = (members.length > 0 ? members : professionals).map(({ id }) => id)
    field.onChange(splitEvenly(ids, value))
  }

  return (
    <div ref={field.ref} tabIndex={-1} className="flex flex-col gap-3 rounded-lg outline-none">
      {serverError ? (
        <p role="alert" className="text-xs leading-snug text-destructive">
          {t("calendar.services.distribution.server", { message: serverError })}
        </p>
      ) : null}

      {showBrokenNotice ? (
        <Callout
          tone="warning"
          role="status"
          icon={<AlertTriangle />}
          title={
            sum > 0
              ? t("calendar.services.distribution.broken.title")
              : t("calendar.services.distribution.broken.titleEmpty")
          }
          action={
            members.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:h-10"
                onClick={() => field.onChange(scaleTo(value))}
              >
                {t("calendar.services.distribution.broken.fix", { value: FULL - sum })}
              </Button>
            ) : undefined
          }
        >
          {sum > 0
            ? t("calendar.services.distribution.broken.description", { sum })
            : t("calendar.services.distribution.broken.descriptionEmpty")}
        </Callout>
      ) : null}

      <ShareBar professionals={professionals} value={value} onChange={field.onChange} />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p
          aria-live="polite"
          className={cn(
            "flex min-h-7 items-center gap-1.5 text-xs leading-snug",
            balanced && "text-muted-foreground",
            !balanced && !showError && "text-status-warning",
            showError && "text-destructive"
          )}
        >
          {balanced ? <Check aria-hidden className="size-3.5" /> : null}
          {balanced
            ? t("calendar.services.distribution.balanced")
            : members.length === 0
              ? t("calendar.services.distribution.nobody")
              : sum < FULL
                ? t("calendar.services.distribution.missing", { value: FULL - sum })
                : t("calendar.services.distribution.over", { value: sum - FULL })}
        </p>
        <div className="flex flex-wrap gap-1">
          {!balanced && members.length > 0 && !showBrokenNotice ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground pointer-coarse:h-10"
              onClick={() => field.onChange(scaleTo(value))}
            >
              {t("calendar.services.distribution.keepProportion")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:h-10"
            onClick={splitAll}
          >
            {t("calendar.services.distribution.evenly")}
          </Button>
        </div>
      </div>

      <ul className="flex flex-col divide-y">
        {professionals.map((professional) => {
          const share = value[professional.id] ?? 0
          const inputId = `share-${professional.id}`
          return (
            <li key={professional.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <Checkbox
                className="border-muted-foreground/40"
                checked={share > 0}
                aria-label={t("calendar.services.distribution.include", {
                  name: professional.name,
                })}
                onCheckedChange={(checked) =>
                  field.onChange(
                    checked
                      ? withMember(value, professional.id)
                      : withoutMember(value, professional.id)
                  )
                }
              />
              <span
                aria-hidden
                // Cor escolhida pela pessoa: é a da fatia, para ligar a linha à barra.
                style={{ backgroundColor: professional.color ?? NO_COLOR }}
                className="size-2.5 shrink-0 rounded-full"
              />
              <label htmlFor={inputId} className="min-w-0 flex-1 truncate text-sm">
                {professional.name}
              </label>
              <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <NumberInput
                  id={inputId}
                  steppers
                  min={0}
                  max={FULL}
                  step={1}
                  format={{ maximumFractionDigits: 0 }}
                  value={share}
                  className="w-28 pointer-coarse:w-32"
                  onChange={(next) =>
                    field.onChange({
                      ...value,
                      [professional.id]: Math.min(FULL, Math.max(0, Math.round(next ?? 0))),
                    })
                  }
                />
                <span aria-hidden>{t("calendar.services.distribution.percentSign")}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
