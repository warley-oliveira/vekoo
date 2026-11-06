import { createJSONStorage } from "zustand/middleware"

// Persistir é conveniência: janela privada, cota estourada ou site data bloqueado
// não podem derrubar a tela. Se falhar, o estado fica só em memória.
export const safeLocalStorage = {
  getItem(name: string): string | null {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem(name: string, value: string): void {
    try {
      localStorage.setItem(name, value)
    } catch {
      // Sem espaço para o valor novo: o antigo já não vale, então sai também.
      try {
        localStorage.removeItem(name)
      } catch {
        // storage indisponível
      }
    }
  },
  removeItem(name: string): void {
    try {
      localStorage.removeItem(name)
    } catch {
      // storage indisponível
    }
  },
}

/** Para o `persist` do zustand: uma falha de escrita não aborta a action. */
export const createSafeJSONStorage = <S>() =>
  createJSONStorage<S>(() => safeLocalStorage)
