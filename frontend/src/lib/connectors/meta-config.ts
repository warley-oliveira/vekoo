// O que o front precisa saber das contas de aplicativo da Meta. Nada disto é segredo: o
// id do app vai para a janela de login de qualquer jeito. Sem as variáveis, a conexão não
// é oferecida como se fosse funcionar: a tela diz que este ambiente não está configurado.
//
// Messenger usa o mesmo app da WABA porque é com `META_APP_ID` que o back troca o código
// desse login. Na origem a tela usava `VITE_IG_APP_ID`, que é o app do Instagram Login: o
// código de um app não pode ser trocado com o segredo de outro.

const env = import.meta.env

export const META_SDK_VERSION: string = env.VITE_FB_SDK_VERSION || "v24.0"

export type FacebookLoginConfig = { appId: string; configId: string }

function loginConfig(appId?: string, configId?: string): FacebookLoginConfig | null {
  return appId && configId ? { appId, configId } : null
}

/** Embedded Signup: o WhatsApp oficial. */
export const whatsappLoginConfig = loginConfig(env.VITE_FB_APP_ID, env.VITE_FB_CONFIG_ID)

/** Facebook Login: Messenger e, se a página tiver, Instagram. */
export const messengerLoginConfig = loginConfig(env.VITE_FB_APP_ID, env.VITE_FB_META_CONFIG_ID)

/** Instagram Login: o app é outro, e não passa pelo SDK. */
export const instagramAppId: string | null = env.VITE_IG_APP_ID || null
export const instagramRedirectOverride: string | null = env.VITE_IG_REDIRECT_URI || null
