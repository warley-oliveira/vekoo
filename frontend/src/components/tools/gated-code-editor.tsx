import { useState } from "react"
import { useTranslation } from "react-i18next"
import { MonitorSmartphone } from "lucide-react"

import { CodeEditor, type CodeEditorProps } from "@/components/code-editor"
import { Callout } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"

/**
 * O editor de código, com um aviso no celular: o Monaco pesa alguns MB e digitar código no dedo é ruim. O código fica
 * à vista para ler, e quem precisa mesmo corrigir uma linha na rua abre o editor assim mesmo.
 */
export function GatedCodeEditor(props: CodeEditorProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [opened, setOpened] = useState(false)

  if (isMobile && !opened) {
    return (
      <div className="flex flex-col gap-2">
        <Callout
          icon={<MonitorSmartphone />}
          title={t("tools.codeGate.title")}
          action={
            <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-10" onClick={() => setOpened(true)}>
              {t("tools.codeGate.open")}
            </Button>
          }
        >
          {t("tools.codeGate.description")}
        </Callout>
        {props.value ? (
          <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{props.value}</pre>
        ) : null}
      </div>
    )
  }

  return <CodeEditor {...props} />
}
