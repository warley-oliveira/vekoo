import { lazy } from "react"

/** As preferências do chat abrem pouco: só descem quando alguém pede. */
export const LazyChatPreferences = lazy(() => import("./chat-preferences"))
