import { realpathSync } from "fs"
import path from "path"
import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite"
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
    // Por checkout, não dentro de node_modules: em worktree o node_modules é um
    // link para o repositório principal, e dois Vite otimizando as dependências
    // no mesmo diretório se atropelam.
    cacheDir: path.resolve(__dirname, ".vite"),
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port,
      host: true,
      fs: {
        // O caminho real do node_modules: num worktree ele fica fora da raiz, e as
        // fontes do @fontsource seriam recusadas com 403.
        allow: [
          searchForWorkspaceRoot(process.cwd()),
          realpathSync(path.resolve(__dirname, "node_modules")),
        ],
      },
    },
  }
})
