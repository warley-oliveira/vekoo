import type { CredentialField, ScriptParameter } from "./types"

// Gera a declaração de `params` e `credentials` a partir do que a função diz receber. Objeto e lista de
// objetos viram interfaces próprias, para o autocompletar descer até o campo certo.

function pascal(name: string): string {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

function primitive(type: string | undefined): string {
  if (type === "string") return "string"
  if (type === "number" || type === "integer") return "number"
  if (type === "boolean") return "boolean"
  return "any"
}

function typeOf(parameter: ScriptParameter, parent: string, interfaces: string[]): string {
  if (parameter.type === "object") {
    if (!parameter.properties?.length) return "Record<string, any>"
    const name = `${parent}${pascal(parameter.name)}`
    declareInterface(name, parameter.properties, interfaces)
    return name
  }
  if (parameter.type === "array") {
    if (parameter.itemsType === "object" && parameter.itemsProperties?.length) {
      const name = `${parent}${pascal(parameter.name)}Item`
      declareInterface(name, parameter.itemsProperties, interfaces)
      return `${name}[]`
    }
    return `${primitive(parameter.itemsType)}[]`
  }
  return primitive(parameter.type)
}

function declareInterface(name: string, properties: ScriptParameter[], interfaces: string[]) {
  const members = properties.map((property) => {
    const docs = [
      property.description || "",
      property.enum?.length ? `@enum {${property.enum.map((value) => `"${value}"`).join(" | ")}}` : "",
      property.default !== undefined ? `@default ${JSON.stringify(property.default)}` : "",
    ]
      .filter(Boolean)
      .join("\n * ")
    const optional = property.required ? "" : "?"
    return `/** ${docs} */\n  ${property.name}${optional}: ${typeOf(property, name, interfaces)};`
  })
  interfaces.push(`interface ${name} {\n  ${members.join("\n  ")}\n}`)
}

export function paramsDeclaration(parameters: ScriptParameter[]): string {
  if (parameters.length === 0) return "interface Params {}\ndeclare const params: Params;\n"
  const interfaces: string[] = []
  declareInterface("Params", parameters, interfaces)
  return `${interfaces.join("\n\n")}\n\ndeclare const params: Params;\n`
}

export function credentialsDeclaration(fields: CredentialField[]): string {
  if (fields.length === 0) {
    return "interface Credentials { [key: string]: string | undefined }\ndeclare const credentials: Credentials;\n"
  }
  const members = fields.map((field) => {
    const docs = [field.label ?? field.name, field.help].filter(Boolean).join(": ")
    return `/** ${docs} */\n  ${JSON.stringify(field.name)}: string;`
  })
  return `interface Credentials {\n  ${members.join("\n  ")}\n}\ndeclare const credentials: Credentials;\n`
}

/**
 * O script é o corpo de uma `async function onMessage(params)`: `return` e `await` valem direto. A validação
 * roda numa cópia embrulhada, e os erros voltam com a linha que a pessoa escreveu.
 */
export function wrapForValidation(code: string): string {
  return `async function __wrapper__() {\n${code}\n}`
}

export const WRAPPER_LINES_BEFORE = 1
