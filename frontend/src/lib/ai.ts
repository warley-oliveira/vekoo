import { getCatalog, type AiCosts } from "@/lib/catalog"
import { ApiError, apiPost } from "@/lib/api"
import { streamEvents } from "@/lib/sse"
import {
  spansFromMarkdown,
  spansToPlainText,
  type CarouselCard,
  type CarouselFormat,
  type CarouselTheme,
  type ImageSource,
  type TextSpan,
} from "@/lib/doc"

// O contrato da geração, agora servido pelo Rails.
//
// As assinaturas são as mesmas de quando isto era simulado no navegador: entram
// texto e opções, sai um fluxo que a tela consome peça por peça e pode
// interromper. Foi essa forma que permitiu trocar o miolo sem tocar em
// `ai-store.tsx` nem em nenhuma tela.
//
// Módulo sem idioma de interface: os erros são **códigos** e a tela traduz. O
// conteúdo gerado, esse sim, é obra do usuário — e nasce em pt-BR, decidido
// pelo prompt do servidor.

export type RewriteIntent = "shorten" | "expand" | "casual" | "expert" | "fix"

export type AiErrorCode = "noCredits" | "failed" | "cancelled" | "busy"

export class AiError extends Error {
  readonly code: AiErrorCode

  constructor(code: AiErrorCode) {
    super(code)
    this.name = "AiError"
    this.code = code
  }
}

/**
 * Quanto cada operação custa em créditos — a tabela é do servidor
 * (`GET /catalog`), não daqui. Função, e não constante, porque o acervo pode
 * chegar depois do primeiro import deste módulo.
 */
export function aiCost(): AiCosts {
  return getCatalog().aiCosts
}

export type GenerateOptions = {
  format: CarouselFormat
  cardCount?: number
  signal?: AbortSignal
}

/* ---------- sugestões locais ---------- */

// Estas duas continuam no navegador de propósito: o diálogo de criação precisa
// de um título e de um tema **antes** de o carrossel existir, e ir ao servidor
// só para isso adiaria a abertura do editor.

/** Tema sugerido para um assunto — determinístico pelo comprimento da frase. */
export function suggestTheme(prompt: string): CarouselTheme {
  const presets = getCatalog().themePresets
  const index = prompt.trim().length % presets.length
  return presets[index].theme
}

export function suggestTitle(prompt: string): string {
  const subject = prompt.trim().replace(/^(um|uma|o|a)\s+/i, "")
  const first = subject.charAt(0).toUpperCase() + subject.slice(1)
  return first.slice(0, 60)
}

/* ---------- tradução dos erros ---------- */

/**
 * Erro do transporte → código que a tela conhece.
 *
 * `cancelled` nasce **aqui**, e não no servidor: quem cancelou foi quem estava
 * olhando, e o servidor só viu a conexão fechar.
 */
function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error
  if (error instanceof DOMException && error.name === "AbortError") {
    return new AiError("cancelled")
  }
  if (error instanceof ApiError) {
    if (error.code === "noCredits") return new AiError("noCredits")
    if (error.status === 409) return new AiError("busy")
  }
  return new AiError("failed")
}

/** O `event: error` que o servidor manda depois de o fluxo já ter aberto. */
function errorFrom(data: unknown): AiError {
  const code = (data as { error?: { code?: string } } | null)?.error?.code
  if (code === "noCredits") return new AiError("noCredits")
  if (code === "busy") return new AiError("busy")
  return new AiError("failed")
}

/* ---------- geração ---------- */

/**
 * O carrossel inteiro, um card por vez — é o que permite a trilha encher na
 * frente de quem pediu, em vez de esperar tudo pronto.
 */
export async function* generateCarousel(
  prompt: string,
  options: GenerateOptions
): AsyncGenerator<CarouselCard> {
  try {
    for await (const { event, data } of streamEvents(
      "/ai/carousel",
      { prompt, cardCount: options.cardCount, format: options.format },
      options.signal
    )) {
      if (event === "card") yield data as CarouselCard
      else if (event === "error") throw errorFrom(data)
    }
  } catch (error) {
    throw toAiError(error)
  }
}

/**
 * Reescrita em fluxo: entrega o texto crescendo, para a tela mostrar a frase
 * se formando em vez de piscar pronta.
 */
export async function* rewriteSpans(
  spans: TextSpan[],
  intent: RewriteIntent,
  signal?: AbortSignal
): AsyncGenerator<TextSpan[]> {
  const text = spansToPlainText(spans)
  try {
    for await (const { event, data } of streamEvents(
      "/ai/rewrite",
      { text, intent },
      signal
    )) {
      if (event === "delta" || event === "done") {
        // O servidor manda o acumulado, e o `**negrito**` que ele escreve vira
        // marca de verdade aqui — asterisco na tela seria vazamento do formato.
        yield spansFromMarkdown((data as { text: string }).text)
      } else if (event === "error") {
        throw errorFrom(data)
      }
    }
  } catch (error) {
    throw toAiError(error)
  }
}

/**
 * A imagem do card.
 *
 * O modelo **escolhe** a arte, não desenha uma foto: a API não gera imagem. O
 * resultado é sempre um `ImageSource` que o editor sabe renderizar.
 */
export async function generateCardImage(
  hint: string,
  signal?: AbortSignal
): Promise<ImageSource> {
  try {
    // Uma requisição só, sem fluxo: não há o que mostrar em pedaços quando o
    // resultado é uma linha de JSON. Passa pelo `apiPost` como qualquer outra
    // chamada — inclusive o 401 global.
    const { source } = await apiPost<{ source: ImageSource }>(
      "/ai/card-image",
      { hint },
      { signal }
    )
    return source
  } catch (error) {
    throw toAiError(error)
  }
}

/** Legenda sugerida a partir do que já está escrito nos cards. */
export async function* suggestCaption(
  title: string,
  firstCardText: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  try {
    for await (const { event, data } of streamEvents(
      "/ai/caption",
      { title, cardText: firstCardText },
      signal
    )) {
      if (event === "delta" || event === "done") {
        yield (data as { text: string }).text
      } else if (event === "error") {
        throw errorFrom(data)
      }
    }
  } catch (error) {
    throw toAiError(error)
  }
}
