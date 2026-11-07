import { lazy, Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import type { CodeEditorProps } from "./types"

// O editor de código da plataforma: Monaco, com autocompletar e validação da API JS do motor de scripts, e a
// referência ao lado. Importe sempre daqui: o Monaco pesa alguns MB e só desce quando o editor aparece na tela.
//
//     const [code, setCode] = useState(tool.jsCode)
//     const [result, setResult] = useState<CodeRunResult | null>(null)
//     <CodeEditor
//       value={code}
//       onChange={setCode}
//       parameters={tool.parameters}      // tipa `params`, com "Criar parâmetro" por `onAddParameter`
//       credentialFields={schema}         // tipa `credentials`
//       onRun={run}                       // sem isto, não há botão de executar
//       running={busy}
//       result={result}                   // no formato de `GET /tools/:id/test-runs/:runId`
//     />
//
// Serve para gatilho de pipeline e ação de webhook também: quem usa decide como rodar. `language="json"` serve para
// corpo de requisição, sem referência e sem validação de script.

const CodeEditorCore = lazy(() => import("./code-editor-core"))

export function CodeEditor(props: CodeEditorProps) {
  const height = props.height ?? 360
  return (
    <Suspense
      fallback={
        <div
          className={cn("overflow-hidden rounded-lg border", props.className)}
          style={props.fill ? undefined : { height: height + 36 }}
          aria-busy
        >
          <Skeleton className="size-full rounded-none" />
        </div>
      }
    >
      <CodeEditorCore {...props} />
    </Suspense>
  )
}

export type {
  CodeEditorInstance,
  CodeEditorProps,
  CodeRunResult,
  CredentialField,
  ScriptEvent,
  ScriptParameter,
} from "./types"
