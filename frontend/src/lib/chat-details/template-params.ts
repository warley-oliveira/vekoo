import { bodyVariables, exampleKey, templateToForm, type TemplateFormValues } from "@/lib/connectors/template-builder"
import type { TemplateComponent, WhatsappTemplate } from "@/lib/connectors/types"
import type { Chat } from "@/lib/chat/types"

// O que um modelo pede para sair, e como isso vira os `components` que a Meta lê.
//
// A origem só olhava o corpo, e enviava o exemplo quando o campo ficava vazio: um contato receberia
// o nome de quem cadastrou o modelo. Aqui toda variável é obrigatória, e o exemplo só aparece como
// dica. Cabeçalho de mídia o servidor preenche sozinho (`prepare_template_components`).

export type TemplateVariable = {
  /** A chave no formulário. Nunca o nome: `1` num caminho do react-hook-form vira índice de lista. */
  key: string
  component: "header" | "body" | "button"
  /** Como está no texto: `1`, `nome`. */
  name: string
  example: string | null
  /** Só em botão: a posição dele, que a Meta pede, e de que tipo é. */
  buttonIndex?: number
  buttonType?: "URL" | "COPY_CODE"
  /** Botão de link, para a pessoa saber o que está preenchendo. */
  buttonText?: string
}

const isPositional = (name: string) => /^\d+$/.test(name)

function findComponent(template: WhatsappTemplate, type: TemplateComponent["type"]) {
  return template.components.find((component) => component.type?.toUpperCase() === type)
}

/** Só `approved` deve ser oferecido para envio. */
export function sendableTemplates(templates: WhatsappTemplate[]): WhatsappTemplate[] {
  return templates.filter((template) => template.status === "approved" && !template.removed)
}

export function templateVariables(template: WhatsappTemplate): TemplateVariable[] {
  const variables: TemplateVariable[] = []
  const add = (variable: Omit<TemplateVariable, "key">) =>
    variables.push({ ...variable, key: `v${variables.length}` })

  const header = findComponent(template, "HEADER")
  if (header?.text && (!header.format || header.format === "TEXT")) {
    bodyVariables(header.text).forEach((name, index) => {
      add({ component: "header", name, example: header.example?.header_text?.[index] ?? null })
    })
  }

  const body = findComponent(template, "BODY")
  if (body?.text) {
    const found = bodyVariables(body.text)
    const positional = found.every(isPositional)
    const ordered = positional ? [...found].sort((a, b) => Number(a) - Number(b)) : found

    ordered.forEach((name, index) => {
      const example = positional
        ? body.example?.body_text?.[0]?.[index]
        : body.example?.body_text_named_params?.find((param) => param.param_name === name)?.example
      add({ component: "body", name, example: example ?? null })
    })
  }

  findComponent(template, "BUTTONS")?.buttons?.forEach((button, buttonIndex) => {
    if (button.type === "URL" && button.url && bodyVariables(button.url).length > 0) {
      add({
        component: "button",
        name: bodyVariables(button.url)[0],
        example: button.example?.[0] ?? null,
        buttonIndex,
        buttonType: "URL",
        buttonText: button.text,
      })
    } else if (button.type === "COPY_CODE") {
      add({
        component: "button",
        name: "code",
        example: button.example?.[0] ?? null,
        buttonIndex,
        buttonType: "COPY_CODE",
        buttonText: button.text,
      })
    }
  })

  return variables
}

/** Os `components` de `send_template_message`, no formato da Meta. */
export function buildTemplateComponents(
  variables: TemplateVariable[],
  values: Record<string, string>
): object[] {
  const text = (variable: TemplateVariable) => ({
    type: "text",
    ...(isPositional(variable.name) ? {} : { parameter_name: variable.name }),
    text: values[variable.key]?.trim() ?? "",
  })

  const components: object[] = []
  const of = (component: TemplateVariable["component"]) =>
    variables.filter((variable) => variable.component === component)

  if (of("header").length > 0) {
    components.push({ type: "header", parameters: of("header").map(text) })
  }
  if (of("body").length > 0) {
    components.push({ type: "body", parameters: of("body").map(text) })
  }
  for (const variable of of("button")) {
    components.push(
      variable.buttonType === "COPY_CODE"
        ? {
            type: "button",
            sub_type: "copy_code",
            index: String(variable.buttonIndex),
            parameters: [{ type: "coupon_code", coupon_code: values[variable.key]?.trim() ?? "" }],
          }
        : {
            type: "button",
            sub_type: "url",
            index: String(variable.buttonIndex),
            parameters: [{ type: "text", text: values[variable.key]?.trim() ?? "" }],
          }
    )
  }
  return components
}

const fill = (text: string, name: string, value: string) =>
  text.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "g"), value)

/** O modelo como o contato vai ler, para `TemplatePreview`. O que falta continua como `{{1}}`. */
export function templatePreviewValues(
  template: WhatsappTemplate,
  variables: TemplateVariable[],
  values: Record<string, string>
): TemplateFormValues {
  const form = templateToForm(template)
  const examples: Record<string, string> = {}
  let headerText = form.header.text

  for (const variable of variables) {
    const value = values[variable.key]?.trim()
    if (variable.component === "body") examples[exampleKey(variable.name)] = value ?? ""
    if (variable.component === "header" && value) headerText = fill(headerText, variable.name, value)
  }

  return {
    ...form,
    header: { ...form.header, text: headerText },
    body: { ...form.body, examples },
  }
}

const FIRST_NAME_KEYS = new Set(["primeiro_nome", "first_name"])
const NAME_KEYS = new Set(["nome", "name", "cliente", "contato", "nome_completo", "full_name"])

function contactNames(chat: Chat): { full: string; first: string } {
  const full = (chat.displayName || chat.userName || "").trim()
  return { full, first: full.split(/\s+/)[0] ?? "" }
}

/**
 * O que já dá para preencher pelo nome da variável: `{{nome}}`, ou uma chave dos campos do contato.
 * `{{1}}` fica vazio, porque nada diz o que ele é: a pessoa toca numa sugestão, se servir.
 */
export function initialTemplateValues(
  variables: TemplateVariable[],
  chat: Chat
): Record<string, string> {
  const { full, first } = contactNames(chat)

  return Object.fromEntries(
    variables.map((variable) => {
      const name = variable.name.toLowerCase()
      const attribute = chat.customAttributes?.[variable.name]
      const value = FIRST_NAME_KEYS.has(name)
        ? first
        : NAME_KEYS.has(name)
          ? full
          : typeof attribute === "string"
            ? attribute
            : ""
      return [variable.key, variable.component === "button" ? "" : value]
    })
  )
}

/** As sugestões de uma variável vazia: o que costuma ir em `{{1}}`. */
export function templateSuggestions(chat: Chat): string[] {
  const { full, first } = contactNames(chat)
  return [...new Set([first, full])].filter(Boolean)
}

/** "pedido_saiu_para_entrega" vira "Pedido saiu para entrega". */
export function templateTitle(name: string): string {
  const spaced = name.replace(/[_-]+/g, " ").trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
