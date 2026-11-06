import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { VekooMark } from "@/components/vekoo-mark"
import {
  INSTAGRAM_RESUME_PARAM,
  publishInstagramResult,
  readInstagramRequest,
} from "@/lib/connectors/instagram-oauth"

const RESUME_PATH = `/settings/integrations?${INSTAGRAM_RESUME_PARAM}=resume`
/** Um instante para quem abriu a janela receber a resposta antes de ela fechar. */
const CLOSE_AFTER_MS = 300

/**
 * Para onde o Instagram devolve a pessoa. Fica fora do `RequireAuth`: é uma janela de
 * passagem, e o guarda poderia mandá-la para o login, perdendo o código, que não pode ser
 * pedido de novo. Quem usa o código é a tela que abriu a janela, e essa tem sessão.
 */
export default function InstagramCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [stranded, setStranded] = useState(false)
  const published = useRef(false)

  useEffect(() => {
    if (published.current) return
    published.current = true

    publishInstagramResult(params)

    if (window.opener) {
      window.setTimeout(() => window.close(), CLOSE_AFTER_MS)
      return
    }

    // O login aconteceu nesta mesma aba, porque a janela foi bloqueada: é só voltar.
    if (readInstagramRequest()?.sameWindow) {
      navigate(RESUME_PATH, { replace: true })
      return
    }

    // A página da Meta cortou o `opener`, ou esta janela foi aberta em outro contexto
    // (PWA no celular). A resposta já está guardada: quem abriu recebe, ou retoma ao voltar.
    setStranded(true)
  }, [navigate, params])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <VekooMark />
      {stranded ? (
        <>
          <div className="space-y-1">
            <h1 className="font-heading text-lg font-medium">{t("connectors.callback.doneTitle")}</h1>
            <p className="max-w-sm text-sm text-pretty text-muted-foreground">
              {t("connectors.callback.doneHint")}
            </p>
          </div>
          <Button className="pointer-coarse:h-10" onClick={() => navigate(RESUME_PATH, { replace: true })}>
            {t("connectors.callback.back")}
          </Button>
        </>
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {t("connectors.callback.processing")}
        </p>
      )}
    </main>
  )
}
