import { META_SDK_VERSION, type FacebookLoginConfig } from "./meta-config"

// O SDK da Meta entra só na tela que precisa dele, e a origem dele precisa estar liberada
// na CSP (`public/_headers`). Em desenvolvimento não há CSP: a falha só apareceria em
// produção, e por isso o carregamento tem prazo e diz quando não conseguiu.

type FacebookLoginResponse = {
  status?: string
  authResponse?: { code?: string; accessToken?: string } | null
}

type FacebookLoginOptions = {
  config_id: string
  response_type: "code"
  override_default_response_type: true
  extras?: Record<string, unknown>
}

type FacebookSdk = {
  init(params: {
    appId: string
    cookie?: boolean
    xfbml?: boolean
    version: string
    autoLogAppEvents?: boolean
  }): void
  login(callback: (response: FacebookLoginResponse) => void, options: FacebookLoginOptions): void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

const LOAD_TIMEOUT_MS = 15_000
/** O código e os dados do número chegam por caminhos diferentes, em qualquer ordem. */
const EMBEDDED_SIGNUP_TIMEOUT_MS = 20_000

/** De onde a janela da Meta fala com a página. Fora disso, a mensagem é ignorada. */
const META_ORIGINS = ["https://www.facebook.com", "https://web.facebook.com"]

let loading: Promise<FacebookSdk> | null = null

/** Carrega uma vez só. Se falhar, a próxima chamada tenta de novo. */
export function loadFacebookSdk(language: string): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB)
  if (loading) return loading

  loading = new Promise<FacebookSdk>((resolve, reject) => {
    const fail = (reason: string) => {
      clearTimeout(timer)
      document.getElementById("facebook-jssdk")?.remove()
      loading = null
      reject(new Error(reason))
    }

    const timer = setTimeout(() => fail("timeout"), LOAD_TIMEOUT_MS)

    window.fbAsyncInit = () => {
      clearTimeout(timer)
      if (window.FB) resolve(window.FB)
      else fail("missing")
    }

    if (!document.getElementById("fb-root")) {
      const root = document.createElement("div")
      root.id = "fb-root"
      document.body.appendChild(root)
    }

    const locale = language.toLowerCase().startsWith("pt") ? "pt_BR" : "en_US"
    const script = document.createElement("script")
    script.id = "facebook-jssdk"
    script.async = true
    script.defer = true
    script.crossOrigin = "anonymous"
    script.src = `https://connect.facebook.net/${locale}/sdk.js`
    script.onerror = () => fail("load")
    document.body.appendChild(script)
  })

  return loading
}

/**
 * `xfbml` e `autoLogAppEvents` ficam desligados: não há plugin social na página e não
 * mandamos eventos para a Meta, o que também encolhe o que a CSP precisa liberar.
 */
function initFor(sdk: FacebookSdk, appId: string) {
  sdk.init({ appId, xfbml: false, autoLogAppEvents: false, version: META_SDK_VERSION })
}

export type MetaLoginFailure = "cancelled" | "incomplete" | "refused"

export class MetaLoginError extends Error {
  readonly reason: MetaLoginFailure
  /** A etapa da janela da Meta em que a pessoa parou, ou o motivo que ela informou. */
  readonly detail?: string

  constructor(reason: MetaLoginFailure, detail?: string) {
    super(detail ?? reason)
    this.name = "MetaLoginError"
    this.reason = reason
    this.detail = detail
  }
}

export type EmbeddedSignupResult = {
  code: string
  phoneNumberId: string
  wabaId: string
  businessId?: string
}

type EmbeddedSignupMessage = {
  type?: string
  event?: string
  data?: {
    phone_number_id?: string
    waba_id?: string
    business_id?: string
    current_step?: string
    error_message?: string
  }
}

function parseSignupMessage(event: MessageEvent): EmbeddedSignupMessage | null {
  if (!META_ORIGINS.includes(event.origin) || typeof event.data !== "string") return null
  try {
    const parsed = JSON.parse(event.data) as EmbeddedSignupMessage
    return parsed.type === "WA_EMBEDDED_SIGNUP" ? parsed : null
  } catch {
    // A Meta manda outras mensagens que não são JSON. Não são para nós.
    return null
  }
}

/**
 * O Embedded Signup do WhatsApp. Precisa rodar dentro do clique, senão o navegador
 * bloqueia a janela: o SDK já tem que estar carregado antes.
 *
 * O login devolve o código e a mensagem da janela devolve o número e a conta, cada um no
 * seu tempo. Só termina com os dois: criar o canal sem um deles deixaria um `failed`.
 */
export function runEmbeddedSignup(
  sdk: FacebookSdk,
  config: FacebookLoginConfig
): Promise<EmbeddedSignupResult> {
  initFor(sdk, config.appId)

  return new Promise((resolve, reject) => {
    let code: string | null = null
    let finished: EmbeddedSignupMessage["data"] | null = null
    let lastStep: string | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    function cleanup() {
      window.removeEventListener("message", onMessage)
      clearTimeout(timer)
    }

    function settle() {
      if (code && finished?.phone_number_id && finished.waba_id) {
        cleanup()
        resolve({
          code,
          phoneNumberId: finished.phone_number_id,
          wabaId: finished.waba_id,
          businessId: finished.business_id,
        })
        return
      }
      // Um dos lados chegou. O outro tem um prazo para chegar também.
      if ((code || finished) && !timer) {
        timer = setTimeout(() => {
          cleanup()
          reject(new MetaLoginError("incomplete"))
        }, EMBEDDED_SIGNUP_TIMEOUT_MS)
      }
    }

    function onMessage(event: MessageEvent) {
      const message = parseSignupMessage(event)
      if (!message) return

      if (message.event?.startsWith("FINISH")) {
        finished = message.data ?? {}
        settle()
      } else if (message.event === "CANCEL") {
        lastStep = message.data?.current_step
      } else if (message.event === "ERROR") {
        cleanup()
        reject(new MetaLoginError("refused", message.data?.error_message))
      }
    }

    window.addEventListener("message", onMessage)

    sdk.login(
      (response) => {
        const received = response.authResponse?.code
        if (received) {
          code = received
          settle()
          return
        }
        cleanup()
        reject(new MetaLoginError("cancelled", lastStep))
      },
      {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { version: "v3" },
      }
    )
  })
}

/** Facebook Login: só o código, para o back descobrir a página. */
export function runFacebookLogin(
  sdk: FacebookSdk,
  config: FacebookLoginConfig
): Promise<{ code: string }> {
  initFor(sdk, config.appId)

  return new Promise((resolve, reject) => {
    sdk.login(
      (response) => {
        const code = response.authResponse?.code
        if (code) resolve({ code })
        else reject(new MetaLoginError("cancelled"))
      },
      {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    )
  })
}
