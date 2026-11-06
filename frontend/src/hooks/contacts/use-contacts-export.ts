import { useEffect, useState, useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useSession } from "@/lib/auth"
import {
  checkExportLink,
  openExportLink,
} from "@/lib/contacts/export-download"
import {
  attachExportTracker,
  dismissExport,
  getExportState,
  markExportExpired,
  startExport,
  subscribeToExport,
  type ExportState,
} from "@/lib/contacts/export-tracker"
import { selectionBody, type ContactSelectionTarget } from "@/lib/contacts/filters"

/** A exportação em segundo plano, vista pela tela: o estado, pedir e baixar. */
export function useContactsExport() {
  const { t } = useTranslation()
  const { account } = useSession()
  const state = useSyncExternalStore(subscribeToExport, getExportState)
  const [checking, setChecking] = useState(false)

  useEffect(() => attachExportTracker(account.id), [account.id])

  async function download(link: ExportState = state) {
    if (!link.downloadUrl) return

    setChecking(true)
    const check = await checkExportLink(link.downloadUrl)
    setChecking(false)

    if (check === "ok") {
      openExportLink(link.downloadUrl)
    } else if (check === "expired") {
      markExportExpired()
    } else if (check === "network") {
      toast.error(t("contacts.export.downloadOffline"))
    } else {
      // O arquivo já foi apagado, ou a pessoa perdeu o acesso: o link não volta a valer.
      markExportExpired()
      toast.error(t(check === "gone" ? "contacts.export.fileGone" : "contacts.export.linkInvalid"))
    }
  }

  function start(target: ContactSelectionTarget) {
    startExport(selectionBody(target), (finished) => {
      // A pessoa saiu da tela no meio: o aviso vai por toast, onde quer que ela esteja.
      if (finished.phase === "ready") {
        toast.success(t("contacts.export.readyAway"), {
          duration: Infinity,
          action: {
            label: t("contacts.export.download"),
            onClick: () => void download(finished),
          },
        })
      } else if (finished.phase === "failed") {
        toast.error(t("contacts.export.failedAway"), {
          description: finished.message ?? undefined,
        })
      }
    })
  }

  return { state, start, download, checking, dismiss: dismissExport }
}
