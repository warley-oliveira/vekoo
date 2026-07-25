import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useSearchParams } from "react-router"
import { ArrowRight, Loader2, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { AuthLayout } from "@/components/auth-layout"
import { Field, PasswordInput } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthError, DEMO_CREDENTIALS, useAuth } from "@/lib/auth"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Mensagens de validação vêm do i18n, então o schema nasce dentro do render. */
function buildSchema(t: (key: string) => string) {
  return z.object({
    email: z
      .string()
      .min(1, t("auth.validation.emailRequired"))
      .regex(EMAIL_RE, t("auth.validation.emailInvalid")),
    password: z.string().min(1, t("auth.validation.passwordRequired")),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

export function LoginPage() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get("next") ?? "/"
  const schema = useMemo(() => buildSchema(t), [t])

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  })

  async function onSubmit(values: FormValues) {
    try {
      const session = await signIn(values.email, values.password)
      toast(
        t("auth.login.welcomeBack", {
          name: session.account.name.split(" ")[0],
        })
      )
      navigate(next, { replace: true })
    } catch (error) {
      if (error instanceof AuthError) {
        const field =
          error.field === "email" || error.field === "password"
            ? error.field
            : "root"
        setError(field, { message: t(`auth.errors.${error.code}`) })
        return
      }
      setError("root", { message: t("auth.errors.signInFailed") })
    }
  }

  function fillDemo() {
    setValue("email", DEMO_CREDENTIALS.email, { shouldValidate: true })
    setValue("password", DEMO_CREDENTIALS.password, { shouldValidate: true })
  }

  return (
    <AuthLayout
      title={t("auth.login.title")}
      description={t("auth.login.description")}
      footer={
        <>
          {t("auth.login.noAccount")}{" "}
          <Link
            to="/signup"
            className="rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("auth.login.createAccount")}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {errors.root && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {errors.root.message}
          </p>
        )}

        <Field label={t("auth.fields.email")} error={errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              {...register("email")}
              type="email"
              autoComplete="email"
              autoFocus
              inputMode="email"
              placeholder={t("auth.fields.emailPlaceholder")}
              disabled={isSubmitting}
              className="h-10"
            />
          )}
        </Field>

        <Field
          label={t("auth.fields.password")}
          error={errors.password?.message}
          action={
            <Link
              to="/forgot-password"
              className="rounded text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("auth.login.forgotPassword")}
            </Link>
          }
        >
          {(field) => (
            <PasswordInput
              {...field}
              {...register("password")}
              autoComplete="current-password"
              placeholder={t("auth.login.passwordPlaceholder")}
              disabled={isSubmitting}
              className="h-10"
            />
          )}
        </Field>

        <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" /> {t("auth.login.submitting")}
            </>
          ) : (
            <>
              {t("auth.login.submit")} <ArrowRight />
            </>
          )}
        </Button>
      </form>

      {/* Etapa 1 é toda com dados fictícios — então a conta de teste fica à mão. */}
      <div className="mt-5 rounded-lg border border-dashed p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("auth.login.demoHint")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1.5 -ml-1.5 text-accent-foreground"
          onClick={fillDemo}
          disabled={isSubmitting}
        >
          <Wand2 /> {t("auth.login.demoFill")}
        </Button>
      </div>
    </AuthLayout>
  )
}
