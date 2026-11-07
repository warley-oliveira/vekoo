// O botão voltar do aparelho, no chat do celular: desfaz um passo de cada vez.
//
// O histórico só sabe de URL, e a maior parte do que a pessoa abre aqui não tem URL: um diálogo, a
// folha de ações, o painel do contato. Cada coisa aberta vira uma camada, e cada camada ganha uma
// entrada no histórico com a mesma URL. Voltar tira a entrada e, sem ela, a camada de cima fecha.
//
// O jeito ingênuo (cada camada empurra ao abrir e desfaz ao fechar) quebra na primeira troca
// encadeada: fechar uma e abrir outra no mesmo instante faz o `history.back()` da primeira, que é
// assíncrono, derrubar o `pushState` da segunda. Por isso aqui existe uma conta só: quantas camadas
// estão abertas contra quantas entradas existem, e o que corrige a diferença é uma função só.
//
// Há dois tipos de camada:
// - As da própria tela (painel, seleção, emoji), que se declaram com `useBackLayer`.
// - Tudo que vem do Base UI (diálogos, folhas e menus do kit e das outras frentes), que aparece no
//   `document.body` em um portal. Ninguém precisa declarar: é o que faz um diálogo novo, ou um
//   seletor dentro do painel de filtros, respeitar o voltar sem que a tela saiba disso.
//
// `BottomSheet` da casca fica de fora: ela cuida do próprio histórico, com `vekooSheet` no estado. A
// conta só precisa não atrapalhar, e esperar quando uma dessas estiver desfazendo a sua entrada.

const DEPTH_KEY = "vekooChatLayers"

/** Se o `popstate` de uma travessia nossa não chegar, a conta não pode ficar presa esperando. */
const TRAVERSAL_TIMEOUT_MS = 800

const POPUP_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [data-slot="select-content"], [data-slot="combobox-content"]'

/** A folha da casca: o popup é transparente e deixa o toque passar. */
const SHELL_SHEET_SELECTOR = '[data-slot="sheet-content"].pointer-events-none'

type Layer = { close: () => void }

/** Em ordem de abertura: a última é a de cima. */
const layers: Layer[] = []

/** Popups a quem já foi pedido para fechar, enquanto o Base UI não responde. */
const closing = new WeakSet<Element>()

let installs = 0
let observer: MutationObserver | null = null
let frame = 0
let traversing = false
let traversalTimer = 0
let afterSettled: (() => void) | null = null

function historyState(): Record<string, unknown> | null {
  return window.history.state as Record<string, unknown> | null
}

function currentDepth(): number {
  const depth = historyState()?.[DEPTH_KEY]
  return typeof depth === "number" ? depth : 0
}

function portalRoots(): Element[] {
  return Array.from(document.body.children).filter(
    (element) => element.id !== "root" && element.tagName !== "SCRIPT"
  )
}

function openPopups(): Element[] {
  const found: Element[] = []
  for (const root of portalRoots()) {
    for (const popup of root.querySelectorAll(POPUP_SELECTOR)) {
      if (!popup.hasAttribute("data-open") || closing.has(popup)) continue
      if (popup.matches(SHELL_SHEET_SELECTOR)) continue
      found.push(popup)
    }
  }
  return found
}

function hasOpenShellSheet(): boolean {
  return portalRoots().some((root) =>
    Boolean(root.querySelector(`${SHELL_SHEET_SELECTOR}[data-open]`))
  )
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
    schedule()
  }, TRAVERSAL_TIMEOUT_MS)
  window.history.go(delta)
}

function reconcile() {
  frame = 0
  if (installs === 0 || traversing) return

  const state = historyState()
  // A folha da casca já pediu para desfazer a entrada dela e o `popstate` ainda vem. Agir agora
  // cairia em cima dessa travessia: quem chega depois é o `popstate`, que chama aqui de novo.
  if (state?.vekooSheet && !hasOpenShellSheet()) return

  const wanted = openLayerCount()
  const have = currentDepth()

  if (wanted > have) {
    // Sem `vekooSheet`: a entrada é nossa, mesmo que uma folha da casca esteja logo abaixo.
    const { vekooSheet: _sheet, ...base } = state ?? {}
    for (let depth = have + 1; depth <= wanted; depth += 1) {
      window.history.pushState({ ...base, [DEPTH_KEY]: depth }, "")
    }
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
    layers.pop()?.close()
    return
  }

  closing.add(popup)
  // O Base UI ouve no `document`: Esc é o caminho que todo popup já respeita, inclusive o painel
  // que pergunta antes de perder o que foi digitado. `isTrusted` falso é o que permite a quem ouve
  // Esc para outra coisa, como sair da seleção, saber que não é com ele.
  popup.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })
  )

  // Recusou (perguntou antes, por exemplo): continua sendo uma camada, e a entrada volta.
  window.setTimeout(() => {
    if (!popup.isConnected || !popup.hasAttribute("data-open")) return
    closing.delete(popup)
    schedule()
  }, 120)
}

function onPopState() {
  const wasOurs = traversing
  traversing = false
  window.clearTimeout(traversalTimer)

  // Voltar do aparelho: uma entrada a menos do que camadas, e quem responde é a de cima.
  if (!wasOurs) {
    let lost = openLayerCount() - currentDepth()
    while (lost > 0) {
      closeTop()
      lost -= 1
    }
  }
  schedule()
}

function watchPortal(element: Element) {
  observer?.observe(element, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-open", "data-closed"],
  })
}

/** Liga a conta enquanto a tela móvel estiver montada. Devolve o desligar. */
export function installBackStack(): () => void {
  installs += 1

  if (installs === 1) {
    window.addEventListener("popstate", onPopState)
    // Só os filhos do `body` e o que há dentro dos portais: o histórico de mensagens, que muda a
    // cada quadro de rolagem, nunca acorda este observador.
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

    window.removeEventListener("popstate", onPopState)
    observer?.disconnect()
    observer = null
    window.clearTimeout(traversalTimer)
    if (frame) window.cancelAnimationFrame(frame)
    frame = 0
    traversing = false
    afterSettled = null
    layers.length = 0

    // Saiu da largura de celular com camada aberta: a entrada não pode virar um voltar que não faz nada.
    const depth = currentDepth()
    if (depth > 0) window.history.go(-depth)
  }
}

/** Declara uma camada aberta. Devolve o que a tira da conta, quando ela fecha por outro caminho. */
export function pushLayer(close: () => void): () => void {
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
  layers.splice(0).forEach((layer) => layer.close())

  if (!traversing && currentDepth() === 0 && openPopups().length === 0) {
    run()
    return
  }
  afterSettled = run
  schedule()
}
