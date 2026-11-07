import { useCallback, useRef, useState } from "react"

import type { Capabilities } from "@/lib/campaigns-wizard/types"

// Escolher uma planilha do Google Drive, sem dependência nova: o login (Google Identity Services) e o
// seletor (Google Picker) entram sob demanda, como o SDK da Meta na tela de conectar um canal. O acesso
// é da pessoa, fica só na memória e vai ao servidor apenas para baixar a aba. Módulo sem idioma: os erros
// são códigos, e a tela traduz.

export type SheetTab = { name: string; gid: number }
export type SheetFile = { id: string; name: string }
export type PickerErrorCode = "scriptFailed" | "loginFailed" | "pickerFailed" | "tabsFailed"

const GIS_SRC = "https://accounts.google.com/gsi/client"
const GAPI_SRC = "https://apis.google.com/js/api.js"
const SCOPE = "https://www.googleapis.com/auth/drive.file"
const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet"

type TokenResponse = { access_token?: string; error?: string }

type GoogleGlobal = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: unknown) => void
      }) => { requestAccessToken: () => void }
    }
  }
  picker: {
    DocsView: new (viewId: unknown) => { setMimeTypes: (mime: string) => unknown }
    ViewId: { SPREADSHEETS: unknown }
    Action: { PICKED: string; CANCEL: string }
    PickerBuilder: new () => PickerBuilder
  }
}

type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setCallback: (callback: (data: PickerResponse) => void) => PickerBuilder
  setAppId: (id: string) => PickerBuilder
  setDeveloperKey: (key: string) => PickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

type PickerResponse = {
  action: string
  docs?: { id: string; name: string }[]
}

type GapiGlobal = {
  load: (module: string, options: { callback: () => void; onerror: () => void }) => void
}

declare global {
  interface Window {
    gapi?: GapiGlobal
  }
}

const googleOf = () => (window as unknown as { google?: GoogleGlobal }).google

const scripts = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  const known = scripts.get(src)
  if (known) return known

  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scripts.delete(src)
      reject(new Error("scriptFailed"))
    }
    document.head.appendChild(script)
  })
  scripts.set(src, loading)
  return loading
}

async function loadPicker(): Promise<void> {
  await loadScript(GAPI_SRC)
  await new Promise<void>((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error("scriptFailed"))
      return
    }
    window.gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("scriptFailed")) })
  })
}

async function fetchTabs(fileId: string, token: string): Promise<SheetTab[]> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!response.ok) throw new Error("tabsFailed")

  const data = (await response.json()) as {
    sheets?: { properties: { title: string; sheetId: number } }[]
  }
  return (data.sheets ?? []).map(({ properties }) => ({ name: properties.title, gid: properties.sheetId }))
}

export function useGoogleSheetPicker(capabilities: Capabilities["googleSheets"] | null) {
  const [file, setFile] = useState<SheetFile | null>(null)
  const [tabs, setTabs] = useState<SheetTab[]>([])
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PickerErrorCode | null>(null)
  const alive = useRef(true)

  const showPicker = useCallback(
    async (token: string) => {
      const google = googleOf()
      if (!google?.picker) {
        setError("pickerFailed")
        return
      }

      const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
      view.setMimeTypes(SPREADSHEET_MIME)

      const builder = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setCallback((data) => {
          if (data.action === google.picker.Action.CANCEL) {
            setBusy(false)
            return
          }
          if (data.action !== google.picker.Action.PICKED || !data.docs?.[0]) return

          const doc = data.docs[0]
          setFile({ id: doc.id, name: doc.name })
          setBusy(true)
          fetchTabs(doc.id, token)
            .then((found) => {
              if (alive.current) setTabs(found)
            })
            .catch(() => setError("tabsFailed"))
            .finally(() => setBusy(false))
        })

      if (capabilities?.appId) builder.setAppId(capabilities.appId)
      if (capabilities?.apiKey) builder.setDeveloperKey(capabilities.apiKey)
      builder.build().setVisible(true)
    },
    [capabilities?.apiKey, capabilities?.appId]
  )

  const open = useCallback(async () => {
    if (!capabilities?.clientId) return

    setError(null)
    setBusy(true)
    try {
      await Promise.all([loadScript(GIS_SRC), loadPicker()])
    } catch {
      setBusy(false)
      setError("scriptFailed")
      return
    }

    const google = googleOf()
    if (!google?.accounts) {
      setBusy(false)
      setError("scriptFailed")
      return
    }

    google.accounts.oauth2
      .initTokenClient({
        client_id: capabilities.clientId,
        scope: SCOPE,
        callback: (response) => {
          if (!response.access_token) {
            setBusy(false)
            setError("loginFailed")
            return
          }
          setAccessToken(response.access_token)
          void showPicker(response.access_token)
        },
        error_callback: () => {
          setBusy(false)
          setError("loginFailed")
        },
      })
      .requestAccessToken()
  }, [capabilities?.clientId, showPicker])

  const reset = useCallback(() => {
    setFile(null)
    setTabs([])
    setAccessToken(null)
    setBusy(false)
    setError(null)
  }, [])

  return { open, file, tabs, accessToken, busy, error, reset }
}
