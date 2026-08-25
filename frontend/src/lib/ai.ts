import {
  artImage,
  spansFromMarkdown,
  spansToPlainText,
  type CarouselCard,
  type CarouselFormat,
  type CarouselTheme,
  type ImageSource,
  type TextSpan,
  THEME_PRESETS,
} from "@/lib/doc"

// O contrato da geração. Hoje tudo acontece aqui no navegador, com latência
// fingida — mas as assinaturas são as que o Rails vai implementar: entram
// texto e opções, sai um fluxo (`AsyncGenerator`) que a tela consome peça por
// peça e pode interromper. Quando o servidor entrar, troca-se só este módulo.
//
// Módulo sem idioma de interface: os erros são **códigos** e a tela traduz.
// O conteúdo gerado, esse sim, é obra do usuário — e nasce em pt-BR.

export type RewriteIntent =
  | "shorten"
  | "expand"
  | "casual"
  | "expert"
  | "fix"

export type AiErrorCode = "noCredits" | "failed" | "cancelled"

export class AiError extends Error {
  readonly code: AiErrorCode

  constructor(code: AiErrorCode) {
    super(code)
    this.name = "AiError"
    this.code = code
  }
}

/** Quanto cada operação custa em créditos. */
export const AI_COST = {
  carousel: 5,
  card: 1,
  rewrite: 1,
  image: 2,
  caption: 1,
} as const

const STEP_DELAY = 420

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer)
        reject(new AiError("cancelled"))
      },
      { once: true }
    )
  })
}

// ---------------------------------------------------------------------------
// Conteúdo simulado. Em pt-BR de propósito: é obra do usuário, não interface.

/** O assunto, limpo dos verbos de comando com que as pessoas escrevem. */
function subjectOf(prompt: string): string {
  const cleaned = prompt
    .trim()
    .replace(/^(faça|crie|monte|gere|quero)\s+(um|uma)?\s*(carrossel|post)?\s*(sobre|de|para)?\s*/i, "")
    .replace(/\.$/, "")
  return cleaned || prompt.trim()
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const CARD_RECIPES: ReadonlyArray<(subject: string) => { title: string; body: string }> = [
  (s) => ({
    title: "Por que isso importa",
    body: `A maior parte das pessoas trata **${s}** como detalhe — e é justamente aí que o resultado escapa.`,
  }),
  (s) => ({
    title: "O erro mais comum",
    body: `Começar por ${s} sem definir o que se quer no fim. Sem destino, qualquer caminho serve, e nenhum leva longe.`,
  }),
  (s) => ({
    title: "Comece por aqui",
    body: `Escolha **uma** mudança em ${s} e sustente por duas semanas. Uma feita vale mais do que cinco planejadas.`,
  }),
  (s) => ({
    title: "O que muda na prática",
    body: `Quem organiza ${s} ganha tempo de volta já na primeira semana — e para de decidir a mesma coisa todo dia.`,
  }),
  (s) => ({
    title: "Guarde este",
    body: `Salve este carrossel e volte nele quando ${s} sair do controle. É para isso que ele existe.`,
  }),
]

const LIST_ITEMS: ReadonlyArray<(subject: string) => string> = [
  (s) => `Defina o resultado antes de mexer em ${s}`,
  () => "Corte tudo o que não empurra esse resultado",
  () => "Faça o menor passo possível hoje",
  () => "Repita por duas semanas antes de julgar",
]

function textBlock(
  id: string,
  role: "title" | "subtitle" | "body" | "caption",
  text: string,
  align: "start" | "center" | "end" = "start",
  color: "ink" | "accent" | "muted" = "ink"
) {
  return {
    id,
    type: "text" as const,
    role,
    spans: spansFromMarkdown(text),
    align,
    color,
  }
}

export type GenerateOptions = {
  format: CarouselFormat
  cardCount?: number
  signal?: AbortSignal
}

/** Tema sugerido para um assunto — determinístico pelo comprimento da frase. */
export function suggestTheme(prompt: string): CarouselTheme {
  const index = prompt.trim().length % THEME_PRESETS.length
  return THEME_PRESETS[index].theme
}

export function suggestTitle(prompt: string): string {
  return capitalize(subjectOf(prompt)).slice(0, 60)
}

/**
 * O carrossel inteiro, um card por vez — é o que permite a trilha encher na
 * frente de quem pediu, em vez de esperar tudo pronto.
 */
export async function* generateCarousel(
  prompt: string,
  options: GenerateOptions
): AsyncGenerator<CarouselCard> {
  const subject = subjectOf(prompt)
  const total = Math.max(3, Math.min(options.cardCount ?? 6, 10))
  const stamp = `ia-${Date.now().toString(36)}`

  await wait(STEP_DELAY * 1.5, options.signal)

  // Capa: selo, título grande e assinatura embaixo, sobre a arte.
  yield {
    id: `${stamp}-c0`,
    layout: "image-full",
    bg: null,
    align: "bottom",
    image: artImage("beams", subject.length + 3),
    blocks: [
      {
        id: `${stamp}-c0-b0`,
        type: "badge",
        label: "Guia rápido",
        variant: "soft",
        align: "start",
      },
      textBlock(`${stamp}-c0-b1`, "title", capitalize(subject)),
      textBlock(`${stamp}-c0-b2`, "caption", "Arraste para o lado", "start", "muted"),
    ],
  }

  for (let i = 1; i < total - 1; i++) {
    await wait(STEP_DELAY, options.signal)

    // Um card de lista no meio quebra o ritmo de título+texto.
    if (i === Math.floor(total / 2)) {
      yield {
        id: `${stamp}-c${i}`,
        layout: "no-image",
        bg: null,
        align: "top",
        image: null,
        blocks: [
          textBlock(`${stamp}-c${i}-b0`, "title", "Quatro passos"),
          {
            id: `${stamp}-c${i}-b1`,
            type: "steps",
            items: LIST_ITEMS.map((build) => spansFromMarkdown(build(subject))),
            color: "ink",
          },
        ],
      }
      continue
    }

    const recipe = CARD_RECIPES[(i - 1) % CARD_RECIPES.length](subject)
    yield {
      id: `${stamp}-c${i}`,
      layout: "no-image",
      bg: null,
      align: "top",
      image: null,
      blocks: [
        textBlock(`${stamp}-c${i}-b0`, "title", recipe.title),
        textBlock(`${stamp}-c${i}-b1`, "body", recipe.body, "start", "muted"),
      ],
    }
  }

  await wait(STEP_DELAY, options.signal)

  // Fecho: o convite. Todo carrossel precisa terminar pedindo alguma coisa.
  yield {
    id: `${stamp}-c${total - 1}`,
    layout: "no-image",
    bg: null,
    align: "center",
    image: null,
    blocks: [
      textBlock(`${stamp}-c${total - 1}-b0`, "title", "Ficou com dúvida?", "center"),
      textBlock(
        `${stamp}-c${total - 1}-b1`,
        "body",
        `Comenta aqui embaixo o que trava você em ${subject}.`,
        "center",
        "muted"
      ),
      {
        id: `${stamp}-c${total - 1}-b2`,
        type: "button",
        label: "Salve para depois",
        variant: "solid",
        align: "center",
      },
    ],
  }
}

// ---------------------------------------------------------------------------

const TONE_OPENERS: Record<"casual" | "expert", string> = {
  casual: "Olha só: ",
  expert: "Na prática, ",
}

function rewriteText(text: string, intent: RewriteIntent): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  switch (intent) {
    case "shorten": {
      const first = trimmed.split(/(?<=[.!?])\s/)[0] ?? trimmed
      return first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first
    }
    case "expand":
      return `${trimmed.replace(/\s*$/, "")} E vale o lembrete: constância pesa mais do que intensidade — é o que separa quem tenta de quem chega.`
    case "casual":
      return TONE_OPENERS.casual + trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
    case "expert":
      return TONE_OPENERS.expert + trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
    case "fix": {
      const fixed = capitalize(trimmed.replace(/\s+/g, " "))
      return /[.!?…]$/.test(fixed) ? fixed : `${fixed}.`
    }
  }
}

/**
 * Reescrita em fluxo: entrega o texto crescendo, para a tela mostrar a frase
 * se formando em vez de piscar pronta. As marcas do primeiro trecho são
 * preservadas — reescrever não deveria apagar o negrito de quem escreveu.
 */
export async function* rewriteSpans(
  spans: TextSpan[],
  intent: RewriteIntent,
  signal?: AbortSignal
): AsyncGenerator<TextSpan[]> {
  const source = spansToPlainText(spans)
  const target = rewriteText(source, intent)
  const words = target.split(" ")

  for (let i = 1; i <= words.length; i++) {
    await wait(38, signal)
    yield [{ text: words.slice(0, i).join(" ") }]
  }
}

/** Imagem gerada — hoje devolve arte determinística a partir do texto. */
export async function generateCardImage(
  hint: string,
  signal?: AbortSignal
): Promise<ImageSource> {
  await wait(STEP_DELAY * 2.5, signal)
  const styles = ["blob", "arc", "waves", "dots", "grid", "beams"] as const
  const seed = Math.abs(hashOf(hint)) % 100000
  return { kind: "art", style: styles[seed % styles.length], seed, tint: "accent" }
}

/** Legenda sugerida a partir do que já está escrito nos cards. */
export async function* suggestCaption(
  title: string,
  firstCardText: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const subject = subjectOf(title)
  const caption = [
    `${capitalize(subject)} — o que ninguém te conta.`,
    "",
    firstCardText.trim()
      ? `${firstCardText.trim().slice(0, 140)}`
      : "Arraste para o lado e me conta o que você já tentou.",
    "",
    "Salve para não perder e compartilhe com quem precisa ler isso.",
    "",
    `#${slugTag(subject)} #conteudo #dicas`,
  ].join("\n")

  const words = caption.split(" ")
  for (let i = 1; i <= words.length; i++) {
    await wait(24, signal)
    yield words.slice(0, i).join(" ")
  }
}

function slugTag(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "carrossel"
  )
}

function hashOf(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash |= 0
  }
  return hash
}
