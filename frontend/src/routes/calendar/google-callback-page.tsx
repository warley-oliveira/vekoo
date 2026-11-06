import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft, CalendarX2, Loader2, RefreshCw } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"

import { PageBody } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { calendarKey, useCalendarMutations } from "@/hooks/calendar/use-calendars"
import { ApiError, apiGet } from "@/lib/api"
import type { AgendaCalendar } from "@/lib/calendar/types"

/** O id do calendário é o começo do `state`, antes do primeiro ponto. */
function calendarIdOf(state: string | null): string | null {
  return state?.split(".")[0] || null
}

// O `code` do Google vale uma vez só. O que já aconteceu com ele fica guardado nesta aba, para
// recarregar a página não gastar outro pedido e mostrar um erro enganoso: o `state` é único por
// conexão, então serve de chave.
type Attempt = { status: "started" | "done" } | { status: "error"; code: string }

const attemptKey = (state: string) => `vekoo.calendar.google-callback.${state}`

function readAttempt(state: string): Attempt | null {
  try {
    const stored = sessionStorage.getItem(attemptKey(state))
    return stored ? (JSON.parse(stored) as Attempt) : null
  } catch {
    return null
  }
}

function writeAttempt(state: string, attempt: Attempt | null) {
  try {
    if (attempt) sessionStorage.setItem(attemptKey(state), JSON.stringify(attempt))
    else sessionStorage.removeItem(attemptKey(state))
  } catch {
    // Sem storage (aba privada, site bloqueado), recarregar apenas pede de novo: a API recusa o
    // código já usado, com um erro explicado.
  }
}

/** Para onde o Google devolve a pessoa, com `code` e `state`, depois de autorizar. */
export default function GoogleCallbackPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { finishGoogle } = useCalendarMutations()
  const [params] = useSearchParams()

  const code = params.get("code")
  const state = params.get("state")
  const denied = params.get("error")
  const calendarId = calendarIdOf(state)
  const settingsPath = calendarId ? `/calendar/${calendarId}/settings` : "/calendar"

  // Sem o que trocar, o erro já é conhecido e nada vai à rede.
  const initialError = denied ? "denied" : !code || !state || !calendarId ? "missingParams" : null
  const [errorCode, setErrorCode] = useState<string | null>(initialError)
  const started = useRef(false)

  const succeed = useCallback(
    (calendar: AgendaCalendar) => {
      toast.success(
        calendar.googleCalendarConnector?.googleEmail
          ? t("calendar.google.callback.connectedAs", { email: calendar.googleCalendarConnector.googleEmail })
          : t("calendar.google.callback.done")
      )
      navigate(`/calendar/${calendar.id}/settings`, { replace: true })
    },
    [navigate, t]
  )

  const finish = useCallback(
    async (id: string, authCode: string, authState: string) => {
      writeAttempt(authState, { status: "started" })
      try {
        const calendar = await finishGoogle(id, authCode, authState)
        writeAttempt(authState, { status: "done" })
        succeed(calendar)
      } catch (cause) {
        const failure = cause instanceof ApiError ? cause.code : "generic"
        // Sem rede, o pedido nem chegou: o código continua valendo, e dá para insistir.
        writeAttempt(authState, failure === "network" ? null : { status: "error", code: failure })
        setErrorCode(failure)
      }
    },
    [finishGoogle, succeed]
  )

  // Uma vez só: o `code` não vale duas, e o StrictMode rodaria o efeito duas vezes.
  useEffect(() => {
    if (initialError || !code || !state || !calendarId || started.current) return
    started.current = true

    const previous = readAttempt(state)
    if (previous?.status === "error") {
      setErrorCode(previous.code)
      return
    }
    if (previous?.status === "done") {
      navigate(settingsPath, { replace: true })
      return
    }
    if (previous?.status === "started") {
      // Recarregou com o pedido no ar: não dá para saber como terminou sem perguntar.
      apiGet<AgendaCalendar>(calendarKey(calendarId)).then(
        (calendar) => {
          if (calendar.googleCalendarConnected) {
            writeAttempt(state, { status: "done" })
            succeed(calendar)
          } else {
            writeAttempt(state, { status: "error", code: "interrupted" })
            setErrorCode("interrupted")
          }
        },
        () => setErrorCode("interrupted")
      )
      return
    }

    void finish(calendarId, code, state)
  }, [calendarId, code, finish, initialError, navigate, settingsPath, state, succeed])

  function retry() {
    if (!code || !state || !calendarId) return
    setErrorCode(null)
    void finish(calendarId, code, state)
  }

  if (!errorCode) {
    return (
      <PageBody className="min-h-[60dvh] items-center justify-center text-center">
        <div role="status" className="flex flex-col items-center gap-3">
          <Loader2 aria-hidden className="size-6 animate-spin text-muted-foreground" />
          <div className="space-y-1">
            <h1 className="font-heading text-lg leading-snug font-medium">
              {t("calendar.google.callback.working.title")}
            </h1>
            <p className="max-w-sm text-sm text-pretty text-muted-foreground">
              {t("calendar.google.callback.working.description")}
            </p>
          </div>
        </div>
      </PageBody>
    )
  }

  const errorKey = i18n.exists(`calendar.google.callback.errors.${errorCode}.title`)
    ? `calendar.google.callback.errors.${errorCode}`
    : "calendar.google.callback.errors.generic"
  // Calendário de outra organização: voltar para as configurações dele daria em "não existe".
  const backPath = errorCode === "notFound" || errorCode === "forbidden" ? "/calendar" : settingsPath

  return (
    <PageBody className="min-h-[60dvh] items-center justify-center text-center">
      <div role="alert" className="flex flex-col items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-status-danger-soft text-status-danger">
          <CalendarX2 aria-hidden className="size-5" />
        </div>
        <div className="space-y-1">
          <h1 className="font-heading text-lg leading-snug font-medium">{t(`${errorKey}.title`)}</h1>
          <p className="max-w-md text-sm text-pretty text-muted-foreground">{t(`${errorKey}.description`)}</p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant={errorCode === "network" ? "outline" : "default"}
            className="pointer-coarse:h-10"
            nativeButton={false}
            render={<Link to={backPath} replace />}
          >
            <ArrowLeft />
            {t(backPath === "/calendar" ? "calendar.google.callback.backToCalendar" : "calendar.google.callback.backToSettings")}
          </Button>
          {errorCode === "network" ? (
            <Button className="pointer-coarse:h-10" onClick={retry}>
              <RefreshCw />
              {t("calendar.google.callback.retry")}
            </Button>
          ) : null}
        </div>
      </div>
    </PageBody>
  )
}
