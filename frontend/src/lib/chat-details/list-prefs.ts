import { create } from "zustand"
import { persist } from "zustand/middleware"

import { createSafeJSONStorage } from "@/lib/safe-local-storage"

// O que a linha da conversa mostra, por aparelho. Na origem, `useChatSettingsStore`.

type ListPrefsState = {
  showTags: boolean
  showPhone: boolean
  setShowTags: (show: boolean) => void
  setShowPhone: (show: boolean) => void
}

export const useChatListPrefs = create<ListPrefsState>()(
  persist(
    (set) => ({
      showTags: true,
      showPhone: true,
      setShowTags: (showTags) => set({ showTags }),
      setShowPhone: (showPhone) => set({ showPhone }),
    }),
    {
      name: "vekoo.chat.list-prefs.v1",
      storage: createSafeJSONStorage(),
    }
  )
)
