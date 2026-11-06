import { useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { Camera, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ErrorState,
  Form,
  FormActions,
  SelectField,
  SelectInput,
  SettingsSection,
  TextField,
  TextareaField,
  UnsavedChangesDialog,
  LoadingRegion,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { storeConnector } from "@/hooks/connectors/use-connectors"
import { useApi } from "@/hooks/use-api"
import { apiAssetUrl, apiPatch, apiUpload } from "@/lib/api"
import { connectorErrorMessage } from "@/lib/connectors/channels"
import type { BusinessProfile, Connector, WhatsappCloudConnector } from "@/lib/connectors/types"
import { ChannelMark } from "../channel-mark"

const VERTICALS = [
  "UNDEFINED",
  "OTHER",
  "AUTO",
  "BEAUTY",
  "APPAREL",
  "EDU",
  "ENTERTAIN",
  "EVENT_PLAN",
  "FINANCE",
  "GROCERY",
  "GOVT",
  "HOTEL",
  "HEALTH",
  "NONPROFIT",
  "PROF_SERVICES",
  "RETAIL",
  "TRAVEL",
  "RESTAURANT",
  "NOT_A_BIZ",
] as const

const MAX_PICTURE_BYTES = 5 * 1024 * 1024
const PICTURE_TYPES = ["image/jpeg", "image/png"]

function buildSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  const optionalUrl = z
    .string()
    .refine((value) => !value || /^https?:\/\/\S+$/i.test(value), t("connectors.waba.profile.urlInvalid"))

  return z.object({
    about: z.string().max(139, t("connectors.waba.profile.tooLong", { max: 139 })),
    description: z.string().max(512, t("connectors.waba.profile.tooLong", { max: 512 })),
    email: z
      .string()
      .max(128, t("connectors.waba.profile.tooLong", { max: 128 }))
      .refine((value) => !value || z.email().safeParse(value).success, t("connectors.waba.profile.emailInvalid")),
    vertical: z.string().nullable(),
    address: z.string().max(256, t("connectors.waba.profile.tooLong", { max: 256 })),
    website1: optionalUrl,
    website2: optionalUrl,
  })
}

type ProfileValues = z.infer<ReturnType<typeof buildSchema>>

function toValues(profile: BusinessProfile | undefined): ProfileValues {
  return {
    about: profile?.about ?? "",
    description: profile?.description ?? "",
    email: profile?.email ?? "",
    vertical: profile?.vertical ?? "UNDEFINED",
    address: profile?.address ?? "",
    website1: profile?.websites?.[0] ?? "",
    website2: profile?.websites?.[1] ?? "",
  }
}

/** O perfil que o contato vê no WhatsApp. A Meta é a fonte: lê e grava direto nela. */
export function WabaProfile({ connector }: { connector: WhatsappCloudConnector }) {
  const { t } = useTranslation()
  const numbers = connector.phoneNumberList
  const [phoneId, setPhoneId] = useState<string | null>(connector.phoneNumberId)

  const query = phoneId && phoneId !== connector.phoneNumberId ? `?phoneNumberId=${phoneId}` : ""
  const key = `/connectors/${connector.id}/business-profile${query}`
  const { data, error, isLoading, mutate } = useApi<{ businessProfile: BusinessProfile }>(key, {
    revalidateOnFocus: false,
  })

  return (
    <div className="flex flex-col gap-6">
      {numbers.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <span id="waba-phone-label" className="text-sm font-medium">
            {t("connectors.waba.profile.number")}
          </span>
          <SelectInput
            aria-labelledby="waba-phone-label"
            value={phoneId}
            onChange={(value) => setPhoneId(value)}
            className="md:w-96"
            options={numbers.map((phone) => ({
              value: phone.id,
              label:
                phone.id === connector.phoneNumberId
                  ? t("connectors.waba.profile.primaryNumber", {
                      number: phone.displayPhoneNumber,
                      name: phone.verifiedName,
                    })
                  : `${phone.displayPhoneNumber} · ${phone.verifiedName}`,
            }))}
          />
        </div>
      ) : null}

      {isLoading ? (
        <ProfileSkeleton />
      ) : error ? (
        <ErrorState
          error={error}
          title={t("connectors.waba.profile.loadError")}
          description={t("connectors.waba.profile.loadErrorHint")}
          onRetry={() => void mutate()}
        />
      ) : (
        <ProfileForm
          key={key}
          connector={connector}
          phoneId={phoneId}
          profile={data?.businessProfile}
          onSaved={() => void mutate()}
        />
      )}
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <LoadingRegion className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-10">
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  )
}

function ProfileForm({
  connector,
  phoneId,
  profile,
  onSaved,
}: {
  connector: WhatsappCloudConnector
  phoneId: string | null
  profile: BusinessProfile | undefined
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildSchema(t), [t])
  const values = useMemo(() => toValues(profile), [profile])

  const form = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: values,
    values,
    resetOptions: { keepDirtyValues: true },
    mode: "onBlur",
  })

  async function save(next: ProfileValues) {
    const websites = [next.website1, next.website2].filter(Boolean)
    const { connector: updated } = await apiPatch<{ connector: Connector }>(
      `/connectors/${connector.id}/business-profile`,
      {
        about: next.about,
        description: next.description,
        email: next.email,
        vertical: next.vertical,
        address: next.address,
        websites,
        ...(phoneId ? { phoneNumberId: phoneId } : {}),
      }
    )
    storeConnector(updated)
    form.reset(next)
    onSaved()
    toast.success(t("connectors.waba.profile.saved"))
  }

  return (
    <>
      <UnsavedChangesDialog when={form.formState.isDirty} />
      <SettingsSection
        title={t("connectors.waba.profile.pictureTitle")}
        description={t("connectors.waba.profile.pictureHint")}
      >
        <ProfilePicture
          connectorId={connector.id}
          phoneId={phoneId}
          picture={profile?.profilePictureUrl ?? null}
          onUploaded={onSaved}
        />
      </SettingsSection>
      <div className="mt-6 md:mt-8">
        <SettingsSection
          title={t("connectors.waba.profile.title")}
          description={t("connectors.waba.profile.description")}
        >
          <Form form={form} onSubmit={save} className="flex flex-col gap-4">
            <TextareaField
              control={form.control}
              name="about"
              label={t("connectors.waba.profile.about")}
              placeholder={t("connectors.waba.profile.aboutPlaceholder")}
              hint={t("connectors.waba.profile.aboutHint")}
              maxLength={139}
              showCount
              rows={2}
            />
            <TextareaField
              control={form.control}
              name="description"
              label={t("connectors.waba.profile.descriptionLabel")}
              placeholder={t("connectors.waba.profile.descriptionPlaceholder")}
              maxLength={512}
              showCount
              rows={3}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="email"
                type="email"
                autoComplete="email"
                label={t("connectors.waba.profile.email")}
                placeholder={t("connectors.waba.profile.emailPlaceholder")}
              />
              <SelectField
                control={form.control}
                name="vertical"
                label={t("connectors.waba.profile.vertical")}
                options={VERTICALS.map((value) => ({
                  value,
                  label: t(`connectors.waba.verticals.${value}`),
                }))}
              />
            </div>
            <TextField
              control={form.control}
              name="address"
              label={t("connectors.waba.profile.address")}
              placeholder={t("connectors.waba.profile.addressPlaceholder")}
              maxLength={256}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="website1"
                type="url"
                inputMode="url"
                label={t("connectors.waba.profile.website", { number: 1 })}
                placeholder={t("connectors.waba.profile.websitePlaceholder")}
              />
              <TextField
                control={form.control}
                name="website2"
                type="url"
                inputMode="url"
                label={t("connectors.waba.profile.website", { number: 2 })}
                placeholder={t("connectors.waba.profile.websitePlaceholder")}
              />
            </div>
            <FormActions submitLabel={t("connectors.waba.profile.save")} requireChanges />
          </Form>
        </SettingsSection>
      </div>
    </>
  )
}

function ProfilePicture({
  connectorId,
  phoneId,
  picture,
  onUploaded,
}: {
  connectorId: string
  phoneId: string | null
  picture: string | null
  onUploaded: () => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    if (!PICTURE_TYPES.includes(file.type)) {
      toast.error(t("connectors.waba.profile.pictureType"))
      return
    }
    if (file.size > MAX_PICTURE_BYTES) {
      toast.error(t("connectors.waba.profile.pictureSize"))
      return
    }

    const body = new FormData()
    body.append("file", file)
    if (phoneId) body.append("phoneNumberId", phoneId)

    setUploading(true)
    try {
      await apiUpload(`/connectors/${connectorId}/business-profile/picture`, body)
      onUploaded()
      toast.success(t("connectors.waba.profile.pictureSaved"))
    } catch (error) {
      toast.error(t("connectors.waba.profile.pictureFailed"), {
        description: connectorErrorMessage(error, t),
      })
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="flex items-center gap-3">
      <ChannelMark
        type="whatsapp_cloud"
        picture={picture ? apiAssetUrl(picture) : null}
        size="lg"
      />
      <input
        ref={input}
        type="file"
        accept={PICTURE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="pointer-coarse:h-10"
        disabled={uploading}
        onClick={() => input.current?.click()}
      >
        {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
        {t("connectors.waba.profile.pictureChange")}
      </Button>
    </div>
  )
}
