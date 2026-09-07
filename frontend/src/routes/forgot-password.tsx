import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trans, useTranslation } from "react-i18next"
import { Link } from "react-router"
import { ArrowLeft, KeyRound, Loader2, MailCheck } from "lucide-react"
import { z } from "zod"

import { AuthLayout } from "@/components/auth-layout"
import { Field } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function buildSchema(t: (key: string) => string) {
  return z.object({
    email: z
      .string()
      .min(1, t("auth.validation.emailRequired"))
      .regex(EMAIL_RE, t("auth.validation.emailInvalid")),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const { requestPasswordReset } = useAuth()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [devToken, setDevToken] = useState<string | null>(null)
  const schema = useMemo(() => buildSchema(t), [t])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
    mode: "onBlur",
  })

  async function onSubmit(values: FormValues) {
    // O Rails responde 202 exista o e-mail ou não — não vazamos cadastro.
    const { token } = await requestPasswordReset(values.email)
    // Ainda não há envio de e-mail: em desenvolvimento o servidor devolve o
    // token, e é ele que deixa o fluxo inteiro ser exercitado.
    if (import.meta.env.DEV && token) setDevToken(token)
    setSentTo(values.email.trim())
  }

  if (sentTo) {
    return (
      <AuthLayout
        title={t("auth.forgot.sentTitle")}
        description={
          <Trans
            i18nKey="auth.forgot.sentDescription"
            values={{ email: sentTo }}
            components={{
              strong: <strong className="font-medium text-foreground" />,
            }}
          />
        }
        footer={
          <>
            {t("auth.forgot.notReceived")}{" "}
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("auth.forgot.tryAnotherEmail")}
            </button>
            .
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <MailCheck className="size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            {t("auth.forgot.sentNote")}
          </p>
        </div>
        {devToken && (
          <div className="mt-4 rounded-lg border border-dashed p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("auth.forgot.devTokenHint")}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1.5 -ml-1.5 text-accent-foreground"
              render={<Link to={`/reset-password/${devToken}`} />}
            >
              <KeyRound /> {t("auth.forgot.devTokenOpen")}
            </Button>
          </div>
        )}
        <Button
          variant="outline"
          className="mt-4 h-10 w-full"
          render={<Link to="/login" />}
        >
          <ArrowLeft /> {t("auth.forgot.backToLogin")}
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t("auth.forgot.title")}
      description={t("auth.forgot.description")}
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-3.5" /> {t("auth.forgot.backToLogin")}
        </Link>
      }
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label={t("auth.fields.email")} error={errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              {...register("email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder={t("auth.fields.emailPlaceholder")}
              disabled={isSubmitting}
              className="h-10"
            />
          )}
        </Field>

        <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" /> {t("auth.forgot.submitting")}
            </>
          ) : (
            t("auth.forgot.submit")
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
