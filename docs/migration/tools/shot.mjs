#!/usr/bin/env node
// Screenshot de uma rota do front, logado na conta de demonstração.
//
//   node docs/migration/tools/shot.mjs <url> <saida.png> [--mobile] [--full] [--wait=ms]
//        [--api=http://localhost:3040] [--selector=css-para-clicar] [--email=] [--password=]
//
// Imprime os erros de console e as falhas de rede encontradas; veja a imagem com a
// ferramenta Read. Guarde os PNGs em ~/.cache/vekoo-shot/shots/ (nunca em /tmp, que
// some ao reiniciar). O puppeteer-core mora em ~/.cache/vekoo-shot para não virar
// dependência do projeto: o front não tem framework de teste, por decisão.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(join(homedir(), '.cache/vekoo-shot/'))
const puppeteer = require('puppeteer-core')

const [url, out, ...flags] = process.argv.slice(2)
if (!url || !out) {
  console.error('uso: shot.mjs <url> <saida.png> [--mobile] [--full] [--wait=ms] [--selector=css]')
  process.exit(1)
}
const opt = (name, fallback) => {
  const hit = flags.find((f) => f.startsWith(`--${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : flags.includes(`--${name}`) ? true : fallback
}
const api = opt('api', 'http://localhost:3040')
const email = opt('email', 'marina.duarte@exemplo.com.br')
const password = opt('password', 'carrossel123')

// O /login tem limite de tentativas por e-mail, compartilhado entre todos os agentes.
// O token vale 30 dias: guarda em cache e só entra de novo se ele deixar de valer.
const cacheFile = join(homedir(), '.cache/vekoo-shot/tokens.json')

function readCache() {
  try {
    return JSON.parse(readFileSync(cacheFile, 'utf8'))
  } catch {
    return {}
  }
}

async function validToken(candidate) {
  if (!candidate) return false
  const res = await fetch(`${api}/me`, { headers: { Authorization: `Bearer ${candidate}` } })
  return res.ok
}

async function login() {
  const res = await fetch(`${api}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: new URL(url).origin },
    body: JSON.stringify({ session: { email, password } }),
  })
  if (!res.ok) {
    console.error('login falhou', res.status, await res.text())
    process.exit(2)
  }
  const { token: fresh } = await res.json()
  const cache = readCache()
  cache[`${api}|${email}`] = fresh
  // Escrita atômica: vários agentes usam este arquivo ao mesmo tempo.
  const tmp = `${cacheFile}.${process.pid}`
  writeFileSync(tmp, JSON.stringify(cache))
  renameSync(tmp, cacheFile)
  return fresh
}

const cached = readCache()[`${api}|${email}`]
const token = (await validToken(cached)) ? cached : await login()

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream'],
})
const page = await browser.newPage()
const mobile = opt('mobile', false)
await page.setViewport(
  mobile
    ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { width: 1440, height: 900, deviceScaleFactor: 1 }
)
const problems = []
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('favicon')) {
    problems.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`)
  }
})
await page.evaluateOnNewDocument((t) => {
  localStorage.setItem('vekoo.token.v1', t)
  localStorage.setItem('vekoo.lang', 'pt-BR')
}, token)
await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 }).catch((e) => problems.push(`goto: ${e.message}`))
const click = opt('selector', null)
if (click) await page.click(click).catch((e) => problems.push(`click: ${e.message}`))
await new Promise((r) => setTimeout(r, Number(opt('wait', 800))))
// O <main> do app rola por dentro, então "página inteira" do navegador captura só a
// primeira tela. Estica a janela até caber o conteúdo que rola.
if (opt('full', false)) {
  const height = await page.evaluate(() => {
    const main = document.querySelector('main')
    const content = main ? main.getBoundingClientRect().top + main.scrollHeight : 0
    return Math.ceil(Math.max(content, document.documentElement.scrollHeight))
  })
  const viewport = page.viewport()
  await page.setViewport({ ...viewport, height: Math.min(height, 12000) })
  await new Promise((r) => setTimeout(r, 300))
}
await page.screenshot({ path: out })
await browser.close()
console.log(problems.length ? [...new Set(problems)].join('\n') : 'sem erros de console/rede')
