// O botão voltar do aparelho, em tudo que abre por cima da tela: desfaz um passo de cada vez.
//
// O histórico só sabe de URL, e a maior parte do que a pessoa abre não tem URL: um diálogo, uma folha,
// um painel, um menu. Cada coisa aberta vira uma camada, e cada camada ganha uma entrada no histórico
// com a mesma URL. Voltar tira a entrada e, sem ela, a camada de cima fecha.
//
// O jeito ingênuo (cada camada empurra ao abrir e desfaz ao fechar) quebra na primeira troca
// encadeada: fechar uma e abrir outra no mesmo instante faz o `history.back()` da primeira, que é
// assíncrono, derrubar o `pushState` da segunda. Por isso aqui existe uma conta só: quantas camadas
// estão abertas contra quantas entradas existem, e o que corrige a diferença é uma função só.
//
// Há dois tipos de camada:
// - As da própria tela (painel do chat, seleção, emoji), que se declaram com `useBackLayer`.
// - Tudo que vem do Base UI, que aparece no `document.body` em um portal: `SidePanel`,
//   `ResponsiveDialog`, `BottomSheet`, menus, seletores. Ninguém precisa declarar.
//
// Três encontros com o roteador, que também escreve no histórico:
// - Painel que abriu junto com uma entrada própria (`?card=`, com push): voltar já é o do roteador, e
//   ele não vira camada. Ver `ROUTE_POPUP_WINDOW_MS`.
// - O roteador troca a query com camada aberta (fechar um painel de `?person=`, filtro numa folha):
//   ele reescreve a entrada de cima, mas é a de baixo que vai ficar. O endereço desce junto, em `carry`.
// - Navegar enquanto a travessia está a caminho: o Chrome chega à entrada de baixo e perde a rota nova,
//   e a navegação voltaria atrás sem ninguém pedir. Quem percebe é o `pushState`, e `onPopState` escreve
//   de novo, do lugar certo, o que ficou em `raced`.

const DEPTH_KEY = "vekooLayers"

/** Se o `popstate` de uma travessia nossa não chegar, a conta não pode ficar presa esperando. */
const TRAVERSAL_TIMEOUT_MS = 800

/**
 * Popup que aparece até esse tempo depois de uma entrada nova do roteador foi aberto por ela. Com folga
 * para o chunk do painel chegar. Se passar disso, ele conta como camada: voltar fecha do mesmo jeito.
 */
const ROUTE_POPUP_WINDOW_MS = 800

const POPUP_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [data-slot="select-content"], [data-slot="combobox-content"]'

/** `close` que devolve `false` não fechou: perguntou antes, e a camada continua aberta. */
type Layer = { close: () => boolean | void }

type HistoryRecord = Record<string, unknown> | null

const nativePushState = window.history.pushState.bind(window.history)
const nativeReplaceState = window.history.replaceState.bind(window.history)

/** Em ordem de abertura: a última é a de cima. */
const layers: Layer[] = []

/** Popups a quem já foi pedido para fechar, enquanto o Base UI não responde. */
const closing = new WeakSet<Element>()
/** Popups já vistos, e os que vieram com uma entrada própria do roteador. */
const classified = new WeakSet<Element>()
const routeOwned = new WeakSet<Element>()

let installs = 0
let observer: MutationObserver | null = null
let frame = 0
let traversing = false
let traversalTimer = 0
/** Até onde o histórico estava: é o que separa o voltar do aparelho de uma travessia nossa. */
let knownDepth = 0
/** A entrada do roteador em que se está, pela `key` dela. Mudou, e o `popstate` é dele. */
let routerKey: unknown = null
let lastRouteEntryAt = Number.NEGATIVE_INFINITY
/** O que o roteador escreveu na entrada de cima, para descer às de baixo. */
let carry: { state: HistoryRecord; url: string } | null = null
/** O que o roteador escreveu com a travessia a caminho. */
let raced: { write: typeof nativePushState; state: HistoryRecord; url: string } | null = null
let afterSettled: (() => void) | null = null

function absoluteUrl(url: string | URL | null | undefined): string {
  return new URL(url ?? window.location.href, window.location.href).href
}

function historyState(): HistoryRecord {
  return window.history.state as HistoryRecord
}

function depthOf(state: HistoryRecord): number {
  const depth = state?.[DEPTH_KEY]
  return typeof depth === "number" ? depth : 0
}

function currentDepth(): number {
  return depthOf(historyState())
}

function portalRoots(): Element[] {
  return Array.from(document.body.children).filter(
    (element) => element.id !== "root" && element.tagName !== "SCRIPT"
  )
}

function classify(popup: Element) {
  if (classified.has(popup)) return
  classified.add(popup)
  if (performance.now() - lastRouteEntryAt < ROUTE_POPUP_WINDOW_MS) routeOwned.add(popup)
}

function openPopups(): Element[] {
  const found: Element[] = []
  for (const root of portalRoots()) {
    for (const popup of root.querySelectorAll(POPUP_SELECTOR)) {
      if (!popup.hasAttribute("data-open") || closing.has(popup)) continue
      classify(popup)
      if (!routeOwned.has(popup)) found.push(popup)
    }
  }
  return found
}

/** Quantas camadas estão abertas agora. O gesto de voltar só vale para quem está por cima. */
export function openLayerCount(): number {
  return layers.length + openPopups().length
}

function beginTraversal(delta: number) {
  traversing = true
  window.clearTimeout(traversalTimer)
  traversalTimer = window.setTimeout(() => {
    traversing = false
    raced = null
    schedule()
  }, TRAVERSAL_TIMEOUT_MS)
  window.history.go(delta)
}

function reconcile() {
  frame = 0
  if (installs === 0 || traversing) return

  const wanted = openLayerCount()
  const have = currentDepth()

  if (wanted > have) {
    const state = historyState()
    for (let depth = have + 1; depth <= wanted; depth += 1) {
      nativePushState({ ...state, [DEPTH_KEY]: depth }, "")
    }
    knownDepth = wanted
  } else if (wanted < have) {
    beginTraversal(wanted - have)
  } else if (afterSettled) {
    const run = afterSettled
    afterSettled = null
    run()
  }
}

function schedule() {
  if (frame || installs === 0) return
  frame = window.requestAnimationFrame(reconcile)
}

function closeTop() {
  const popup = openPopups().at(-1)
  if (!popup) {
    const layer = layers.pop()
    if (layer?.close() === false) layers.push(layer)
    return
  }

  closing.add(popup)
  // Esc é o caminho que todo popup já respeita, inclusive o painel que pergunta antes de perder o
  // que foi digitado. Sai de onde a tecla sairia: do que tem o foco, se estiver no portal (um seletor
  // com busca fecha pelo próprio campo, e o painel em volta dele continua aberto). `isTrusted` falso é
  // o que permite a quem ouve Esc para outra coisa, como sair da seleção, saber que não é com ele.
  const focused = document.activeElement
  const inPortal = focused && portalRoots().some((root) => root.contains(focused))
  ;(inPortal ? focused : popup).dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })
  )

  // Recusou (perguntou antes, por exemplo): continua sendo uma camada, e a entrada volta.
  window.setTimeout(() => {
    if (!popup.isConnected || !popup.hasAttribute("data-open")) return
    closing.delete(popup)
    schedule()
  }, 120)
}

function onPopState(event: PopStateEvent) {
  if (installs === 0) return

  const wasOurs = traversing
  traversing = false
  window.clearTimeout(traversalTimer)

  // Alguém navegou com a travessia a caminho, e ela chegou por cima da rota nova. O roteador já está
  // lá e nem precisa saber: basta escrever de novo o que ele tinha escrito, a partir daqui.
  if (wasOurs && raced) {
    const { write, state: racedState, url } = raced
    raced = null
    event.stopImmediatePropagation()
    write(racedState, "", url)
    knownDepth = currentDepth()
    routerKey = racedState?.key
    lastRouteEntryAt = performance.now()
    schedule()
    return
  }
  raced = null

  const state = historyState()
  const depth = depthOf(state)
  const lost = knownDepth - depth
  knownDepth = depth

  // Andou só entre as nossas entradas: a rota é a mesma, e o roteador não tem o que fazer aqui. Com
  // `carry`, a chave de baixo é outra, mas é o endereço de cima que vale.
  if (carry || (state?.key !== undefined && state.key === routerKey)) {
    event.stopImmediatePropagation()
    if (carry) {
      nativeReplaceState(depth > 0 ? { ...carry.state, [DEPTH_KEY]: depth } : carry.state, "", carry.url)
      if (depth === 0) carry = null
    }
  } else {
    routerKey = state?.key
    lastRouteEntryAt = performance.now()
  }

  // Voltar do aparelho: sumiu uma entrada nossa, e quem responde é a camada de cima.
  if (!wasOurs) {
    for (let step = 0; step < lost; step += 1) closeTop()
  }
  schedule()
}

// Antes do roteador, que passa a ouvir ao montar: no `window`, os ouvintes de `popstate` disparam na
// ordem de registro. É por isso que este módulo é importado em `main.tsx`.
window.addEventListener("popstate", onPopState)

window.history.pushState = (state, unused, url) => {
  if (installs > 0) {
    if (traversing) raced = { write: nativePushState, state: state as HistoryRecord, url: absoluteUrl(url) }
    lastRouteEntryAt = performance.now()
    routerKey = (state as HistoryRecord)?.key
    knownDepth = 0
    carry = null
  }
  nativePushState(state, unused, url)
}

window.history.replaceState = (state, unused, url) => {
  const depth = installs > 0 ? currentDepth() : 0
  if (depth === 0) {
    if (installs > 0) routerKey = (state as HistoryRecord)?.key
    nativeReplaceState(state, unused, url)
    return
  }

  const next = new URL(absoluteUrl(url))
  if (next.pathname === window.location.pathname) {
    carry = { state: state as HistoryRecord, url: next.href }
    routerKey = (state as HistoryRecord)?.key
    nativeReplaceState({ ...(state as HistoryRecord), [DEPTH_KEY]: depth }, unused, url)
    return
  }

  // Outra rota, vinda de dentro de uma folha: a entrada dela vira a rota nova, em vez de ficar órfã e
  // exigir um voltar a mais depois.
  if (traversing) raced = { write: nativeReplaceState, state: state as HistoryRecord, url: next.href }
  knownDepth = 0
  routerKey = (state as HistoryRecord)?.key
  carry = null
  nativeReplaceState(state, unused, url)
}

function watchPortal(element: Element) {
  observer?.observe(element, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-open", "data-closed"],
  })
}

/** Liga a conta enquanto a casca do celular estiver montada. Devolve o desligar. */
export function installBackStack(): () => void {
  installs += 1

  if (installs === 1) {
    knownDepth = currentDepth()
    routerKey = historyState()?.key
    // Só os filhos do `body` e o que há dentro dos portais: uma lista que muda a cada quadro de
    // rolagem nunca acorda este observador.
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target === document.body) {
          record.addedNodes.forEach((node) => {
            if (node instanceof Element && node.id !== "root") watchPortal(node)
          })
        }
      }
      schedule()
    })
    observer.observe(document.body, { childList: true })
    portalRoots().forEach(watchPortal)
  }
  schedule()

  return () => {
    installs -= 1
    if (installs > 0) return

    observer?.disconnect()
    observer = null
    window.clearTimeout(traversalTimer)
    if (frame) window.cancelAnimationFrame(frame)
    frame = 0
    traversing = false
    raced = null
    carry = null
    afterSettled = null
    layers.length = 0

    // Saiu da largura de celular com camada aberta: a entrada não pode virar um voltar que não faz nada.
    const depth = currentDepth()
    if (depth > 0) window.history.go(-depth)
  }
}

/** Declara uma camada aberta. Devolve o que a tira da conta, quando ela fecha por outro caminho. */
export function pushLayer(close: Layer["close"]): () => void {
  const layer: Layer = { close }
  layers.push(layer)
  schedule()

  return () => {
    const index = layers.indexOf(layer)
    if (index >= 0) layers.splice(index, 1)
    schedule()
  }
}

/**
 * Fecha tudo o que estiver aberto e só então chama `run`. Quem navega depois de uma camada (excluir
 * a conversa, a seta do cabeçalho com o emoji aberto) passa por aqui: navegar antes de o histórico
 * assentar faria o `history.go` pendente cair em cima da rota nova.
 */
export function closeLayersThen(run: () => void): void {
  const refused = layers.splice(0).filter((layer) => layer.close() === false)
  if (refused.length > 0) {
    // Alguma camada perguntou antes de fechar: a resposta é da pessoa, e ninguém navega por ela.
    layers.unshift(...refused)
    schedule()
    return
  }

  if (!traversing && currentDepth() === 0 && openPopups().length === 0) {
    run()
    return
  }
  afterSettled = run
  schedule()
}
