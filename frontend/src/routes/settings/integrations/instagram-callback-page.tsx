import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "@/lib/router"
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
  const [published, setPublished] = useState(false)
  const [stranded, setStranded] = useState(false)
  const publishedOnce = useRef(false)

  // Só uma vez: a resposta é única, e o StrictMode rodaria o efeito duas vezes.
  useEffect(() => {
    if (publishedOnce.current) return
    publishedOnce.current = true

    // Lido antes de publicar: quem está esperando em outra aba consome o pedido na hora.
    const sameWindow = readInstagramRequest()?.sameWindow
    publishInstagramResult(params)

    // O login aconteceu nesta mesma aba, porque a janela foi bloqueada: é só voltar.
    if (sameWindow) navigate(RESUME_PATH, { replace: true })
    else setPublished(true)
  }, [navigate, params])

  // Na página do Instagram o `opener` costuma ser cortado (Cross-Origin-Opener-Policy), e
  // quem abriu recebe a resposta pelos outros caminhos. Fechar nem sempre é permitido nesse
  // caso: se a janela continuar aberta, ela diz o que fazer.
  useEffect(() => {
    if (!published) return
    const timer = window.setTimeout(() => {
      window.close()
      setStranded(true)
    }, CLOSE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [published])

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
