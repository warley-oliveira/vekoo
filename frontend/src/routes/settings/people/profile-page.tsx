import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { AccountAreaNav } from "@/components/people/area-nav"
import { ImagePicker } from "@/components/shared/image-picker"
import {
  Field,
  Form,
  FormActions,
  PageBody,
  PhoneField,
  SelectInput,
  SettingsSection,
  TextField,
  UnsavedChangesDialog,
  UserAvatar,
} from "@/components/shared"
import { Input } from "@/components/ui/input"
import { useProfile } from "@/hooks/people/use-profile"
import { apiAssetUrl } from "@/lib/api"
import { isValidPhone } from "@/lib/format-phone"
import { SUPPORTED_LANGUAGES, useLanguage } from "@/lib/i18n"

const MIN_PASSWORD = 8

function buildProfileSchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(2, t("people.profile.fields.nameRequired"))
      .max(60, t("people.profile.fields.nameTooLong")),
    phone: z
      .string()
      .refine((phone) => !phone || isValidPhone(phone), t("people.profile.fields.phoneInvalid")),
  })
}

function buildPasswordSchema(t: (key: string) => string) {
  return z
    .object({
      currentPassword: z.string().min(1, t("people.profile.password.currentRequired")),
      password: z.string().min(MIN_PASSWORD, t("people.profile.password.tooShort")),
      passwordConfirmation: z.string(),
    })
    .refine((values) => values.password === values.passwordConfirmation, {
      path: ["passwordConfirmation"],
      message: t("people.profile.password.mismatch"),
    })
}

type ProfileValues = z.infer<ReturnType<typeof buildProfileSchema>>
type PasswordValues = z.infer<ReturnType<typeof buildPasswordSchema>>

export default function ProfilePage() {
  const { t, i18n } = useTranslation()
  const language = useLanguage()
  const { account, updateProfile, uploadAvatar, removeAvatar } = useProfile()

  const profileSchema = useMemo(() => buildProfileSchema(t), [t])
  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: account.name, phone: account.phone ?? "" },
    mode: "onBlur",
  })

  // Mudou em outro aparelho enquanto esta tela estava aberta: acompanha, se a pessoa não
  // estiver no meio de uma edição.
  useEffect(() => {
    if (!profileForm.formState.isDirty) {
      profileForm.reset({ name: account.name, phone: account.phone ?? "" })
    }
  }, [account.name, account.phone, profileForm])

  const passwordSchema = useMemo(() => buildPasswordSchema(t), [t])
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", password: "", passwordConfirmation: "" },
    mode: "onBlur",
  })

  return (
    <PageBody>
      <AccountAreaNav />
      <UnsavedChangesDialog
        when={profileForm.formState.isDirty || passwordForm.formState.isDirty}
      />

      <div className="flex flex-col gap-6">
        <SettingsSection
          title={t("people.profile.photo.title")}
          description={t("people.profile.photo.description")}
        >
          <ImagePicker
            hasImage={Boolean(account.avatarUrl)}
            preview={
              <UserAvatar
                name={account.name}
                src={account.avatarUrl ? apiAssetUrl(account.avatarUrl) : null}
                className="size-full [&_[data-slot=avatar-fallback]]:text-2xl"
              />
            }
            labels={{
              upload: t("people.profile.photo.upload"),
              replace: t("people.profile.photo.replace"),
              remove: t("people.profile.photo.remove"),
              removeTitle: t("people.profile.photo.removeTitle"),
              removeDescription: t("people.profile.photo.removeDescription"),
              uploaded: t("people.profile.photo.uploaded"),
              removed: t("people.profile.photo.removed"),
            }}
            onUpload={uploadAvatar}
            onRemove={removeAvatar}
          />
        </SettingsSection>

        <SettingsSection
          title={t("people.profile.details.title")}
          description={t("people.profile.details.description")}
        >
          <Form
            form={profileForm}
            className="flex flex-col gap-4"
            onSubmit={async (values) => {
              const saved = await updateProfile({
                name: values.name.trim(),
                phone: values.phone || null,
              })
              profileForm.reset({ name: saved.name, phone: saved.phone ?? "" })
              toast.success(t("people.profile.details.saved"))
            }}
          >
            <TextField
              control={profileForm.control}
              name="name"
              label={t("people.profile.fields.name")}
              autoComplete="name"
            />
            <Field
              label={t("people.profile.fields.email")}
              hint={t("people.profile.fields.emailHint")}
            >
              {(field) => <Input {...field} value={account.email} disabled readOnly />}
            </Field>
            <PhoneField
              control={profileForm.control}
              name="phone"
              label={t("people.profile.fields.phone")}
              optional
            />
            <FormActions submitLabel={t("people.profile.details.submit")} requireChanges />
          </Form>
        </SettingsSection>

        <SettingsSection
          title={t("people.profile.language.title")}
          description={t("people.profile.language.description")}
        >
          <SelectInput
            aria-label={t("people.profile.language.title")}
            value={language}
            onChange={(next) => {
              if (next) void i18n.changeLanguage(next)
            }}
            options={SUPPORTED_LANGUAGES.map((code) => ({
              value: code,
              label: t(`language.${code}`),
            }))}
            className="sm:max-w-xs"
          />
        </SettingsSection>

        <SettingsSection
          title={t("people.profile.password.title")}
          description={t("people.profile.password.description")}
        >
          <Form
            form={passwordForm}
            className="flex flex-col gap-4"
            onSubmit={async (values) => {
              await updateProfile(values)
              passwordForm.reset()
              toast.success(t("people.profile.password.saved"))
            }}
          >
            <TextField
              control={passwordForm.control}
              name="currentPassword"
              type="password"
              label={t("people.profile.password.current")}
              autoComplete="current-password"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={passwordForm.control}
                name="password"
                type="password"
                label={t("people.profile.password.new")}
                hint={t("people.profile.password.hint")}
                autoComplete="new-password"
              />
              <TextField
                control={passwordForm.control}
                name="passwordConfirmation"
                type="password"
                label={t("people.profile.password.confirmation")}
                autoComplete="new-password"
              />
            </div>
            <FormActions submitLabel={t("people.profile.password.submit")} requireChanges />
          </Form>
        </SettingsSection>
      </div>
    </PageBody>
  )
}
