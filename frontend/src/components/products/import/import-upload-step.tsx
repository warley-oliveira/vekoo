import { useState } from "react"
import { useTranslation } from "react-i18next"
import { History } from "lucide-react"

import { FileDropzone, type DropzoneFile } from "@/components/shared"
import { Button } from "@/components/ui/button"
import type { ProductImportPreview } from "@/lib/products/types"

/** `Products::Import::MAX_FILE_BYTES`. */
const MAX_FILE_BYTES = 50 * 1024 * 1024

const ACCEPT = {
  "text/csv": [".csv"],
  "text/tab-separated-values": [".tsv"],
  "text/plain": [".txt"],
}

type ImportUploadStepProps = {
  onUploaded: (preview: ProductImportPreview) => void
  onHistory: () => void
}

/**
 * Primeira fase: o arquivo cru sobe e é o servidor quem o lê. A tela não abre o arquivo de
 * propósito: é o servidor que entende Latin-1 e `;`, e o que aparece na prévia é o que ele
 * leu, já em UTF-8. Ler aqui também seria o jeito certo de estragar acento.
 */
export function ImportUploadStep({ onUploaded, onHistory }: ImportUploadStepProps) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<DropzoneFile[]>([])

  return (
    <div className="flex flex-col gap-4">
      <FileDropzone
        value={files}
        onChange={setFiles}
        accept={ACCEPT}
        maxSize={MAX_FILE_BYTES}
        maxFiles={1}
        hint={t("products.import.upload.hint")}
        upload={{
          path: "/products/imports",
          fieldName: "file",
          onSuccess: (response) => onUploaded(response as ProductImportPreview),
        }}
      />

      <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-pretty text-muted-foreground">
        <p className="font-medium text-foreground">{t("products.import.upload.helpTitle")}</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          <li>{t("products.import.upload.helpExcel")}</li>
          <li>{t("products.import.upload.helpSheets")}</li>
          <li>{t("products.import.upload.helpColumns")}</li>
        </ul>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit text-muted-foreground pointer-coarse:h-10"
        onClick={onHistory}
      >
        <History />
        {t("products.menu.imports")}
      </Button>
    </div>
  )
}
