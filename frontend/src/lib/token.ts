// O token da sessão, num lugar só.
//
// Nenhum outro módulo lê `localStorage` atrás do token: é isto que faz a troca
// futura por cookie httpOnly custar pouco — apaga-se este arquivo, põe-se
// `credentials: "include"` em `apiFetch` e libera-se `credentials` no
// `cors.rb`. Nenhuma tela muda.
//
// ⚠️ Guardar o token no navegador significa que qualquer XSS o lê. O backend
// já documenta a troca por cookie (ver `concerns/authenticatable.rb`); enquanto
// front (:5213) e API (:3040) estiverem em origens diferentes, o cookie
// exigiria SameSite=None e credenciais no CORS.

const STORAGE_KEY = "vekoo.token.v1"

// Espelho em memória: o localStorage pode estar indisponível (janela anônima,
// armazenamento bloqueado) e mesmo assim a sessão tem que funcionar até a aba
// fechar.
let current: string | null = null
let loaded = false

export function getToken(): string | null {
  if (!loaded) {
    try {
      current = localStorage.getItem(STORAGE_KEY)
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
    loaded = true
  }
  return current
}

export function setToken(token: string): void {
  current = token
  loaded = true
  try {
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    /* idem */
  }
}

export function clearToken(): void {
  current = null
  loaded = true
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* idem */
  }
}
