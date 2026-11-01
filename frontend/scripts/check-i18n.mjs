#!/usr/bin/env node
// Guarda de i18n: nada de texto visível escrito no componente, e nenhum
// idioma com chave a menos que o outro.
//
// Roda junto do lint (`npm run lint`). Usa o parser do próprio TypeScript —
// regex sobre JSX erra em atributo, comentário e template literal.
//
// O que acusa:
//   1. texto solto em JSX (`<p>Salvar</p>`)
//   2. literal em atributo visível (placeholder, aria-label, title, alt…)
//   3. literal em toast(...) / toast.error(...)
//   4. chave usada em `t("...")` que não existe no bundle pt-BR
//   5. chave em um idioma e não no outro
//
// Escapatória para o caso legítimo (marca, atalho de teclado, símbolo):
// comentário `i18n-exempt` na linha ou na linha de cima, com a razão.

import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const ROOT = path.resolve(import.meta.dirname, "..")
const SRC = path.join(ROOT, "src")
const LOCALES = path.join(SRC, "locales")
// Os textos da área da Vekoo (`/admin`) ficam fora do bundle do assinante:
// moram junto do código dela e só carregam com ela. A guarda os lê também.
const ADMIN_LOCALES = path.join(SRC, "admin", "locales")
const SOURCE_LANGUAGE = "pt-BR"

// Primitivos do shadcn entram intocados (é regra do projeto) e não carregam
// copy própria; o resto de components/ e routes/ é território da guarda.
const SKIP = [path.join(SRC, "components", "ui"), LOCALES]

const VISIBLE_ATTRS = new Set([
  "placeholder", "title", "alt", "label", "description", "aria-label",
  "aria-placeholder", "aria-description", "aria-roledescription", "aria-valuetext",
])

const TOAST_CALLEES = new Set(["toast", "toast.error", "toast.success", "toast.warning", "toast.info"])

const problems = []
const usedKeys = new Set()
const dynamicKeys = []

function report(file, node, source, message) {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
  problems.push({ file: path.relative(ROOT, file), line: line + 1, message })
}

/** `i18n-exempt` na linha do nó ou na de cima libera aquele caso. */
function exempt(node, source, lines) {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
  return [lines[line], lines[line - 1]].some((text) => text?.includes("i18n-exempt"))
}

/** Texto com palavra de verdade — pontuação, número e símbolo passam. */
function looksLikeCopy(text) {
  const clean = text.replace(/\{["'`].*?["'`]\}/g, " ").replace(/&[a-z]+;/gi, " ").trim()
  return /\p{L}{2,}/u.test(clean)
}

function walk(node, file, source, lines) {
  if (ts.isJsxText(node) && looksLikeCopy(node.text) && !exempt(node, source, lines)) {
    report(file, node, source, `texto solto em JSX: ${JSON.stringify(node.text.trim().slice(0, 48))}`)
  }

  if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
    const name = node.name.getText(source)
    if (VISIBLE_ATTRS.has(name) && looksLikeCopy(node.initializer.text) && !exempt(node, source, lines)) {
      report(file, node, source, `${name} com texto fixo: ${JSON.stringify(node.initializer.text.slice(0, 48))}`)
    }
  }

  if (ts.isCallExpression(node)) {
    const callee = node.expression.getText(source)
    const [first] = node.arguments

    if (TOAST_CALLEES.has(callee) && first && ts.isStringLiteral(first) && looksLikeCopy(first.text)) {
      if (!exempt(node, source, lines)) {
        report(file, node, source, `toast com texto fixo: ${JSON.stringify(first.text.slice(0, 48))}`)
      }
    }

    if (/(^|\.)t$/.test(callee) && first) {
      if (ts.isStringLiteral(first)) usedKeys.add(first.text)
      else if (ts.isTemplateExpression(first)) dynamicKeys.push(first.getText(source))
    }
  }

  // <Trans i18nKey="..."> conta como uso.
  if (ts.isJsxAttribute(node) && node.name.getText(source) === "i18nKey" && node.initializer && ts.isStringLiteral(node.initializer)) {
    usedKeys.add(node.initializer.text)
  }

  node.forEachChild((child) => walk(child, file, source, lines))
}

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (SKIP.some((skipped) => full.startsWith(skipped))) return []
    if (entry.isDirectory()) return sources(full)
    return entry.name.endsWith(".tsx") ? [full] : []
  })
}

/** Todas as chaves de um bundle, achatadas em `a.b.c`. */
function flatten(object, prefix = "", into = new Set()) {
  for (const [key, value] of Object.entries(object)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object") flatten(value, full, into)
    else into.add(full)
  }
  return into
}

function loadBundle(language) {
  const dir = path.join(LOCALES, language)
  const bundle = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .reduce((acc, name) => Object.assign(acc, JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))), {})
    : JSON.parse(fs.readFileSync(`${dir}.json`, "utf8"))
  const admin = path.join(ADMIN_LOCALES, `${language}.json`)
  return fs.existsSync(admin) ? Object.assign(bundle, JSON.parse(fs.readFileSync(admin, "utf8"))) : bundle
}

/** Uma pasta por idioma (o `resources.ts` da costura não é idioma). */
function languages() {
  return fs.readdirSync(LOCALES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/, ""))
    .filter((value, index, all) => all.indexOf(value) === index)
}

// ---------------------------------------------------------------- execução

for (const file of sources(SRC)) {
  const text = fs.readFileSync(file, "utf8")
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  walk(source, file, source, text.split("\n"))
}

const bundles = Object.fromEntries(languages().map((language) => [language, flatten(loadBundle(language))]))
const source = bundles[SOURCE_LANGUAGE]

for (const [language, keys] of Object.entries(bundles)) {
  if (language === SOURCE_LANGUAGE) continue
  for (const key of source) {
    if (!keys.has(key)) problems.push({ file: `src/locales/${language}`, line: 0, message: `falta a chave ${key}` })
  }
  for (const key of keys) {
    if (!source.has(key)) problems.push({ file: `src/locales/${SOURCE_LANGUAGE}`, line: 0, message: `falta a chave ${key} (existe em ${language})` })
  }
}

// Plural do i18next: `x.count` mora como `x.count_one` / `x.count_other`.
const missing = [...usedKeys].filter(
  (key) => !source.has(key) && !source.has(`${key}_one`) && !source.has(`${key}_other`)
)
for (const key of missing) problems.push({ file: `src/locales/${SOURCE_LANGUAGE}`, line: 0, message: `chave usada e inexistente: ${key}` })

const byFile = problems.reduce((acc, problem) => {
  ;(acc[problem.file] ??= []).push(problem)
  return acc
}, {})

for (const [file, list] of Object.entries(byFile)) {
  console.error(`\n${file}`)
  for (const { line, message } of list) console.error(`  ${line ? `${line}: ` : ""}${message}`)
}

const summary = `${usedKeys.size} chaves usadas · ${dynamicKeys.length} montadas em runtime · ${source.size} no bundle ${SOURCE_LANGUAGE} · ${Object.keys(bundles).length} idiomas`
if (problems.length) {
  console.error(`\n✗ ${problems.length} problema(s) de i18n. ${summary}`)
  process.exit(1)
}
console.log(`✓ i18n em ordem — ${summary}`)
