#!/usr/bin/env node
// Gera os ícones do PWA a partir de public/favicon.svg. Os PNGs são comitados: isto só
// roda de novo quando a marca mudar.
//
//   node frontend/scripts/pwa-icons.mjs
//
// O puppeteer-core mora em ~/.cache/vekoo-shot para não virar dependência do projeto.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(homedir(), '.cache/vekoo-shot/'))
const puppeteer = require('puppeteer-core')

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const favicon = readFileSync(join(publicDir, 'favicon.svg'), 'utf8')

// A cor da marca, igual ao `--primary` e ao `theme_color` do manifesto.
const BRAND = '#7132e0'

const ICONS = [
  { file: 'pwa-192x192.png', size: 192, scale: 1 },
  { file: 'pwa-512x512.png', size: 512, scale: 1 },
  // Maskable: o sistema recorta em círculo ou gota, então a cor vai até a borda e só a
  // letra fica no desenho. Ela já cabe na zona segura (os 80% centrais).
  { file: 'pwa-maskable-512x512.png', size: 512, scale: 1, background: BRAND, glyphOnly: true },
  // O iOS arredonda sozinho e pinta de preto o que for transparente.
  { file: 'apple-touch-icon.png', size: 180, scale: 1, background: BRAND, glyphOnly: true },
  // Ícone pequeno da barra de status do Android: só a silhueta da letra, em branco.
  { file: 'pwa-badge-96x96.png', size: 96, scale: 1, glyphOnly: true, silhouette: true },
]

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()

for (const { file, size, scale, background, silhouette, glyphOnly } of ICONS) {
  const mark = glyphOnly ? favicon.replace(/<rect[^>]*\/>/, '') : favicon
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
  const box = Math.round(size * scale)
  await page.setContent(`<!doctype html>
    <html style="background:transparent">
      <body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${background ?? 'transparent'}">
        <div style="width:${box}px;height:${box}px;${silhouette ? 'filter:brightness(0) invert(1);' : ''}">
          ${mark.replace('<svg ', '<svg style="width:100%;height:100%" ')}
        </div>
      </body>
    </html>`)
  await page.screenshot({ path: join(publicDir, file), omitBackground: true })
  console.log(`${file} (${size}x${size})`)
}

await browser.close()
