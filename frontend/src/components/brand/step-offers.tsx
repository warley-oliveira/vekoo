import { useMemo } from "react"
import { useFieldArray, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { ShoppingBag } from "lucide-react"

import { AddButton, List, ListRow } from "@/components/brand/list-row"
import { useRegisterStep, useWizard } from "@/components/brand/brand-wizard-context"
import { useStepForm } from "@/components/brand/use-step-form"
import { Field } from "@/components/form-field"
import { Input } from "@/components/ui/input"
import { buildStepSchemas, newOffer } from "@/lib/brand-core"

/**
 * Produtos & ofertas: o que a marca vende, por quanto e quando vale.
 *
 * É conhecimento, não burocracia. Sem status, sem vínculo com peça, sem
 * bloqueio — quem não vende produto avulso passa reto e publica igual. O que
 * está aqui é a **única fonte de preço** que o agente de criação pode usar:
 * fora daqui (e do que a pessoa escrever no pedido), ele não inventa número —
 * pergunta.
 *
 * Preço e vigência são texto livre de propósito: "a partir de R$ 18" e "toda
 * quarta" são respostas legítimas, e obrigar a pessoa a traduzir o negócio
 * dela para um campo numérico só faria o dado ficar em branco.
 */
export function StepOffers() {
  const { t } = useTranslation()
  const { brandCore, previewSection } = useWizard()
  const schema = useMemo(() => buildStepSchemas(t).offers, [t])
  const { form, status, commit, retry } = useStepForm({
    section: "offers",
    defaults: brandCore.document.offers,
    schema,
    onChange: (values) => previewSection("offers", values),
  })
  useRegisterStep(commit, status, retry)

  const { register, control, formState: { errors } } = form
  const items = useFieldArray({ control, name: "items" })
  const values = useWatch({ control, name: "items" }) ?? []

  return (
    <form noValidate className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <p className="max-w-prose text-sm text-muted-foreground">{t("brand.offers.intro")}</p>

      {items.fields.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <ShoppingBag className="size-6 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("brand.offers.emptyTitle")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{t("brand.offers.emptyDescription")}</p>
          </div>
          <AddButton onClick={() => items.append(newOffer())}>{t("brand.offers.add")}</AddButton>
        </div>
      ) : (
        <>
          <List aria-label={t("brand.offers.listAria")}>
            {items.fields.map((field, index) => (
              <ListRow
                key={field.id}
                onRemove={() => items.remove(index)}
                removeLabel={t("brand.offers.remove", { name: values[index]?.name || t("brand.offers.unnamed") })}
                className="flex-col gap-3 sm:flex-row sm:items-start"
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <Field
                    label={t("brand.offers.name")}
                    error={errors.items?.[index]?.name?.message}
                  >
                    {(props) => (
                      <Input
                        {...props}
                        {...register(`items.${index}.name` as const)}
                        placeholder={t("brand.offers.namePlaceholder")}
                        maxLength={80}
                        autoFocus={index === items.fields.length - 1 && !values[index]?.name}
                      />
                    )}
                  </Field>
                  <Field
                    label={t("brand.offers.price")}
                    hint={t("brand.offers.priceHint")}
                    error={errors.items?.[index]?.price?.message}
                  >
                    {(props) => (
                      <Input
                        {...props}
                        {...register(`items.${index}.price` as const)}
                        placeholder={t("brand.offers.pricePlaceholder")}
                        maxLength={80}
                        inputMode="text"
                      />
                    )}
                  </Field>
                  <Field
                    label={t("brand.offers.description")}
                    error={errors.items?.[index]?.description?.message}
                    className="sm:col-span-2"
                  >
                    {(props) => (
                      <Input
                        {...props}
                        {...register(`items.${index}.description` as const)}
                        placeholder={t("brand.offers.descriptionPlaceholder")}
                        maxLength={160}
                      />
                    )}
                  </Field>
                  <Field
                    label={t("brand.offers.validity")}
                    hint={t("brand.offers.validityHint")}
                    error={errors.items?.[index]?.validity?.message}
                    className="sm:col-span-2"
                  >
                    {(props) => (
                      <Input
                        {...props}
                        {...register(`items.${index}.validity` as const)}
                        placeholder={t("brand.offers.validityPlaceholder")}
                        maxLength={160}
                      />
                    )}
                  </Field>
                </div>
              </ListRow>
            ))}
          </List>
          <div className="flex items-center gap-3">
            <AddButton onClick={() => items.append(newOffer())} disabled={items.fields.length >= 40}>
              {t("brand.offers.add")}
            </AddButton>
            <p className="text-xs text-muted-foreground">
              {t("brand.offers.counter", { used: items.fields.length, max: 40 })}
            </p>
          </div>
        </>
      )}

      <aside className="flex gap-3 rounded-lg border p-4 text-sm" aria-label={t("brand.offers.asideTitle")}>
        <ShoppingBag className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{t("brand.offers.asideTitle")}</p>
          <p className="text-muted-foreground">{t("brand.offers.asideBody")}</p>
        </div>
      </aside>
    </form>
  )
}
