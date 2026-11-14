import { realpathSync } from "fs"
import path from "path"
import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

// Reads the monorepo-root .env (one level up) so VITE_* vars and VITE_PORT
// live in a single source of truth alongside the backend config.
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "")
  const port = Number(rootEnv.VITE_PORT ?? 5173)

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: "generateSW",
        filename: "sw.js",
        // O registro é nosso (lib/pwa.ts), via `virtual:pwa-register`: é ele que decide
        // quando mostrar o aviso de versão nova.
        injectRegister: false,
        // A pessoa decide quando atualizar: o SW novo fica em "waiting" até ela clicar.
        registerType: "prompt",
        manifestFilename: "manifest.webmanifest",
        includeAssets: [
          "favicon.svg",
          "apple-touch-icon.png",
          "pwa-badge-96x96.png",
        ],
        manifest: {
          id: "/",
          name: "Vekoo",
          short_name: "Vekoo",
          description:
            "Atendimento, automação e carrosséis para Instagram, tudo em um lugar só.",
          start_url: "/?source=pwa",
          scope: "/",
          display: "standalone",
          orientation: "portrait-primary",
          // `--primary` e `--background` de src/index.css, em hex: o manifesto não
          // entende oklch. Ele também não tem um par para o escuro que os navegadores
          // leiam: a tela de abertura do PWA sai clara, e a barra do sistema acompanha
          // o tema assim que a página carrega (`meta theme-color`, por `theme-init.js`
          // e `lib/theme.ts`).
          theme_color: "#7132e0",
          background_color: "#fefdfd",
          lang: "pt-BR",
          dir: "ltr",
          categories: ["productivity", "business", "communication"],
          handle_links: "preferred",
          launch_handler: { client_mode: "focus-existing" },
          prefer_related_applications: false,
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/pwa-maskable-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Roteamento do SPA, servido da raiz. O que é do servidor nunca cai nele.
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [
            /^\/cable/,
            /^\/inbound\//,
            /^\/widget\//,
            /^\/rails\//,
            /^\/api\//,
            /^\/up$/,
          ],
          cleanupOutdatedCaches: true,
          // skipWaiting e clientsClaim ficam de fora de propósito: o SW novo espera o
          // "Atualizar agora". É o que evita tela branca ao dar F5 durante um update.
          importScripts: ["sw-push.js"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,woff2}"],
          // O decoder Opus (áudio no Safari/iOS) entra por import() justamente para só
          // descer em quem precisa. O Workbox faria precache de todo .js gerado, o que
          // anularia isso e ainda baixaria o bundle opus-ml (~4 MB, nunca usado) na
          // instalação. O sw-push.js já entra pelo importScripts.
          globIgnores: [
            "**/node_modules/**/*",
            "**/opus-decoder-chunk-*.js",
            "**/opus-ml-*.js",
            // O Monaco (editor de código) pesa alguns MB e só desce em quem abre um editor.
            "**/assets/monaco/**",
            "**/*.worker-*.js",
            "sw-push.js",
          ],
        },
      }),
    ],
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
    build: {
      rolldownOptions: {
        output: {
          // Só renomeia, não muda o chunking: o `ogg-opus-decoder` traz um decoder
          // alternativo de ~4 MB atrás de um import() que nunca disparamos. Com nome
          // estável, o `globIgnores` acima consegue mantê-lo fora do precache.
          chunkFileNames(chunk) {
            const isOpusMl = chunk.moduleIds?.some((id) =>
              id.includes("@wasm-audio-decoders/opus-ml")
            )
            if (isOpusMl) return "assets/opus-ml-[hash].js"
            // Tudo do Monaco numa pasta só, para o `globIgnores` deixar fora do precache.
            const isMonaco = chunk.moduleIds?.some((id) => id.includes("/monaco-editor/"))
            return isMonaco ? "assets/monaco/[name]-[hash].js" : "assets/[name]-[hash].js"
          },
        },
      },
    },
  }
})
