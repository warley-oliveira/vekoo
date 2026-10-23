import type { BrandColor, BrandFont, LogoStyle, Tone } from "@/lib/brand-core"

// O onboarding por conversa — a porta de entrada de toda marca nova.
//
// A pessoa conta da marca e o agente monta o brandcore por baixo. Cada fala
// dela é um turno; o que o agente responde chega como **códigos** (`reply`)
// e a tela escreve o texto no idioma dela. O espelho no servidor é
// `backend/app/models/brand_core/onboarding.rb` + `Onboarding::Run`.
//
// Módulo sem idioma: só códigos e regras. O que aparece na tela vem de
// `onboarding.*` no i18n.

/**
 * Os temas, na ordem em que o agente pergunta. Paleta e fonte são **uma**
 * pergunta para a pessoa e dois temas aqui: cada um tem o próprio "cria pra
 * mim" e o próprio status gravado.
 */
export const TOPICS = [
  "brand",
  "audience",
  "differential",
  "voice",
  "banned",
  "offers",
  "logo",
  "palette",
  "fonts",
] as const
export type Topic = (typeof TOPICS)[number]
/** Depois do último tema, a conversa vira o resumo — e o que se escreve ali é ajuste. */
export type ThreadTopic = Topic | "summary"

/** Os temas como a pessoa os conta no `brandcore · n/8`. */
export const QUESTION_COUNT = 8

/** A posição de cada tema no `n/8` — espelho de `BrandCore::Onboarding::POSITION`. */
const POSITION: Record<Topic, number> = {
  brand: 1,
  audience: 2,
  differential: 3,
  voice: 4,
  banned: 5,
  offers: 6,
  logo: 7,
  palette: 8,
  fonts: 8,
}

export function topicPosition(topic: ThreadTopic): number {
  return topic === "summary" ? QUESTION_COUNT : POSITION[topic]
}

/**
 * O que a pessoa escreveu da última vez que respondeu esta pergunta — o
 * "← voltar" devolve isso ao campo, para ela editar em vez de redigitar.
 * Junta as respostas da última passagem pela pergunta (a resposta e a do
 * seguimento); escolha de proposta e logo não têm texto e ficam de fora.
 */
export function lastAnswerFor(turns: OnboardingTurn[], topic: ThreadTopic): string {
  const position = topicPosition(topic)
  const here = (turn: OnboardingTurn) => turn.topic !== "summary" && topicPosition(turn.topic) === position
  const end = turns.findLastIndex(here)
  const texts: string[] = []
  for (let index = end; index >= 0 && here(turns[index]); index--) {
    const turn = turns[index]
    if (turn.kind === "answer" && turn.text) texts.unshift(turn.text)
  }
  return texts.join("\n")
}

/** O nome do tema na retomada ("Paramos aqui: paleta e fonte"). Paleta e fonte dividem o nome. */
export function topicLabelKey(topic: ThreadTopic): string {
  return topic === "fonts" ? "onboarding.topics.palette" : `onboarding.topics.${topic}`
}

export type OnboardingState = {
  topic: ThreadTopic
  /** 1…8 — paleta e fonte são ambas a 8. */
  position: number
  total: number
  closed: Topic[]
  /** O tema atual tem o chip "não sei — cria pra mim". */
  suggestible: boolean
  segment: string | null
  /** A pessoa pediu "cria pra mim" na logo: o logotipo sai desenhado no resumo. */
  wantsWordmark: boolean
  done: boolean
  readyToFinish: boolean
}

/* ---------- as propostas do "cria pra mim" ---------- */

export type SuggestKind = "palette" | "fonts" | "voice" | "wordmark"

/** Paleta já com os papéis derivados e o contraste conferido pelo servidor. */
export type PaletteOption = {
  name: string
  why: string | null
  colors: BrandColor[]
}

export type FontsOption = {
  why: string | null
  display: BrandFont & { category: string }
  utility: BrandFont & { category: string }
}

export type VoiceOption = {
  essence: string
  why: string | null
  tones: Tone[]
  bannedWords: string[]
}

/** Um dos três logotipos do resumo: a logo já está nos ativos da marca. */
export type WordmarkOption = {
  logoId: string
  style: LogoStyle | null
}

export type SuggestOption = PaletteOption | FontsOption | VoiceOption | WordmarkOption

/* ---------- a conversa ---------- */

/** Os status gravados. `logoUploaded` e `logoNoted` são os dois jeitos de fechar a logo. */
export type StatusTopic = Exclude<Topic, "logo"> | "logoUploaded" | "logoNoted" | "logoSaved"

/** Os textos fixos que o agente pode dizer — `onboarding.agent.<code>`. */
export type AgentTextCode =
  | "followUpGeneric"
  | "adjustAsk"
  | "fontMissing"
  | "wordmarkNoted"
  | "logoOpaque"
  | "wordmarkReady"
  | "suggest.voice"
  | "suggest.palette"
  | "suggest.fonts"

/** Um pedaço da resposta do agente, na ordem em que aparece. */
export type ReplyItem =
  | { type: "status"; topic: StatusTopic }
  /** A confirmação depois de escolher uma proposta ("Paleta gravada ✓"). */
  | { type: "confirm"; topic: "voice" | "palette" | "fonts" | "logo" }
  | { type: "text"; code: AgentTextCode; params?: Record<string, string> }
  /** O seguimento escrito pelo modelo, sobre o que a pessoa disse. */
  | { type: "followUp"; text: string }
  | { type: "question"; topic: Topic }
  | {
      type: "options"
      kind: SuggestKind
      source: "ai" | "curated"
      items: SuggestOption[]
    }
  | { type: "summary" }

/** `back` é o "← voltar": não passa pelo agente, só reabre a pergunta anterior. */
export type TurnKind = "answer" | "suggest" | "choose" | "logo" | "back"

export type OnboardingTurn = {
  id: string
  kind: TurnKind
  status: "thinking" | "answered" | "failed"
  /** O tema em que a pessoa estava quando falou. */
  topic: ThreadTopic
  /** A resposta escrita (só em `answer`). */
  text: string | null
  /** A proposta escolhida (só em `choose`), copiada do turno das propostas. */
  choice: { kind: SuggestKind; index: number; option: SuggestOption } | null
  /** O turno das propostas de onde a escolha saiu. */
  sourceTurnId: string | null
  /** A logo enviada (só em `logo`). */
  assetId: string | null
  reply: ReplyItem[]
  /** `modelDown` quando o motor não respondeu — a resposta ficou salva. */
  error: string | null
  createdAt: number
}

export type OnboardingThread = {
  /** Nulo antes de "Começar a conversa": a tela mostra a intro. */
  conversationId: string | null
  startedAt: number | null
  state: OnboardingState
  turns: OnboardingTurn[]
}

export type MessageInput =
  | { kind: "answer"; text: string }
  | { kind: "suggest" }
  | { kind: "choose"; turnId: string; index: number }
  | { kind: "logo"; assetId: string }

/* ---------- navegação ---------- */

export function onboardingHref(brandId: string): string {
  return `/brands/${brandId}/onboarding`
}

/** Paleta e fonte: dá para perguntar pela fonte sem perder o "8/8". */
export function isPaletteOption(option: SuggestOption): option is PaletteOption {
  return "colors" in option
}

export function isFontsOption(option: SuggestOption): option is FontsOption {
  return "display" in option
}

export function isWordmarkOption(option: SuggestOption): option is WordmarkOption {
  return "logoId" in option
}
