// Dados fictícios. Nada aqui vem de API — o backend entra nas próximas
// etapas. Conteúdo em pt-BR, de nichos variados, sem lorem ipsum.
//
// O conteúdo dos carrosséis é **obra do usuário fictício**, não interface:
// fica em pt-BR mesmo em outro idioma (ninguém traduz o post do cliente).
// O que é interface — as notificações — guarda só a chave de tradução.
//
// Cada carrossel agora é um documento de blocos (ver lib/doc.ts). O card 1
// substitui a antiga "capa": é ele que a biblioteca renderiza, e as quatro
// personalidades visuais das capas antigas viram receitas de card 1 aqui
// (poster, editorial, split e badge).

import type {
  Block,
  BlockAlign,
  CardLayout,
  CarouselCard,
  CarouselFormat,
  CarouselTheme,
  ImageSpec,
  InkColor,
  TextRole,
  VerticalAlign,
} from "@/lib/doc"

export type {
  CarouselCard,
  CarouselFormat,
  CarouselTheme,
} from "@/lib/doc"

export type Carousel = {
  id: string
  title: string
  format: CarouselFormat
  theme: CarouselTheme
  cards: CarouselCard[]
  folderId: string | null
  favorite: boolean
  editedAt: number
  trashedAt: number | null
}

export type Folder = {
  id: string
  name: string
  color: string
}

/** Chave de tradução da notificação (`notifications.<key>.title|body`). */
export type NotificationKey = "templates" | "folders" | "welcome"

export type AppNotification = {
  id: string
  key: NotificationKey
  at: number
  read: boolean
}

export type Credits = {
  total: number
  used: number
}

export type AppState = {
  credits: Credits
  notifications: AppNotification[]
  folders: Folder[]
  carousels: Carousel[]
}

/**
 * Cores disponíveis ao criar uma pasta — suaves de propósito (a interface é
 * quieta). `id` é também a chave de tradução em `folders.colors.<id>`.
 */
export const FOLDER_COLORS = [
  { id: "cinza", value: "oklch(0.65 0.01 285)" },
  { id: "violeta", value: "oklch(0.62 0.12 292)" },
  { id: "azul", value: "oklch(0.62 0.1 245)" },
  { id: "verde", value: "oklch(0.62 0.1 155)" },
  { id: "amarelo", value: "oklch(0.75 0.12 90)" },
  { id: "vermelho", value: "oklch(0.62 0.12 25)" },
] as const

const HOUR = 3_600_000
const DAY = 24 * HOUR

// ---------------------------------------------------------------------------
// Fábrica de blocos: ids determinísticos (`<cardId>-b1`, `-b2`…) para a arte
// ser estável entre recargas e as animações de layout terem chaves fixas.

type BlockFactory = {
  title: (text: string, align?: BlockAlign) => Block
  subtitle: (text: string, align?: BlockAlign) => Block
  body: (text: string, align?: BlockAlign, color?: InkColor) => Block
  caption: (text: string, color?: InkColor, align?: BlockAlign) => Block
  text: (role: TextRole, text: string, align: BlockAlign, color: InkColor) => Block
  list: (style: "bullet" | "number" | "check", items: string[]) => Block
  stat: (value: string, label: string, align?: BlockAlign) => Block
  quote: (text: string, attribution?: string) => Block
  divider: (style?: "line" | "dots" | "accent") => Block
  table: (rows: string[][]) => Block
  button: (label: string, variant?: "solid" | "outline", align?: BlockAlign) => Block
}

function blockFactory(cardId: string): BlockFactory {
  let n = 0
  const id = () => `${cardId}-b${++n}`
  const text = (
    role: TextRole,
    value: string,
    align: BlockAlign,
    color: InkColor
  ): Block => ({ id: id(), type: "text", role, text: value, align, color })

  return {
    text,
    title: (t, align = "start") => text("title", t, align, "ink"),
    subtitle: (t, align = "start") => text("subtitle", t, align, "ink"),
    body: (t, align = "start", color = "muted") => text("body", t, align, color),
    caption: (t, color = "muted", align = "start") =>
      text("caption", t, align, color),
    list: (style, items) => ({ id: id(), type: "list", style, items, color: "ink" }),
    stat: (value, label, align = "start") => ({
      id: id(),
      type: "stat",
      value,
      label,
      align,
      color: "accent",
    }),
    quote: (t, attribution) => ({
      id: id(),
      type: "quote",
      text: t,
      attribution,
      color: "ink",
    }),
    divider: (style = "line") => ({ id: id(), type: "divider", style }),
    table: (rows) => ({ id: id(), type: "table", rows }),
    button: (label, variant = "solid", align = "start") => ({
      id: id(),
      type: "button",
      label,
      variant,
      align,
    }),
  }
}

type CardOpts = {
  layout?: CardLayout
  align?: VerticalAlign
  image?: ImageSpec
  bg?: string
}

function card(
  cardId: string,
  opts: CardOpts,
  build: (b: BlockFactory) => Block[]
): CarouselCard {
  const image = opts.image ?? null
  return {
    id: cardId,
    layout: opts.layout ?? (image ? "image-top" : "no-image"),
    bg: opts.bg ?? null,
    align: opts.align ?? "top",
    image,
    blocks: build(blockFactory(cardId)),
  }
}

/** Card comum de conteúdo: título + corpo. */
function simpleCard(cardId: string, title: string, body: string): CarouselCard {
  return card(cardId, {}, (b) => [b.title(title), b.body(body)])
}

type CoverParts = { kicker?: string; title: string; footer?: string }

/** Personalidade "poster": tudo ancorado embaixo, barra de acento no topo. */
function posterCover(
  cardId: string,
  parts: CoverParts,
  image?: ImageSpec
): CarouselCard {
  return card(
    cardId,
    { align: "bottom", image, layout: image ? "image-full" : "no-image" },
    (b) => [
      b.divider("accent"),
      ...(parts.kicker ? [b.caption(parts.kicker, "ink")] : []),
      b.title(parts.title),
      ...(parts.footer ? [b.caption(parts.footer, "muted")] : []),
    ]
  )
}

/** Personalidade "editorial": filetes acima e abaixo, título ao centro. */
function editorialCover(cardId: string, parts: CoverParts): CarouselCard {
  return card(cardId, { align: "center" }, (b) => [
    ...(parts.kicker ? [b.caption(parts.kicker, "ink")] : []),
    b.divider("line"),
    b.title(parts.title),
    b.divider("line"),
    ...(parts.footer ? [b.caption(parts.footer, "muted")] : []),
  ])
}

/** Personalidade "split": faixa de imagem no topo, kicker em acento. */
function splitCover(
  cardId: string,
  parts: CoverParts,
  seed: number
): CarouselCard {
  return card(
    cardId,
    {
      layout: "image-top",
      image: { style: "beams", seed, tint: "accent", position: "center" },
    },
    (b) => [
      ...(parts.kicker ? [b.caption(parts.kicker, "accent")] : []),
      b.title(parts.title),
      ...(parts.footer ? [b.caption(parts.footer, "muted")] : []),
    ]
  )
}

/** Personalidade "badge": selo no topo, tudo centralizado. */
function badgeCover(cardId: string, parts: CoverParts): CarouselCard {
  return card(cardId, { align: "center" }, (b) => [
    ...(parts.kicker ? [b.button(parts.kicker, "outline", "center")] : []),
    b.title(parts.title, "center"),
    b.divider("accent"),
    ...(parts.footer ? [b.caption(parts.footer, "muted", "center")] : []),
  ])
}

// ---------------------------------------------------------------------------

export function buildSeed(now: number): AppState {
  const carousels: Carousel[] = [
    {
      id: "car-nutricao",
      title: "5 trocas simples para comer melhor",
      format: "4:5",
      favorite: true,
      folderId: null,
      editedAt: now - 2 * HOUR,
      trashedAt: null,
      theme: {
        bg: "oklch(0.46 0.13 155)",
        surface: "oklch(0.4 0.12 155)",
        ink: "oklch(0.97 0.02 110)",
        accent: "oklch(0.88 0.17 110)",
        accentInk: "oklch(0.3 0.09 155)",
      },
      cards: [
        posterCover("card-nutricao-1", {
          kicker: "Nutrição sem neura",
          title: "5 trocas simples para comer melhor",
          footer: "@nutricarolribeiro",
        }),
        card(
          "card-nutricao-2",
          {
            layout: "image-right",
            align: "center",
            image: { style: "blob", seed: 21, tint: "accent", position: "center" },
          },
          (b) => [
            b.title("Refrigerante → água com gás e limão"),
            b.body("Mata a vontade do gelado com bolha e corta o açúcar do dia."),
          ]
        ),
        simpleCard(
          "card-nutricao-3",
          "Pão branco → pão de fermentação natural",
          "Mais saciedade e digestão mais leve no café da manhã."
        ),
        card("card-nutricao-4", {}, (b) => [
          b.title("Biscoito da tarde → castanhas e fruta"),
          b.list("check", [
            "Castanhas: um punhado fechado",
            "Fruta da estação, madura",
            "Água antes — sede engana fome",
          ]),
          b.body("Energia de verdade para não chegar morrendo de fome no jantar."),
        ]),
        card("card-nutricao-5", { align: "center" }, (b) => [
          b.title("Fritura de todo dia → airfryer"),
          b.quote(
            "A mesma crocância, uma fração da gordura — e sem cheiro de óleo pela casa.",
            "Carol Ribeiro · nutricionista"
          ),
        ]),
        card("card-nutricao-6", { align: "center" }, (b) => [
          b.title("Salva esse post e começa por UMA troca", "center"),
          b.body(
            "Consistência vale mais que perfeição. Me conta qual você escolheu!",
            "center"
          ),
          b.button("Salvar este post", "solid", "center"),
        ]),
      ],
    },
    {
      id: "car-bazar",
      title: "Bazar de inverno — até 60% off",
      format: "4:5",
      favorite: false,
      folderId: null,
      editedAt: now - 26 * HOUR,
      trashedAt: null,
      theme: {
        bg: "oklch(0.42 0.14 20)",
        surface: "oklch(0.37 0.13 20)",
        ink: "oklch(0.96 0.02 80)",
        accent: "oklch(0.85 0.15 85)",
        accentInk: "oklch(0.35 0.12 20)",
      },
      cards: [
        splitCover(
          "card-bazar-1",
          {
            kicker: "Só até domingo",
            title: "Bazar de inverno até 60% off",
            footer: "Doma Store · Curitiba",
          },
          5
        ),
        card("card-bazar-2", { align: "center" }, (b) => [
          b.caption("Tricô de lã merino", "accent"),
          b.stat("R$ 129", "era R$ 259 — do P ao GG, cinco cores"),
        ]),
        card(
          "card-bazar-3",
          {
            layout: "image-left",
            align: "center",
            image: { style: "waves", seed: 11, tint: "accent", position: "center" },
          },
          (b) => [
            b.title("Jaqueta corta-vento por R$ 149"),
            b.body("Impermeável, forro em fleece, perfeita pro vento de Curitiba."),
          ]
        ),
        card("card-bazar-4", {}, (b) => [
          b.title("O mapa do bazar"),
          b.table([
            ["Peça", "Antes", "Agora"],
            ["Tricô merino", "R$ 259", "R$ 129"],
            ["Corta-vento", "R$ 279", "R$ 149"],
            ["Bota tratorada", "R$ 349", "R$ 199"],
          ]),
          b.caption("Do 34 ao 40 · do P ao GG", "muted"),
        ]),
        card("card-bazar-5", { align: "center" }, (b) => [
          b.title("Frete grátis acima de R$ 250", "center"),
          b.divider("dots"),
          b.body("Para todo o Brasil, enviado em até 24h.", "center"),
        ]),
        card("card-bazar-6", { align: "center" }, (b) => [
          b.title("Corre que é só até domingo", "center"),
          b.body("Loja no Batel ou pelo site — link na bio.", "center"),
          b.button("Ver as ofertas", "solid", "center"),
        ]),
      ],
    },
    {
      id: "car-financiamento",
      title: "Financiamento: o que ninguém te explica",
      format: "4:5",
      favorite: false,
      folderId: null,
      editedAt: now - 3 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.32 0.1 260)",
        surface: "oklch(0.28 0.09 260)",
        ink: "oklch(0.97 0.005 260)",
        accent: "oklch(0.85 0.15 85)",
        accentInk: "oklch(0.28 0.09 260)",
      },
      cards: [
        posterCover("card-financiamento-1", {
          kicker: "Guia do primeiro imóvel",
          title: "Financiamento: o que ninguém te explica",
          footer: "Viva Imóveis",
        }),
        simpleCard(
          "card-financiamento-2",
          "Entrada não é só a entrada",
          "ITBI e cartório somam 4 a 5% do valor do imóvel. Coloque na conta."
        ),
        simpleCard(
          "card-financiamento-3",
          "SAC ou Price?",
          "SAC começa com parcela maior e cai todo mês. Price é fixa — e mais cara no total."
        ),
        simpleCard(
          "card-financiamento-4",
          "Use o FGTS a seu favor",
          "Vale para entrada e para amortizar a cada 2 anos."
        ),
        simpleCard(
          "card-financiamento-5",
          "A taxa é negociável",
          "Leve a proposta de um banco para o outro. Funciona."
        ),
        simpleCard(
          "card-financiamento-6",
          "Simule antes de visitar",
          "Saber seu teto evita se apaixonar pelo imóvel errado."
        ),
        card("card-financiamento-7", { align: "center" }, (b) => [
          b.title("Quer uma simulação sem compromisso?", "center"),
          b.body("Chama a gente no direct ou no WhatsApp da bio.", "center"),
          b.button("Pedir simulação", "solid", "center"),
        ]),
      ],
    },
    {
      id: "car-enem",
      title: "Revolução Industrial em 8 cards",
      format: "4:5",
      favorite: false,
      folderId: null,
      editedAt: now - 4 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.85 0.16 95)",
        surface: "oklch(0.8 0.15 95)",
        ink: "oklch(0.2 0.02 95)",
        accent: "oklch(0.4 0.14 25)",
        accentInk: "oklch(0.85 0.16 95)",
      },
      cards: [
        editorialCover("card-enem-1", {
          kicker: "Revisão ENEM · História",
          title: "Revolução Industrial em 8 cards",
          footer: "Prof. Henrique Sales",
        }),
        simpleCard(
          "card-enem-2",
          "Onde e quando",
          "Inglaterra, segunda metade do século XVIII. Carvão, ferro e capital acumulado."
        ),
        simpleCard(
          "card-enem-3",
          "Por que a Inglaterra?",
          "Cercamentos, mão de obra livre, colônias e uma burguesia forte."
        ),
        simpleCard(
          "card-enem-4",
          "1ª fase: vapor e têxtil",
          "Máquina a vapor de Watt, tear mecânico e as primeiras fábricas."
        ),
        simpleCard(
          "card-enem-5",
          "2ª fase: aço, eletricidade e petróleo",
          "Século XIX: ferrovias, telégrafo e produção em massa."
        ),
        simpleCard(
          "card-enem-6",
          "Condições de trabalho",
          "Jornadas de 14h, trabalho infantil — daí nascem ludismo e cartismo."
        ),
        simpleCard(
          "card-enem-7",
          "O que o ENEM cobra",
          "Relação técnica–sociedade e crítica às condições operárias, não decoreba de datas."
        ),
        card("card-enem-8", { align: "center" }, (b) => [
          b.title("Quer o mapa mental completo?", "center"),
          b.body("Comenta REVISA que eu mando no direct.", "center"),
          b.button("Comentar REVISA", "outline", "center"),
        ]),
      ],
    },
    {
      id: "car-treino",
      title: "Treino de 20 minutos sem desculpa",
      format: "4:5",
      favorite: false,
      folderId: null,
      editedAt: now - 6 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.2 0.01 285)",
        surface: "oklch(0.26 0.015 285)",
        ink: "oklch(0.98 0 0)",
        accent: "oklch(0.88 0.2 125)",
        accentInk: "oklch(0.2 0.01 285)",
      },
      cards: [
        posterCover(
          "card-treino-1",
          {
            kicker: "Sem equipamento",
            title: "20 minutos e acabou a desculpa",
            footer: "@felipetreina",
          },
          { style: "beams", seed: 7, tint: "accent", position: "top" }
        ),
        card("card-treino-2", {}, (b) => [
          b.title("Aquecimento — 3 min"),
          b.list("number", [
            "Polichinelo — 40s",
            "Agachamento livre — 40s",
            "Mobilidade de quadril — 40s",
          ]),
          b.caption("Repete o circuito 2×", "accent"),
        ]),
        card("card-treino-3", {}, (b) => [
          b.title("Bloco 1 — pernas e glúteo"),
          b.list("number", [
            "Agachamento — 45s",
            "Afundo alternado — 45s",
            "Descanso — 30s",
          ]),
          b.caption("3 rodadas", "accent"),
        ]),
        card("card-treino-4", {}, (b) => [
          b.title("Bloco 2 — peito e core"),
          b.list("number", [
            "Flexão (vale joelho) — 45s",
            "Prancha — 45s",
            "Descanso — 30s",
          ]),
          b.caption("3 rodadas", "accent"),
        ]),
        card("card-treino-5", { align: "center" }, (b) => [
          b.caption("Finalizador", "accent"),
          b.stat("2 min", "burpee no seu ritmo — anota quantos fez"),
          b.body("Semana que vem a meta é bater o seu número."),
        ]),
        card("card-treino-6", { align: "center" }, (b) => [
          b.title("Faz 3× por semana", "center"),
          b.body("Salva o post e me marca no story treinando!", "center"),
          b.button("Salvar o treino", "solid", "center"),
        ]),
      ],
    },
    {
      id: "car-v60",
      title: "V60 em casa: o passo a passo",
      format: "1:1",
      favorite: false,
      folderId: null,
      editedAt: now - 8 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.93 0.03 85)",
        surface: "oklch(0.89 0.04 85)",
        ink: "oklch(0.3 0.05 55)",
        accent: "oklch(0.55 0.12 45)",
        accentInk: "oklch(0.96 0.02 85)",
      },
      cards: [
        editorialCover("card-v60-1", {
          kicker: "Métodos · nº 3",
          title: "V60 em casa: o passo a passo",
          footer: "Café do Alto",
        }),
        card("card-v60-2", { align: "center" }, (b) => [
          b.caption("A receita base", "accent"),
          b.stat("15 g", "de café para 250 ml de água a 92–94 °C"),
          b.body("Moagem média, como açúcar cristal."),
        ]),
        simpleCard(
          "card-v60-3",
          "Escalde o filtro",
          "Tira o gosto de papel e aquece o porta-filtro. Descarte a água."
        ),
        simpleCard(
          "card-v60-4",
          "Pré-infusão — 30s",
          "Despeje 50ml em círculos e espere o café 'florescer'."
        ),
        simpleCard(
          "card-v60-5",
          "Despeje em 3 etapas",
          "Círculos lentos de dentro pra fora. Total: 2min30 a 3min."
        ),
        card(
          "card-v60-6",
          {
            layout: "image-top",
            image: { style: "dots", seed: 33, tint: "accent", position: "center" },
          },
          (b) => [
            b.title("Prove antes de adoçar"),
            b.body("Nosso grão da semana tem notas de rapadura e laranja. Vem provar."),
          ]
        ),
      ],
    },
    {
      id: "car-ansiedade",
      title: "Ansiedade: 6 sinais que o corpo dá",
      format: "4:5",
      favorite: true,
      folderId: null,
      editedAt: now - 9 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.72 0.09 300)",
        surface: "oklch(0.68 0.09 300)",
        ink: "oklch(0.22 0.05 300)",
        accent: "oklch(0.97 0.01 300)",
        accentInk: "oklch(0.22 0.05 300)",
      },
      cards: [
        badgeCover("card-ansiedade-1", {
          kicker: "Saúde mental",
          title: "Ansiedade: 6 sinais que o corpo dá",
          footer: "Dra. Luiza Prado · CRP 06/98432",
        }),
        simpleCard(
          "card-ansiedade-2",
          "1. Aperto no peito",
          "Sensação de sufoco sem causa física aparente."
        ),
        simpleCard(
          "card-ansiedade-3",
          "2. Estômago embrulhado",
          "O intestino é muito sensível ao estresse — não é frescura."
        ),
        simpleCard(
          "card-ansiedade-4",
          "3. Mandíbula travada",
          "Bruxismo e dor de cabeça tensional ao acordar."
        ),
        simpleCard(
          "card-ansiedade-5",
          "4. Sono que não descansa",
          "Dormir 8 horas e acordar exausta é um sinal, não preguiça."
        ),
        simpleCard(
          "card-ansiedade-6",
          "5. Irritação com tudo",
          "Pavio curto pode ser o corpo pedindo pausa."
        ),
        simpleCard(
          "card-ansiedade-7",
          "6. Coração acelerado à toa",
          "Taquicardia em repouso merece atenção — médica e psicológica."
        ),
        card("card-ansiedade-8", { align: "center" }, (b) => [
          b.title("Sentiu que era sobre você?", "center"),
          b.body("Terapia é cuidado, não luxo. Atendo online — agenda na bio.", "center"),
          b.button("Agendar uma conversa", "solid", "center"),
        ]),
      ],
    },
    {
      id: "car-tosa",
      title: "Banho e tosa: mitos e verdades",
      format: "4:5",
      favorite: false,
      folderId: null,
      editedAt: now - 12 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.68 0.16 55)",
        surface: "oklch(0.63 0.15 55)",
        ink: "oklch(0.99 0.01 85)",
        accent: "oklch(0.25 0.05 55)",
        accentInk: "oklch(0.99 0.01 85)",
      },
      cards: [
        badgeCover("card-tosa-1", {
          kicker: "Papo de tutor",
          title: "Banho e tosa: mitos e verdades",
          footer: "AuQmia Pet · Vila Mariana",
        }),
        simpleCard(
          "card-tosa-2",
          "\"Tosar no verão refresca\" — MITO",
          "O pelo protege do calor e do sol. Tosa máquina zero pode causar queimadura."
        ),
        simpleCard(
          "card-tosa-3",
          "\"Banho toda semana faz mal\" — DEPENDE",
          "Com produto certo e secagem completa, semanal é tranquilo."
        ),
        simpleCard(
          "card-tosa-4",
          "\"Tosa higiênica é frescura\" — MITO",
          "Evita infecção e desconforto. É saúde, não estética."
        ),
        simpleCard(
          "card-tosa-5",
          "\"Perfume de pet é seguro\" — VERDADE",
          "Desde que específico veterinário. Nunca use o seu."
        ),
        card("card-tosa-6", { align: "center" }, (b) => [
          b.title("Agende pelo WhatsApp", "center"),
          b.body("Leva e traz grátis na Vila Mariana e região.", "center"),
          b.button("Chamar no WhatsApp", "solid", "center"),
        ]),
      ],
    },
    {
      id: "car-justa-causa",
      title: "Demitido sem justa causa? Seus direitos",
      format: "4:5",
      favorite: true,
      folderId: null,
      editedAt: now - 15 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.27 0.01 285)",
        surface: "oklch(0.32 0.012 285)",
        ink: "oklch(0.96 0.01 85)",
        accent: "oklch(0.8 0.12 85)",
        accentInk: "oklch(0.27 0.01 285)",
      },
      cards: [
        editorialCover("card-justa-causa-1", {
          kicker: "Direito do trabalho",
          title: "Demitido sem justa causa? Seus direitos",
          footer: "Renata Campos Advocacia",
        }),
        simpleCard(
          "card-justa-causa-2",
          "Saldo de salário e aviso prévio",
          "Dias trabalhados no mês + 30 dias de aviso (mais 3 por ano de casa)."
        ),
        simpleCard(
          "card-justa-causa-3",
          "Multa de 40% do FGTS",
          "Sobre TODO o saldo depositado, não só o do último emprego."
        ),
        simpleCard(
          "card-justa-causa-4",
          "Férias e 13º proporcionais",
          "Inclusive férias vencidas com 1/3, se houver."
        ),
        simpleCard(
          "card-justa-causa-5",
          "Seguro-desemprego",
          "De 3 a 5 parcelas, conforme o tempo trabalhado."
        ),
        simpleCard(
          "card-justa-causa-6",
          "Prazo para pagar: 10 dias",
          "Passou disso, a empresa deve multa de um salário seu."
        ),
        card("card-justa-causa-7", { align: "center" }, (b) => [
          b.title("Recebeu errado?", "center"),
          b.body("Você tem até 2 anos para reclamar.", "center"),
          b.button("Avaliação gratuita do caso", "solid", "center"),
        ]),
      ],
    },
    {
      id: "car-bolos",
      title: "Quanto cobrar por um bolo caseiro",
      format: "4:5",
      favorite: false,
      folderId: null,
      editedAt: now - 18 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.87 0.06 10)",
        surface: "oklch(0.83 0.06 10)",
        ink: "oklch(0.32 0.08 30)",
        accent: "oklch(0.5 0.18 15)",
        accentInk: "oklch(0.95 0.03 10)",
      },
      cards: [
        splitCover(
          "card-bolos-1",
          {
            kicker: "Confeitaria lucrativa",
            title: "Quanto cobrar pelo seu bolo",
            footer: "Doce da Bia · encomendas",
          },
          13
        ),
        simpleCard(
          "card-bolos-2",
          "Custo dos ingredientes",
          "Pese TUDO, até a pitada de sal. Planilha simples resolve."
        ),
        simpleCard(
          "card-bolos-3",
          "Seu tempo vale dinheiro",
          "Defina sua hora (ex.: R$ 25) e multiplique pelas horas de produção."
        ),
        simpleCard(
          "card-bolos-4",
          "Gás, luz e embalagem",
          "Some 10 a 15% do custo como despesa indireta."
        ),
        card("card-bolos-5", { align: "center" }, (b) => [
          b.caption("A fórmula", "accent"),
          b.stat("× 2", "ingredientes + tempo + despesas = seu preço mínimo"),
        ]),
        card("card-bolos-6", { align: "center" }, (b) => [
          b.title("\"Mas o mercado cobra menos\"", "center"),
          b.quote(
            "Bolo caseiro de verdade não compete com bolo de esquina. Posicione-se."
          ),
        ]),
        card("card-bolos-7", { align: "center" }, (b) => [
          b.title("Baixe a planilha pronta", "center"),
          b.body("Manda PREÇO no direct que eu envio de graça.", "center"),
          b.button("Quero a planilha", "solid", "center"),
        ]),
      ],
    },
    {
      id: "car-ganchos",
      title: "7 ganchos que seguram o dedo",
      format: "1:1",
      favorite: false,
      folderId: null,
      editedAt: now - 22 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.88 0.2 125)",
        surface: "oklch(0.84 0.19 125)",
        ink: "oklch(0.2 0.02 145)",
        accent: "oklch(0.2 0.02 145)",
        accentInk: "oklch(0.88 0.2 125)",
      },
      cards: [
        posterCover("card-ganchos-1", {
          kicker: "Copy pra feed",
          title: "7 ganchos que seguram o dedo",
          footer: "@almeidadoconteudo",
        }),
        card("card-ganchos-2", { align: "center" }, (b) => [
          b.title("1. O erro"),
          b.quote("O erro que 9 em cada 10 lojas cometem no Instagram."),
        ]),
        card("card-ganchos-3", { align: "center" }, (b) => [
          b.title("2. O contraste"),
          b.quote("Postei todo dia por 30 dias. Vendi menos que no mês anterior."),
        ]),
        card("card-ganchos-4", { align: "center" }, (b) => [
          b.title("3. A pergunta proibida"),
          b.quote("Por que ninguém te contou isso sobre tráfego pago?"),
        ]),
        card("card-ganchos-5", { align: "center" }, (b) => [
          b.title("4. O número específico"),
          b.quote("R$ 4.372 em vendas com um carrossel. A estrutura:"),
        ]),
        card("card-ganchos-6", { align: "center" }, (b) => [
          b.title("5. A confissão"),
          b.quote("Eu cobrava barato porque tinha medo. Isso mudou quando..."),
        ]),
        card("card-ganchos-7", { align: "center" }, (b) => [
          b.title("6. O antes e depois"),
          b.body("Mostre o resultado no card 1 e o caminho nos seguintes."),
        ]),
        card("card-ganchos-8", { align: "center" }, (b) => [
          b.title("7. A lista incompleta"),
          b.quote("5 ferramentas gratuitas — a 4ª quase ninguém conhece."),
        ]),
      ],
    },
    {
      id: "car-homeoffice",
      title: "Home office sem dor nas costas",
      format: "4:5",
      favorite: false,
      folderId: null,
      editedAt: now - 30 * DAY,
      trashedAt: null,
      theme: {
        bg: "oklch(0.48 0.09 200)",
        surface: "oklch(0.43 0.08 200)",
        ink: "oklch(0.97 0.01 200)",
        accent: "oklch(0.9 0.06 90)",
        accentInk: "oklch(0.35 0.07 200)",
      },
      cards: [
        badgeCover("card-homeoffice-1", {
          kicker: "Fisio no dia a dia",
          title: "Home office sem dor nas costas",
          footer: "Movimente Fisioterapia",
        }),
        simpleCard(
          "card-homeoffice-2",
          "Tela na altura dos olhos",
          "Suporte ou pilha de livros: o topo do monitor na linha do olhar."
        ),
        simpleCard(
          "card-homeoffice-3",
          "Pés apoiados, sempre",
          "Se não alcançam o chão, use um apoio. Joelho a 90 graus."
        ),
        simpleCard(
          "card-homeoffice-4",
          "O lombar precisa de apoio",
          "Almofada na curvatura da lombar já muda o seu dia."
        ),
        simpleCard(
          "card-homeoffice-5",
          "Levante a cada 50 minutos",
          "Timer no celular. Dois minutos andando valem mais que alongar 20."
        ),
        card("card-homeoffice-6", { align: "center" }, (b) => [
          b.title("Dor que passa de 2 semanas", "center"),
          b.body("Não é normal. Avaliação presencial ou por vídeo — link na bio.", "center"),
          b.button("Agendar avaliação", "outline", "center"),
        ]),
      ],
    },
    {
      id: "car-teste-lixeira",
      title: "Teste — promoção dia das mães",
      format: "4:5",
      favorite: false,
      folderId: null,
      editedAt: now - 40 * DAY,
      trashedAt: now - 9 * DAY,
      theme: {
        bg: "oklch(0.6 0.15 350)",
        surface: "oklch(0.55 0.14 350)",
        ink: "oklch(0.98 0.01 350)",
        accent: "oklch(0.9 0.1 90)",
        accentInk: "oklch(0.45 0.13 350)",
      },
      cards: [
        splitCover(
          "card-teste-lixeira-1",
          {
            kicker: "Rascunho",
            title: "Dia das Mães com 30% off",
            footer: "Doma Store",
          },
          17
        ),
        simpleCard(
          "card-teste-lixeira-2",
          "Presentes até R$ 99",
          "Lenços, nécessaires e canecas personalizadas."
        ),
      ],
    },
    {
      id: "car-velho-lixeira",
      title: "Ideias soltas (apagar depois)",
      format: "1:1",
      favorite: false,
      folderId: null,
      editedAt: now - 60 * DAY,
      trashedAt: now - 25 * DAY,
      theme: {
        bg: "oklch(0.9 0.02 90)",
        surface: "oklch(0.86 0.025 90)",
        ink: "oklch(0.35 0.02 90)",
        accent: "oklch(0.6 0.1 55)",
        accentInk: "oklch(0.97 0.01 90)",
      },
      cards: [
        editorialCover("card-velho-lixeira-1", {
          kicker: "Notas",
          title: "Ideias soltas de conteúdo",
          footer: "rascunho",
        }),
      ],
    },
  ]

  return {
    credits: { total: 50, used: 14 },
    notifications: [
      { id: "not-templates", key: "templates", at: now - 5 * HOUR, read: false },
      { id: "not-folders", key: "folders", at: now - 2 * DAY, read: false },
      { id: "not-welcome", key: "welcome", at: now - 6 * DAY, read: true },
    ],
    folders: [],
    carousels,
  }
}
