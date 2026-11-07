import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import EditorWorker from "monaco-editor/editor/editor.worker?worker"
import JsonWorker from "monaco-editor/language/json/json.worker?worker"
import TsWorker from "monaco-editor/language/typescript/ts.worker?worker"

// O Monaco vem no próprio pacote, e não do CDN que `@monaco-editor/react` usa por padrão: a CSP do site
// (`public/_headers`) só aceita script da própria origem, e assim a versão também não muda sozinha. Este módulo
// é o que pesa: só carrega junto com o editor, em chunk próprio, e fora do precache do PWA.

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === "typescript" || label === "javascript") return new TsWorker()
    if (label === "json") return new JsonWorker()
    return new EditorWorker()
  },
}

loader.config({ monaco })

export { monaco }
