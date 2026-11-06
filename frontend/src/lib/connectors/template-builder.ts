import { z } from "zod"

import type { TemplateButton, TemplateComponent, WhatsappTemplate } from "./types"

// O formulário pensa em cabeçalho, corpo, rodapé e botões; a Meta pensa numa lista de
// `components`, com as chaves dela. A tradução mora aqui, para a tela só conhecer o primeiro.
//
// As variáveis do corpo são lidas do próprio texto. Na origem a pessoa mantinha uma tabela
// à mão, e bastava ela sair de sincronia com o texto para a Meta recusar.

export const HEADER_FORMATS = ["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"] as const
export type HeaderFormat = (typeof HEADER_FORMATS)[number]

export const BUTTON_TYPES = ["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE"] as const
export type ButtonType = (typeof BUTTON_TYPES)[number]

export const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const
export const LANGUAGES = ["pt_BR", "en_US"] as const

export const MAX_BUTTONS = 3
const MAX_PHONE_BUTTONS = 1
const MAX_URL_BUTTONS = 2
export const MAX_HEADER_TEXT = 60
export const MAX_BODY_TEXT = 1024
export const MAX_FOOTER_TEXT = 60
export const MAX_BUTTON_TEXT = 25

const VARIABLE = /\{\{\s*([^{}]+?)\s*\}\}/g

/** As variáveis do texto, na ordem em que aparecem, sem repetir. */
export function bodyVariables(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(VARIABLE), (match) => match[1]))]
}

const isPositional = (name: string) => /^\d+$/.test(name)

/**
 * O react-hook-form trata "1" num caminho como índice de lista: `examples.1` viraria um
 * array. Com o prefixo, continua sendo uma chave.
 */
export function exampleKey(variable: string): string {
  return `v_${variable}`
}

/** O próximo `{{n}}` livre, para o botão de inserir variável. */
export function nextVariable(text: string): string {
  const numbers = bodyVariables(text).filter(isPositional).map(Number)
  return `{{${(numbers.length ? Math.max(...numbers) : 0) + 1}}}`
}

/** A mesma regra do back (`parameterize.underscore`): é o nome que a Meta vai receber. */
export function normalizeTemplateName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "_")
}

const templateShape = z.object({
  name: z.string(),
  category: z.string(),
  language: z.string(),
  header: z.object({
    enabled: z.boolean(),
    format: z.enum(HEADER_FORMATS),
    text: z.string(),
    mediaUrl: z.string(),
    latitude: z.string(),
    longitude: z.string(),
    placeName: z.string(),
    address: z.string(),
  }),
  body: z.object({ text: z.string(), examples: z.record(z.string(), z.string().optional()) }),
  footer: z.object({ enabled: z.boolean(), text: z.string() }),
  buttons: z.object({
    enabled: z.boolean(),
    items: z.array(
      z.object({
        type: z.enum(BUTTON_TYPES),
        text: z.string(),
        url: z.string(),
        urlExample: z.string(),
        phone: z.string(),
      })
    ),
  }),
})

export type TemplateFormValues = z.infer<typeof templateShape>
export type ButtonValue = TemplateFormValues["buttons"]["items"][number]

const EMPTY_HEADER: TemplateFormValues["header"] = {
  enabled: false,
  format: "TEXT",
  text: "",
  mediaUrl: "",
  latitude: "",
  longitude: "",
  placeName: "",
  address: "",
}

export function emptyTemplate(): TemplateFormValues {
  return {
    name: "",
    category: "UTILITY",
    language: "pt_BR",
    header: { ...EMPTY_HEADER },
    body: { text: "", examples: {} },
    footer: { enabled: false, text: "" },
    buttons: { enabled: false, items: [] },
  }
}

function bodyExamples(component: TemplateComponent | undefined): Record<string, string> {
  const examples: Record<string, string> = {}
  const named = component?.example?.body_text_named_params
  const positional = component?.example?.body_text?.[0]

  if (named) {
    for (const param of named) examples[exampleKey(param.param_name)] = param.example
  } else if (positional) {
    positional.forEach((value, index) => {
      examples[exampleKey(String(index + 1))] = value
    })
  }
  return examples
}

/** A mídia que vale para a Meta é a guardada à parte: a do `example` é um link assinado. */
function headerMedia(template: WhatsappTemplate, component: TemplateComponent): string {
  return (
    template.headerMediaUrl ??
    component.example?.header_url?.[0] ??
    component.example?.header_handle?.[0] ??
    ""
  )
}

export function templateToForm(template: WhatsappTemplate): TemplateFormValues {
  const find = (type: TemplateComponent["type"]) =>
    template.components.find((component) => component.type?.toUpperCase() === type)

  const header = find("HEADER")
  const body = find("BODY")
  const footer = find("FOOTER")
  const buttons = find("BUTTONS")
  const location = header?.example?.header_location

  return {
    name: template.name,
    category: template.category ?? "UTILITY",
    language: template.language ?? "pt_BR",
    header: header
      ? {
          enabled: true,
          format: header.format ?? "TEXT",
          text: header.text ?? "",
          mediaUrl: headerMedia(template, header),
          latitude: location?.latitude ?? "",
          longitude: location?.longitude ?? "",
          placeName: location?.name ?? "",
          address: location?.address ?? "",
        }
      : { ...EMPTY_HEADER },
    body: { text: body?.text ?? "", examples: bodyExamples(body) },
    footer: { enabled: Boolean(footer), text: footer?.text ?? "" },
    buttons: {
      enabled: Boolean(buttons),
      items: (buttons?.buttons ?? []).map((button) => ({
        type: button.type,
        text: button.text ?? "",
        url: button.url ?? "",
        urlExample: button.example?.[0] ?? "",
        phone: button.phone_number ?? "",
      })),
    },
  }
}

/** Um link que muda por contato: a Meta pede o endereço completo de exemplo. */
export function isDynamicUrl(url: string): boolean {
  return bodyVariables(url).length > 0
}

function headerComponent(
  header: TemplateFormValues["header"],
  original?: WhatsappTemplate
): TemplateComponent {
  const previous = original?.components.find((item) => item.type?.toUpperCase() === "HEADER")

  if (header.format === "TEXT") {
    // Texto que não mudou fica como a Meta guardou, com o exemplo de variável, se houver.
    if (previous?.format === "TEXT" && previous.text === header.text.trim()) return previous
    return { type: "HEADER", format: "TEXT", text: header.text.trim() }
  }

  if (header.format === "LOCATION") {
    return {
      type: "HEADER",
      format: "LOCATION",
      example: {
        header_location: {
          latitude: header.latitude,
          longitude: header.longitude,
          name: header.placeName,
          address: header.address,
        },
      },
    }
  }

  // Mídia que não mudou fica como a Meta guardou: reenviar a URL trocaria o arquivo.
  if (previous?.format === header.format && original && headerMedia(original, previous) === header.mediaUrl) {
    return previous
  }
  return { type: "HEADER", format: header.format, example: { header_url: [header.mediaUrl.trim()] } }
}

function bodyComponent(body: TemplateFormValues["body"]): TemplateComponent {
  const variables = bodyVariables(body.text)
  const component: TemplateComponent = { type: "BODY", text: body.text.trim() }
  if (variables.length === 0) return component

  if (variables.every(isPositional)) {
    const ordered = [...variables].sort((a, b) => Number(a) - Number(b))
    component.example = {
      body_text: [ordered.map((name) => body.examples[exampleKey(name)]?.trim() ?? "")],
    }
  } else {
    component.example = {
      body_text_named_params: variables.map((name) => ({
        param_name: name,
        example: body.examples[exampleKey(name)]?.trim() ?? "",
      })),
    }
  }
  return component
}

function buttonComponent(button: ButtonValue): TemplateButton {
  const base = { type: button.type, text: button.text.trim() }
  if (button.type === "URL") {
    return {
      ...base,
      url: button.url.trim(),
      ...(isDynamicUrl(button.url) ? { example: [button.urlExample.trim()] } : {}),
    }
  }
  if (button.type === "PHONE_NUMBER") return { ...base, phone_number: button.phone.trim() }
  return base
}

export function formToComponents(
  values: TemplateFormValues,
  original?: WhatsappTemplate
): TemplateComponent[] {
  const components: TemplateComponent[] = []
  if (values.header.enabled) components.push(headerComponent(values.header, original))
  components.push(bodyComponent(values.body))
  if (values.footer.enabled) components.push({ type: "FOOTER", text: values.footer.text.trim() })
  if (values.buttons.enabled && values.buttons.items.length > 0) {
    components.push({ type: "BUTTONS", buttons: values.buttons.items.map(buttonComponent) })
  }
  return components
}

/** O texto com os exemplos no lugar das variáveis, como o contato vai ler. */
export function fillVariables(text: string, examples: Record<string, string | undefined>): string {
  return text.replace(VARIABLE, (whole, name: string) => examples[exampleKey(name)]?.trim() || whole)
}

/** Uma linha para a lista: o corpo, ou o primeiro texto que houver. */
export function templateSummary(template: WhatsappTemplate): string | null {
  const body = template.components.find((item) => item.type?.toUpperCase() === "BODY")
  return body?.text ?? template.components.find((item) => item.text)?.text ?? null
}

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim())

export function buildTemplateSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  return templateShape.superRefine((values, context) => {
    const issue = (path: (string | number)[], key: string, options?: Record<string, unknown>) =>
      context.addIssue({ code: "custom", path, message: t(key, options) })

    if (!normalizeTemplateName(values.name)) {
      issue(["name"], "connectors.templates.validation.nameRequired")
    }

    const { header, body, footer, buttons } = values

    if (header.enabled) {
      if (header.format === "TEXT") {
        if (!header.text.trim()) issue(["header", "text"], "connectors.templates.validation.headerText")
        else if (header.text.length > MAX_HEADER_TEXT) {
          issue(["header", "text"], "connectors.templates.validation.tooLong", { max: MAX_HEADER_TEXT })
        }
      } else if (header.format === "LOCATION") {
        if (Number.isNaN(Number.parseFloat(header.latitude))) {
          issue(["header", "latitude"], "connectors.templates.validation.coordinate")
        }
        if (Number.isNaN(Number.parseFloat(header.longitude))) {
          issue(["header", "longitude"], "connectors.templates.validation.coordinate")
        }
      } else if (!isHttpUrl(header.mediaUrl)) {
        issue(["header", "mediaUrl"], "connectors.templates.validation.mediaUrl")
      }
    }

    if (!body.text.trim()) {
      issue(["body", "text"], "connectors.templates.validation.bodyText")
    } else if (body.text.length > MAX_BODY_TEXT) {
      issue(["body", "text"], "connectors.templates.validation.tooLong", { max: MAX_BODY_TEXT })
    }

    const variables = bodyVariables(body.text)
    const positional = variables.filter(isPositional)
    if (positional.length > 0 && positional.length < variables.length) {
      issue(["body", "text"], "connectors.templates.validation.mixedVariables")
    } else if (positional.length > 0) {
      // A Meta recusa `{{1}}` e `{{3}}` sem o `{{2}}`.
      const sorted = positional.map(Number).sort((a, b) => a - b)
      if (sorted.some((number, index) => number !== index + 1)) {
        issue(["body", "text"], "connectors.templates.validation.variableGap")
      }
    } else if (variables.some((name) => !/^[a-z0-9_]+$/.test(name))) {
      issue(["body", "text"], "connectors.templates.validation.variableName")
    }

    for (const name of variables) {
      if (!body.examples[exampleKey(name)]?.trim()) {
        issue(["body", "examples", exampleKey(name)], "connectors.templates.validation.example")
      }
    }

    if (footer.enabled) {
      if (!footer.text.trim()) issue(["footer", "text"], "connectors.templates.validation.footerText")
      else if (footer.text.length > MAX_FOOTER_TEXT) {
        issue(["footer", "text"], "connectors.templates.validation.tooLong", { max: MAX_FOOTER_TEXT })
      }
    }

    if (buttons.enabled) {
      if (buttons.items.length === 0) {
        issue(["buttons", "enabled"], "connectors.templates.validation.buttonsRequired")
      }
      if (buttons.items.filter((button) => button.type === "PHONE_NUMBER").length > MAX_PHONE_BUTTONS) {
        issue(["buttons", "enabled"], "connectors.templates.validation.tooManyPhones")
      }
      if (buttons.items.filter((button) => button.type === "URL").length > MAX_URL_BUTTONS) {
        issue(["buttons", "enabled"], "connectors.templates.validation.tooManyUrls")
      }
      buttons.items.forEach((button, index) => {
        if (!button.text.trim()) {
          issue(["buttons", "items", index, "text"], "connectors.templates.validation.buttonText")
        } else if (button.text.length > MAX_BUTTON_TEXT) {
          issue(["buttons", "items", index, "text"], "connectors.templates.validation.tooLong", {
            max: MAX_BUTTON_TEXT,
          })
        }
        if (button.type === "URL" && !isHttpUrl(button.url)) {
          issue(["buttons", "items", index, "url"], "connectors.templates.validation.buttonUrl")
        }
        if (button.type === "URL" && isDynamicUrl(button.url) && !isHttpUrl(button.urlExample)) {
          issue(["buttons", "items", index, "urlExample"], "connectors.templates.validation.buttonUrlExample")
        }
        if (button.type === "PHONE_NUMBER" && !/^\+?\d{8,15}$/.test(button.phone.replace(/[\s()-]/g, ""))) {
          issue(["buttons", "items", index, "phone"], "connectors.templates.validation.buttonPhone")
        }
      })
    }
  })
}
