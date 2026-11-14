import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "@/lib/router"
import { LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { createReferenceImport, useInstagramStatus, useReferenceImports } from "@/admin/api"
import { InstagramTokenBanner } from "@/admin/components/instagram-token-banner"
import { TaxonomySelect } from "@/admin/components/taxonomy-select"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { Field } from "@/components/form-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { NICHES, REFERENCE_SIZES, type Niche, type ReferenceSize } from "@/lib/taxonomy"

// A importação pela Business Discovery do Instagram: os @ de contas
// profissionais, o nicho e o porte sugeridos para os cards que saírem dali. Cada
// conta é uma chamada ao Meta, em segundo plano; o lote abre na tela seguinte.

const MAX_ACCOUNTS = 20

export function ReferenceImportsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const { data: status } = useInstagramStatus()
  const { data, error, isLoading, mutate } = useReferenceImports()
  const [handles, setHandles] = useState("")
  const [niche, setNiche] = useState<Niche | "">("")
  const [size, setSize] = useState<ReferenceSize | "">("")
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const blocked = status?.state === "invalid" || status?.state === "notConfigured"

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting || blocked) return
    if (!handles.trim()) return setFieldError(t("admin.imports.form.required"))

    setSubmitting(true)
    try {
      const created = await createReferenceImport({ handles, niche, size })
      toast.success(t("admin.imports.form.created", { count: created.handles.length }))
      navigate(`/admin/imports/${created.id}`)
    } catch (error) {
      const api = error instanceof ApiError ? error : null
      const invalid = api?.details?.handles
      setFieldError(
        invalid?.length ? t("admin.imports.form.invalid", { handles: invalid.join(", ") }) : (api?.serverMessage ?? t("admin.errors.generic"))
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("admin.imports.title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("admin.imports.description")}</p>
      </div>

      <InstagramTokenBanner showUnconfigured />

      <form noValidate onSubmit={submit} className="grid gap-4 rounded-lg border p-4 sm:p-6 lg:grid-cols-[1fr_16rem]">
        <Field label={t("admin.imports.form.handles")} hint={t("admin.imports.form.handlesHint", { max: MAX_ACCOUNTS })} error={fieldError} className="lg:row-span-3">
          {(field) => (
            <Textarea
              {...field}
              autoFocus
              rows={8}
              spellCheck={false}
              autoCapitalize="none"
              value={handles}
              disabled={blocked}
              placeholder={t("admin.imports.form.handlesPlaceholder")}
              onChange={(event) => {
                setHandles(event.target.value)
                setFieldError(undefined)
              }}
              className="font-mono text-sm"
            />
          )}
        </Field>
        <Field label={t("admin.imports.form.niche")} hint={t("admin.imports.form.nicheHint")}>
          {(field) => (
            <TaxonomySelect
              id={field.id}
              ariaDescribedBy={field["aria-describedby"]}
              value={niche || null}
              options={NICHES}
              labelFor={(code) => t(`taxonomy.niches.${code}`)}
              onChange={(value) => setNiche(value ?? "")}
              placeholder={t("admin.new.niche.placeholder")}
              noneLabel={t("admin.new.niche.none")}
            />
          )}
        </Field>
        <Field label={t("admin.imports.form.size")}>
          {(field) => (
            <TaxonomySelect
              id={field.id}
              value={size || null}
              options={REFERENCE_SIZES}
              labelFor={(code) => t(`admin.taxonomy.sizes.${code}`)}
              onChange={(value) => setSize(value ?? "")}
              placeholder={t("admin.new.size.placeholder")}
              noneLabel={t("admin.new.size.none")}
            />
          )}
        </Field>
        <Button type="submit" disabled={submitting || blocked} className="self-end">
          {submitting && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {t("admin.imports.form.submit")}
        </Button>
      </form>

      <section className="space-y-3" aria-labelledby="recent-imports">
        <h2 id="recent-imports" className="font-heading text-base font-semibold">{t("admin.imports.recent.title")}</h2>
        {error && !data ? (
          <ErrorState error={error} onRetry={() => void mutate()} />
        ) : isLoading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : data && data.referenceImports.length === 0 ? (
          <EmptyState title={t("admin.imports.recent.empty.title")} description={t("admin.imports.recent.empty.description")} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {data?.referenceImports.map((batch) => (
              <li key={batch.id}>
                <Link
                  to={batch.id}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm">
                      {batch.handles.slice(0, 3).map((handle) => `@${handle}`).join(" · ")}
                      {batch.handles.length > 3 && ` ${t("admin.imports.recent.more", { count: batch.handles.length - 3 })}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("admin.imports.recent.counts", {
                        candidates: batch.counts.candidates,
                        highlighted: batch.counts.highlighted,
                        carded: batch.counts.carded,
                      })}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {batch.running && <Badge variant="outline">{t("admin.imports.running")}</Badge>}
                    {batch.counts.errors > 0 && <Badge variant="destructive">{t("admin.imports.recent.errors", { count: batch.counts.errors })}</Badge>}
                    {formatRelative(batch.createdAt, language)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
