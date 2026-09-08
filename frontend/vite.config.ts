import path from "path"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Reads the monorepo-root .env (one level up) so VITE_* vars and VITE_PORT
// live in a single source of truth alongside the backend config.
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "")
  const port = Number(rootEnv.VITE_PORT ?? 5173)

  return {
    plugins: [react(), tailwindcss()],
    envDir: path.resolve(__dirname, ".."),
    // A porta do Rails, para o front achar a API no mesmo host da página
    // quando VITE_API_URL estiver vazio (acesso pela rede local, por IP).
    define: {
      "import.meta.env.VITE_RAILS_PORT": JSON.stringify(rootEnv.RAILS_PORT ?? "3000"),
    },
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: { port, host: true },
  }
})
