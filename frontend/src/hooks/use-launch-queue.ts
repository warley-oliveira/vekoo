import { useEffect } from "react"
import { useNavigate } from "react-router"

type LaunchParams = { targetURL?: string }
type LaunchQueue = { setConsumer: (consumer: (params: LaunchParams) => void) => void }

/**
 * O outro lado do `launch_handler: focus-existing` do manifesto: o navegador foca a
 * janela já aberta e entrega o destino aqui, sem navegar sozinho. Sem isto, um link
 * aberto no PWA instalado só traria a janela para a frente, no lugar errado.
 *
 * Abrir pelo ícone (`?source=pwa`) não leva a lugar nenhum: a pessoa continua de onde
 * parou.
 */
export function useLaunchQueue(): void {
  const navigate = useNavigate()

  useEffect(() => {
    const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue
    queue?.setConsumer(({ targetURL }) => {
      if (!targetURL) return
      const url = new URL(targetURL)
      if (url.origin !== window.location.origin) return
      if (url.searchParams.get("source") === "pwa") return
      navigate(`${url.pathname}${url.search}${url.hash}`)
    })
  }, [navigate])
}
