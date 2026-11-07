import { toast as sonner, type ExternalToast } from "sonner"

// Os avisos do assistente saem no alto: embaixo, em cima de onde eles nascem por padrão, mora o botão de
// continuar, e o aviso de que deu certo não pode cobrir o próximo passo.
const TOP: ExternalToast = { position: "top-center" }

export const toast = {
  success: (message: string, options?: ExternalToast) => sonner.success(message, { ...TOP, ...options }),
  error: (message: string, options?: ExternalToast) => sonner.error(message, { ...TOP, ...options }),
  info: (message: string, options?: ExternalToast) => sonner.info(message, { ...TOP, ...options }),
  warning: (message: string, options?: ExternalToast) => sonner.warning(message, { ...TOP, ...options }),
}
