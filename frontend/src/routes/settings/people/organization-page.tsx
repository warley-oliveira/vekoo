import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { PeopleAreaNav } from "@/components/people/area-nav"
import { ImagePicker } from "@/components/shared/image-picker"
import {
  ComboboxField,
  Form,
  FormActions,
  FormField,
  InlineError,
  PageBody,
  SettingsSection,
  TextField,
  UnsavedChangesDialog,
} from "@/components/shared"
import { OrganizationBadge } from "@/components/organizations/organization-badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useOrganization } from "@/hooks/people/use-organization"
import type { Organization } from "@/lib/auth"
import { onlyDigits } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"
import { formatCnpj, isValidCnpj } from "@/lib/people/cnpj"
import { errorMessage } from "@/lib/people/error-message"
import { timezoneOptions } from "@/lib/people/timezones"
import type { OrganizationSettings } from "@/lib/people/types"

function settingsOf(organization: Organization): OrganizationSettings {
  return organization.settings as OrganizationSettings
}

function buildIdentitySchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(2, t("people.organization.identity.nameRequired"))
      .max(60, t("people.organization.identity.nameTooLong")),
    timezone: z
      .string()
      .nullable()
      .refine(Boolean, t("people.organization.identity.timezoneRequired")),
  })
}

function buildCompanySchema(t: (key: string) => string) {
  return z.object({
    businessName: z.string().trim(),
    cnpj: z
      .string()
      .refine((cnpj) => !cnpj || isValidCnpj(cnpj), t("people.organization.company.cnpjInvalid")),
  })
}

type IdentityValues = z.infer<ReturnType<typeof buildIdentitySchema>>
type CompanyValues = z.infer<ReturnType<typeof buildCompanySchema>>

const CHAT_FLAGS = ["autoRemoveWaitingOperatorTag", "reopenConversationOnInboundEnabled"] as const
type ChatFlag = (typeof CHAT_FLAGS)[number]

export default function OrganizationPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { organization, error, reload, updateOrganization, uploadLogo, removeLogo } =
    useOrganization()

  const identitySchema = useMemo(() => buildIdentitySchema(t), [t])
  const identityForm = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    defaultValues: { name: organization.name, timezone: organization.timezone },
    mode: "onBlur",
  })

  const company = settingsOf(organization).companyInfo
  const companySchema = useMemo(() => buildCompanySchema(t), [t])
  const companyForm = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      businessName: company?.businessName ?? "",
      cnpj: formatCnpj(company?.cnpj),
    },
    mode: "onBlur",
  })

  // Outra pessoa mudou enquanto esta tela estava aberta: acompanha, sem atropelar uma edição.
  useEffect(() => {
    if (!identityForm.formState.isDirty) {
      identityForm.reset({ name: organization.name, timezone: organization.timezone })
    }
  }, [identityForm, organization.name, organization.timezone])
  const savedBusinessName = company?.businessName ?? ""
  const savedCnpj = formatCnpj(company?.cnpj)
  useEffect(() => {
    if (!companyForm.formState.isDirty) {
      companyForm.reset({ businessName: savedBusinessName, cnpj: savedCnpj })
    }
  }, [companyForm, savedBusinessName, savedCnpj])

  const currentTimezone = organization.timezone
  const zones = useMemo(
    () => timezoneOptions(language, currentTimezone),
    [currentTimezone, language]
  )

  const chat = settingsOf(organization).chatSettings
  const [savingFlag, setSavingFlag] = useState<ChatFlag | null>(null)
  // A chave mudou só nesta aba e a resposta ainda não veio: o interruptor já mostra a escolha.
  const [optimistic, setOptimistic] = useState<Partial<Record<ChatFlag, boolean>>>({})

  async function toggleChatFlag(flag: ChatFlag, value: boolean) {
    setOptimistic((current) => ({ ...current, [flag]: value }))
    setSavingFlag(flag)
    try {
      await updateOrganization({ settings: { chatSettings: { [flag]: value } } })
      toast.success(t("people.organization.chat.saved"))
    } catch (cause) {
      toast.error(errorMessage(t, cause))
    } finally {
      setOptimistic((current) => {
        const next = { ...current }
        delete next[flag]
        return next
      })
      setSavingFlag(null)
    }
  }

  return (
    <PageBody>
      <PeopleAreaNav />
      <UnsavedChangesDialog
        when={identityForm.formState.isDirty || companyForm.formState.isDirty}
      />

      {error ? (
        <div className="rounded-lg border border-dashed">
          <InlineError onRetry={() => void reload()} />
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        <SettingsSection
          title={t("people.organization.logo.title")}
          description={t("people.organization.logo.description")}
        >
          <ImagePicker
            shape="square"
            hasImage={Boolean(organization.logoUrl)}
            preview={
              <OrganizationBadge
                name={organization.name}
                logoUrl={organization.logoUrl}
                className="size-full rounded-none text-2xl"
              />
            }
            labels={{
              upload: t("people.organization.logo.upload"),
              replace: t("people.organization.logo.replace"),
              remove: t("people.organization.logo.remove"),
              removeTitle: t("people.organization.logo.removeTitle"),
              removeDescription: t("people.organization.logo.removeDescription"),
              uploaded: t("people.organization.logo.uploaded"),
              removed: t("people.organization.logo.removed"),
            }}
            onUpload={uploadLogo}
            onRemove={removeLogo}
          />
        </SettingsSection>

        <SettingsSection
          title={t("people.organization.identity.title")}
          description={t("people.organization.identity.description")}
        >
          <Form
            form={identityForm}
            className="flex flex-col gap-4"
            onSubmit={async (values) => {
              const saved = await updateOrganization({
                name: values.name.trim(),
                timezone: values.timezone ?? undefined,
              })
              identityForm.reset({ name: saved.name, timezone: saved.timezone })
              toast.success(t("people.organization.identity.saved"))
            }}
          >
            <TextField
              control={identityForm.control}
              name="name"
              label={t("people.organization.identity.name")}
              autoComplete="organization"
            />
            <ComboboxField
              control={identityForm.control}
              name="timezone"
              label={t("people.organization.identity.timezone")}
              hint={t("people.organization.identity.timezoneHint")}
              options={zones}
              emptyLabel={t("people.organization.identity.timezoneEmpty")}
            />
            <FormActions submitLabel={t("people.organization.identity.submit")} requireChanges />
          </Form>
        </SettingsSection>

        <SettingsSection
          title={t("people.organization.company.title")}
          description={t("people.organization.company.description")}
        >
          <Form
            form={companyForm}
            className="flex flex-col gap-4"
            onSubmit={async (values) => {
              const saved = await updateOrganization({
                settings: {
                  companyInfo: {
                    businessName: values.businessName.trim(),
                    cnpj: onlyDigits(values.cnpj),
                  },
                },
              })
              const info = settingsOf(saved).companyInfo
              companyForm.reset({
                businessName: info?.businessName ?? "",
                cnpj: formatCnpj(info?.cnpj),
              })
              toast.success(t("people.organization.company.saved"))
            }}
          >
            <TextField
              control={companyForm.control}
              name="businessName"
              label={t("people.organization.company.businessName")}
              placeholder={t("people.organization.company.businessNamePlaceholder")}
              optional
            />
            <FormField
              control={companyForm.control}
              name="cnpj"
              label={t("people.organization.company.cnpj")}
              optional
            >
              {({ field, controlProps }) => (
                <Input
                  {...controlProps}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  inputMode="numeric"
                  placeholder={t("people.organization.company.cnpjPlaceholder")}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(formatCnpj(event.target.value))}
                />
              )}
            </FormField>
            <FormActions submitLabel={t("people.organization.company.submit")} requireChanges />
          </Form>
        </SettingsSection>

        <SettingsSection
          title={t("people.organization.chat.title")}
          description={t("people.organization.chat.description")}
        >
          <div className="flex flex-col gap-4">
            {CHAT_FLAGS.map((flag) => (
              <label
                key={flag}
                className="flex cursor-pointer items-center justify-between gap-4 pointer-coarse:min-h-10"
              >
                <span className="min-w-0 space-y-0.5">
                  <span className="block text-sm leading-snug font-medium">
                    {t(`people.organization.chat.${flag}.label`)}
                  </span>
                  <span className="block text-xs leading-snug text-pretty text-muted-foreground">
                    {t(`people.organization.chat.${flag}.hint`)}
                  </span>
                </span>
                <Switch
                  checked={optimistic[flag] ?? Boolean(chat?.[flag])}
                  disabled={savingFlag === flag}
                  onCheckedChange={(checked) => void toggleChatFlag(flag, checked)}
                />
              </label>
            ))}
          </div>
        </SettingsSection>
      </div>
    </PageBody>
  )
}
