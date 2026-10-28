import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, X } from "lucide-react"
import { toast } from "sonner"

import { createReference, type ReferenceDraft } from "@/admin/api"
import { TaxonomySelect } from "@/admin/components/taxonomy-select"
import { TermsInput } from "@/admin/components/terms-input"
import { Field } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError } from "@/lib/api"
import { NICHES, REFERENCE_SIZES } from "@/lib/taxonomy"
import { cn } from "@/lib/utils"

// O cadastro de uma referência: as imagens do post (ou o link direto de uma
// imagem) e o que a curadoria já sabe. A análise roda em segundo plano e a
// tela de revisão mostra quando termina.

const MAX_FILES = 10
const MAX_BYTES = 10 * 1024 * 1024

const EMPTY: ReferenceDraft = { images: [], url: "", channel: "", niche: "", size: "", bannedTerms: [], baselineMedian: "" }

export function ReferenceNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<ReferenceDraft>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof ReferenceDraft, string>>>({})
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Prévia local de cada arquivo, liberada quando ele sai da lista.
  const previews = useMemo(() => draft.images.map((file) => URL.createObjectURL(file)), [draft.images])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const set = <K extends keyof ReferenceDraft>(key: K, value: ReferenceDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files)
    const images = incoming.filter((file) => file.type.startsWith("image/") && file.size <= MAX_BYTES)
    if (images.length < incoming.length) toast.error(t("admin.new.images.skipped"))
    const next = [...draft.images, ...images].slice(0, MAX_FILES)
    if (draft.images.length + images.length > MAX_FILES) toast.error(t("admin.new.images.tooMany", { max: MAX_FILES }))
    set("images", next)
  }

  const move = (index: number, delta: number) => {
    const next = [...draft.images]
    const [file] = next.splice(index, 1)
    next.splice(index + delta, 0, file)
    set("images", next)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    const local: typeof errors = {}
    if (draft.images.length === 0 && !draft.url.trim()) local.images = t("admin.new.images.required")
    if (draft.url && !/^https?:\/\/\S+$/i.test(draft.url.trim())) local.url = t("admin.new.url.invalid")
    if (draft.baselineMedian && !(Number(draft.baselineMedian) > 0)) local.baselineMedian = t("admin.new.baseline.invalid")
    if (Object.keys(local).length) return setErrors(local)

    setSubmitting(true)
    try {
      const card = await createReference({ ...draft, url: draft.url.trim(), channel: draft.channel.trim() })
      toast.success(t("admin.new.created"))
      navigate(`/admin/references/${card.id}`)
    } catch (error) {
      const field = error instanceof ApiError ? error.field : undefined
      const message = error instanceof ApiError && error.serverMessage ? error.serverMessage : t("admin.errors.generic")
      if (field === "images" || field === "url") setErrors({ [field]: message })
      else toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" render={<Link to="/admin/references" />}>
          <ArrowLeft aria-hidden />
          {t("admin.new.back")}
        </Button>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("admin.new.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.new.description")}</p>
      </div>

      <section className="space-y-3" aria-labelledby="reference-images">
        <div>
          <h2 id="reference-images" className="text-sm font-medium">{t("admin.new.images.label")}</h2>
          <p className="text-xs text-muted-foreground">{t("admin.new.images.hint", { max: MAX_FILES })}</p>
        </div>
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "rounded-lg border border-dashed p-4 transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
            errors.images && "border-destructive"
          )}
        >
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <AnimatePresence initial={false}>
              {draft.images.map((file, index) => (
                <motion.li
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.25 }}
                  className="group relative"
                >
                  <img src={previews[index]} alt={t("admin.new.images.preview", { index: index + 1 })} className="aspect-[4/5] w-full object-cover" />
                  <span className="absolute top-1 left-1 bg-background/90 px-1.5 font-mono text-[0.7rem]">{index + 1}</span>
                  <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                    <span className="flex gap-1">
                      <Button type="button" size="icon-xs" variant="secondary" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("admin.new.images.moveLeft")}>
                        <ArrowLeft aria-hidden />
                      </Button>
                      <Button type="button" size="icon-xs" variant="secondary" disabled={index === draft.images.length - 1} onClick={() => move(index, 1)} aria-label={t("admin.new.images.moveRight")}>
                        <ArrowRight aria-hidden />
                      </Button>
                    </span>
                    <Button type="button" size="icon-xs" variant="secondary" onClick={() => set("images", draft.images.filter((_, i) => i !== index))} aria-label={t("admin.new.images.remove")}>
                      <X aria-hidden />
                    </Button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
            {draft.images.length < MAX_FILES && (
              <li>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 rounded-md bg-muted/50 text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <ImagePlus className="size-5" aria-hidden />
                  {t("admin.new.images.add")}
                </button>
              </li>
            )}
          </ul>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files)
              event.target.value = ""
            }}
          />
          <p className="mt-3 text-xs text-muted-foreground">{t("admin.new.images.drop")}</p>
        </div>
        {errors.images && <p role="alert" className="text-xs text-destructive">{errors.images}</p>}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("admin.new.url.label")} hint={t("admin.new.url.hint")} error={errors.url} className="sm:col-span-2">
          {(field) => (
            // i18n-exempt: o esquema da URL não se traduz.
            <Input {...field} type="url" inputMode="url" spellCheck={false} value={draft.url} onChange={(event) => set("url", event.target.value)} placeholder="https://" />
          )}
        </Field>
        <Field label={t("admin.new.channel.label")} hint={t("admin.new.channel.hint")}>
          {(field) => (
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground" aria-hidden>
                @
              </span>
              <Input {...field} className="pl-7" spellCheck={false} autoCapitalize="none" value={draft.channel.replace(/^@/, "")} onChange={(event) => set("channel", event.target.value)} />
            </div>
          )}
        </Field>
        <Field label={t("admin.new.baseline.label")} hint={t("admin.new.baseline.hint")} error={errors.baselineMedian}>
          {(field) => (
            <Input {...field} type="number" min={1} inputMode="numeric" value={draft.baselineMedian} onChange={(event) => set("baselineMedian", event.target.value)} />
          )}
        </Field>
        <Field label={t("admin.new.niche.label")} hint={t("admin.new.niche.hint")}>
          {(field) => (
            <TaxonomySelect
              id={field.id}
              ariaDescribedBy={field["aria-describedby"]}
              value={draft.niche || null}
              options={NICHES}
              labelFor={(code) => t(`taxonomy.niches.${code}`)}
              onChange={(value) => set("niche", value ?? "")}
              placeholder={t("admin.new.niche.placeholder")}
              noneLabel={t("admin.new.niche.none")}
            />
          )}
        </Field>
        <Field label={t("admin.new.size.label")}>
          {(field) => (
            <TaxonomySelect
              id={field.id}
              value={draft.size || null}
              options={REFERENCE_SIZES}
              labelFor={(code) => t(`admin.taxonomy.sizes.${code}`)}
              onChange={(value) => set("size", value ?? "")}
              placeholder={t("admin.new.size.placeholder")}
              noneLabel={t("admin.new.size.none")}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <TermsInput
            label={t("admin.new.terms.label")}
            hint={t("admin.new.terms.hint")}
            value={draft.bannedTerms}
            onChange={(terms) => set("bannedTerms", terms)}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-6 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" render={<Link to="/admin/references" />}>
          {t("admin.new.cancel")}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {submitting ? t("admin.new.submitting") : t("admin.new.submit")}
        </Button>
      </div>
    </form>
  )
}
