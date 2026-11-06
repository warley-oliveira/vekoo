import { Suspense, lazy, useState } from "react"
import { useTranslation } from "react-i18next"
import { Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Connector } from "@/lib/connectors/types"
import { IMPORTABLE_CONNECTORS } from "@/lib/contacts/format"
import type { ImportView } from "./contact-import-panel"

const ContactImportPanel = lazy(() => import("./contact-import-panel"))

/**
 * "Importar contatos" na tela do canal, com o canal já escolhido. O painel entra por `lazy`: quem
 * configura um canal não precisa carregar o leitor de planilhas para isso.
 */
export function ImportContactsAction({ connector }: { connector: Connector }) {
  const { t } = useTranslation()
  const [view, setView] = useState<ImportView | null>(null)
  const [requested, setRequested] = useState(false)

  if (!IMPORTABLE_CONNECTORS.includes(connector.type)) return null

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="pointer-coarse:h-10 max-sm:w-full"
        onClick={() => {
          setRequested(true)
          setView("new")
        }}
      >
        <Upload />
        {t("contacts.import.action")}
      </Button>
      {requested ? (
        <Suspense fallback={null}>
          <ContactImportPanel view={view} onViewChange={setView} connector={connector} />
        </Suspense>
      ) : null}
    </>
  )
}
