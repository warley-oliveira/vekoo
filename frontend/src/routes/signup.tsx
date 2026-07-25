import { useMemo, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router"
import { ArrowRight, Loader2, Users } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { AuthLayout } from "@/components/auth-layout"
import { Field, PasswordInput } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthError, suggestOrganizationName, useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .min(2, t("auth.validation.nameTooShort"))
      .max(60, t("auth.validation.nameTooLong")),
    email: z
      .string()
      .min(1, t("auth.validation.emailRequired"))
      .regex(EMAIL_RE, t("auth.validation.emailInvalid")),
    password: z.string().min(8, t("auth.validation.passwordTooShort")),
    organizationName: z
      .string()
      .min(2, t("auth.validation.organizationTooShort"))
      .max(60, t("auth.validation.nameTooLong")),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

export function SignUpPage() {
  const { t } = useTranslation()
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const schema = useMemo(() => buildSchema(t), [t])
  // Enquanto a pessoa não mexer no nome da conta, ele acompanha o nome dela.
  const organizationTouched = useRef(false)

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", organizationName: "" },
    mode: "onBlur",
  })

  const password = watch("password")

  async function onSubmit(values: FormValues) {
    try {
      const session = await signUp(values)
      toast(
        t("auth.signup.createdToast", {
          organization: session.organization.name,
        }),
        { description: t("auth.signup.createdDescription") }
      )
      navigate("/", { replace: true })
    } catch (error) {
      if (error instanceof AuthError) {
        const field = error.field === "form" ? "root" : error.field
        setError(field, { message: t(`auth.errors.${error.code}`) })
        return
      }
      setError("root", { message: t("auth.errors.signUpFailed") })
    }
  }

  return (
    <AuthLayout
      title={t("auth.signup.title")}
      description={t("auth.signup.description")}
      footer={
        <>
          {t("auth.signup.hasAccount")}{" "}
          <Link
            to="/login"
            className="rounded font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("auth.signup.signIn")}
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

        <Field label={t("auth.fields.name")} error={errors.name?.message}>
          {(field) => (
            <Input
              {...field}
              {...register("name", {
                onBlur: () => {
                  if (organizationTouched.current) return
                  const suggestion = suggestOrganizationName(
                    getValues("name"),
                    t("auth.signup.organizationSuffix")
                  )
                  if (suggestion) setValue("organizationName", suggestion)
                },
              })}
              autoComplete="name"
              autoFocus
              placeholder={t("auth.fields.namePlaceholder")}
              disabled={isSubmitting}
              className="h-10"
            />
          )}
        </Field>

        <Field label={t("auth.fields.email")} error={errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              {...register("email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("auth.fields.emailPlaceholder")}
              disabled={isSubmitting}
              className="h-10"
            />
          )}
        </Field>

        <Field
          label={t("auth.fields.password")}
          error={errors.password?.message}
          hint={t("auth.signup.passwordHint")}
        >
          {(field) => (
            <>
              <PasswordInput
                {...field}
                {...register("password")}
                autoComplete="new-password"
                placeholder={t("auth.signup.passwordPlaceholder")}
                disabled={isSubmitting}
                className="h-10"
              />
              <PasswordStrength password={password} />
            </>
          )}
        </Field>

        {/* Toda conta nasce dentro de uma organização — é ela que vai receber
            as pessoas convidadas quando o recurso chegar. */}
        <Field
          label={t("auth.fields.organizationName")}
          error={errors.organizationName?.message}
          hint={t("auth.signup.organizationHint")}
        >
          {(field) => (
            <Input
              {...field}
              {...register("organizationName", {
                onChange: () => {
                  organizationTouched.current = true
                },
              })}
              autoComplete="organization"
              placeholder={t("auth.fields.organizationPlaceholder")}
              disabled={isSubmitting}
              className="h-10"
            />
          )}
        </Field>

        <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" /> {t("auth.signup.submitting")}
            </>
          ) : (
            <>
              {t("auth.signup.submit")} <ArrowRight />
            </>
          )}
        </Button>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Users className="mt-px size-3.5 shrink-0" />
          {t("auth.signup.ownerNote")}
        </p>
      </form>
    </AuthLayout>
  )
}

/* ---------- força da senha ---------- */

/** Medidor discreto: só três níveis, sem sermão sobre caractere especial. */
function passwordScore(password: string): 0 | 1 | 2 | 3 {
  if (password.length === 0) return 0
  let score = password.length >= 8 ? 1 : 0
  if (password.length >= 12) score += 1
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) score += 1
  return Math.min(score, 3) as 0 | 1 | 2 | 3
}

const STRENGTH_KEYS = ["", "weak", "good", "strong"] as const

function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation()
  const score = passwordScore(password)
  if (score === 0) return null

  return (
    <div className="flex items-center gap-2 pt-1.5">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3].map((level) => (
          <span
            key={level}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              score >= level ? "bg-primary" : "bg-border"
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {t(`auth.signup.strength.${STRENGTH_KEYS[score]}`)}
      </span>
    </div>
  )
}
