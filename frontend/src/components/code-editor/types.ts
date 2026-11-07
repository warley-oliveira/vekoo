import type { OnMount } from "@monaco-editor/react"

/** Um parâmetro da função: é o que tipa `params` no autocompletar. */
export type ScriptParameter = {
  name: string
  type: string
  description?: string
  required?: boolean
  enum?: string[]
  itemsType?: string
  itemsProperties?: ScriptParameter[]
  properties?: ScriptParameter[]
  default?: unknown
}

/** Uma credencial declarada pela ferramenta: tipa `credentials`. */
export type CredentialField = {
  name: string
  label?: string
  type?: "string" | "password" | "number"
  help?: string
}

export type ScriptEvent = {
  name: string
  input?: unknown
  output?: unknown
  caller_line?: number
}

/** O resultado de uma execução de teste, no formato de `GET /tools/:id/test-runs/:runId`. */
export type CodeRunResult = {
  status: "pending" | "done" | "failed"
  response?: unknown
  error?: string
  events?: ScriptEvent[]
  durationMs?: number
}

/** O editor do Monaco, para quem precisa inserir texto ou mover o cursor de fora. */
export type CodeEditorInstance = Parameters<OnMount>[0]

export type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
  language?: "javascript" | "json"
  /** Altura do campo. Em tela cheia, ocupa a tela. */
  height?: number
  /** Ocupa a altura do pai, no lugar de `height`, sem botão de tela cheia: o editor é o corpo de um painel. */
  fill?: boolean
  readOnly?: boolean
  /** Tipa `params`: `params.cep` completa, e `params.errado` acusa. */
  parameters?: ScriptParameter[]
  /**
   * Declaração pronta de `params`, no lugar de `parameters`, quando o formato não vem de uma lista de
   * parâmetros (gatilho de pipeline). Pode usar os tipos da API, como `KanbanCardInfo`.
   */
  paramsDefinition?: string
  /** Chamada quando o editor monta. */
  onEditorMount?: (editor: CodeEditorInstance) => void
  credentialFields?: CredentialField[]
  /** Oferece "Criar parâmetro" quando o código usa `params.x` que não existe. */
  onAddParameter?: (name: string) => void
  /** Mostra o botão de executar. A tela decide como roda (ver `runToolTest`). */
  onRun?: () => void
  running?: boolean
  result?: CodeRunResult | null
  /** Mostra a referência da API JS ao lado. Padrão: em JavaScript. */
  showReference?: boolean
  "aria-label"?: string
  className?: string
}
