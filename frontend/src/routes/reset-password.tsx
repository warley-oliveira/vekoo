import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams } from "react-router"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { AuthLayout } from "@/components/auth-layout"
import { Field, PasswordInput } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"

// Escolher a nova senha, com o token que veio no link do e-mail.
//
// Ao trocar a senha o Rails derruba todas as sessões da conta — de propósito:
// quem pediu a redefinição pode estar justamente tirando alguém de dentro. Por
// isso o fim do caminho é a tela de entrada, não a biblioteca.

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      password: z
        .string()
        .min(1, t("auth.validation.passwordRequired"))
        .min(8, t("auth.validation.passwordTooShort")),
      confirm: z.string().min(1, t("auth.validation.passwordRequired")),
    })
    .refine((values) => values.password === values.confirm, {
      path: ["confirm"],
      message: t("auth.reset.mismatch"),
    })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const { token = "" } = useParams()
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const [expired, setExpired] = useState(false)
  const schema = useMemo(() => buildSchema(t), [t])

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
    mode: "onBlur",
  })

  async function onSubmit(values: FormValues) {
    try {
      await resetPassword(token, values.password)
      toast.success(t("auth.reset.doneToast"), {
        description: t("auth.reset.doneDescription"),
      })
      navigate("/login", { replace: true })
    } catch (error) {
      // Token gasto, vencido ou inventado: não é erro de campo, é fim de linha
      // para este link.
      if (error instanceof ApiError && error.code === "resetTokenInvalid") {
        setExpired(true)
        return
      }
      if (error instanceof ApiError && error.details?.password?.[0]) {
        setError("password", { message: error.details.password[0] })
        return
      }
      setError("password", { message: t("errors.unknown") })
    }
  }

  if (expired) {
    return (
      <AuthLayout
        title={t("auth.reset.invalidTitle")}
        description={t("auth.reset.invalidDescription")}
        footer={
          <Link to="/login" className="font-medium text-foreground hover:underline">
            {t("auth.login.submit")}
          </Link>
        }
      >
        <Button
          render={<Link to="/forgot-password" />}
          className="w-full"
          size="lg"
        >
          {t("auth.reset.requestAgain")}
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t("auth.reset.title")}
      description={t("auth.reset.description")}
      footer={
        <Link to="/login" className="font-medium text-foreground hover:underline">
          {t("auth.login.submit")}
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label={t("auth.reset.password")} error={errors.password?.message}>
          {(field) => (
            <PasswordInput
              {...field}
              {...register("password")}
              autoFocus
              autoComplete="new-password"
              placeholder={t("auth.reset.passwordPlaceholder")}
              disabled={isSubmitting}
              className="h-10"
            />
          )}
        </Field>

        <Field label={t("auth.reset.confirm")} error={errors.confirm?.message}>
          {(field) => (
            <PasswordInput
              {...field}
              {...register("confirm")}
              autoComplete="new-password"
              placeholder={t("auth.reset.confirmPlaceholder")}
              disabled={isSubmitting}
              className="h-10"
            />
          )}
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              {t("auth.reset.submitting")}
            </>
          ) : (
            t("auth.reset.submit")
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
