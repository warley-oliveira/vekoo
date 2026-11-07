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

export type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
  language?: "javascript" | "json"
  /** Altura do campo. Em tela cheia, ocupa a tela. */
  height?: number
  readOnly?: boolean
  /** Tipa `params`: `params.cep` completa, e `params.errado` acusa. */
  parameters?: ScriptParameter[]
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
