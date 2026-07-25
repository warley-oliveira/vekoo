// Dados fictícios da etapa 1. Nada aqui vem de API — o backend entra nas
// próximas etapas. Conteúdo em pt-BR, de nichos variados, sem lorem ipsum.

export type CoverLayout = "poster" | "editorial" | "split" | "badge"

export type CoverSpec = {
  layout: CoverLayout
  /** Cores da obra do usuário — as únicas saturadas da interface. */
  bg: string
  ink: string
  accent: string
  kicker?: string
  title: string
  footer?: string
}

export type CarouselFormat = "4:5" | "1:1"

export type CarouselCard = {
  title: string
  body: string
}

export type Carousel = {
  id: string
  title: string
  format: CarouselFormat
  cover: CoverSpec
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

export type AppNotification = {
  id: string
  title: string
  body: string
  at: number
  read: boolean
}

export type MockUser = {
  name: string
  email: string
  plan: string
}

export type Credits = {
  total: number
  used: number
}

export type AppState = {
  user: MockUser
  credits: Credits
  notifications: AppNotification[]
  folders: Folder[]
  carousels: Carousel[]
}

/** Cores disponíveis ao criar uma pasta — suaves de propósito (a interface é quieta). */
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
      cover: {
        layout: "poster",
        bg: "oklch(0.46 0.13 155)",
        ink: "oklch(0.97 0.02 110)",
        accent: "oklch(0.88 0.17 110)",
        kicker: "Nutrição sem neura",
        title: "5 trocas simples para comer melhor",
        footer: "@nutricarolribeiro",
      },
      cards: [
        { title: "5 trocas simples para comer melhor", body: "Sem dieta maluca: pequenas trocas que cabem na sua rotina." },
        { title: "Refrigerante → água com gás e limão", body: "Mata a vontade do gelado com bolha e corta o açúcar do dia." },
        { title: "Pão branco → pão de fermentação natural", body: "Mais saciedade e digestão mais leve no café da manhã." },
        { title: "Biscoito da tarde → castanhas e fruta", body: "Energia de verdade para não chegar morrendo de fome no jantar." },
        { title: "Fritura de todo dia → airfryer", body: "A mesma crocância com uma fração da gordura." },
        { title: "Salva esse post e começa por UMA troca", body: "Consistência vale mais que perfeição. Me conta qual você escolheu!" },
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
      cover: {
        layout: "split",
        bg: "oklch(0.42 0.14 20)",
        ink: "oklch(0.96 0.02 80)",
        accent: "oklch(0.85 0.15 85)",
        kicker: "Só até domingo",
        title: "Bazar de inverno até 60% off",
        footer: "Doma Store · Curitiba",
      },
      cards: [
        { title: "Bazar de inverno: até 60% off", body: "Casacos, tricôs e botas com os maiores descontos do ano." },
        { title: "Tricô de lã merino por R$ 129", body: "Era R$ 259. Tamanhos P ao GG, cinco cores." },
        { title: "Jaqueta corta-vento por R$ 149", body: "Impermeável, forro em fleece, perfeita pro vento de Curitiba." },
        { title: "Bota tratorada por R$ 199", body: "Couro legítimo, solado antiderrapante, do 34 ao 40." },
        { title: "Frete grátis acima de R$ 250", body: "Para todo o Brasil, enviado em até 24h." },
        { title: "Corre que é só até domingo", body: "Loja no Batel ou pelo site — link na bio." },
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
      cover: {
        layout: "poster",
        bg: "oklch(0.32 0.1 260)",
        ink: "oklch(0.97 0.005 260)",
        accent: "oklch(0.85 0.15 85)",
        kicker: "Guia do primeiro imóvel",
        title: "Financiamento: o que ninguém te explica",
        footer: "Viva Imóveis",
      },
      cards: [
        { title: "Financiamento: o que ninguém te explica", body: "Os 7 pontos que fazem diferença de dezenas de milhares de reais." },
        { title: "Entrada não é só a entrada", body: "ITBI e cartório somam 4 a 5% do valor do imóvel. Coloque na conta." },
        { title: "SAC ou Price?", body: "SAC começa com parcela maior e cai todo mês. Price é fixa — e mais cara no total." },
        { title: "Use o FGTS a seu favor", body: "Vale para entrada e para amortizar a cada 2 anos." },
        { title: "A taxa é negociável", body: "Leve a proposta de um banco para o outro. Funciona." },
        { title: "Simule antes de visitar", body: "Saber seu teto evita se apaixonar pelo imóvel errado." },
        { title: "Quer uma simulação sem compromisso?", body: "Chama a gente no direct ou no WhatsApp da bio." },
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
      cover: {
        layout: "editorial",
        bg: "oklch(0.85 0.16 95)",
        ink: "oklch(0.2 0.02 95)",
        accent: "oklch(0.4 0.14 25)",
        kicker: "Revisão ENEM · História",
        title: "Revolução Industrial em 8 cards",
        footer: "Prof. Henrique Sales",
      },
      cards: [
        { title: "Revolução Industrial em 8 cards", body: "O resumo que cai TODO ano no ENEM. Salva pra revisar depois." },
        { title: "Onde e quando", body: "Inglaterra, segunda metade do século XVIII. Carvão, ferro e capital acumulado." },
        { title: "Por que a Inglaterra?", body: "Cercamentos, mão de obra livre, colônias e uma burguesia forte." },
        { title: "1ª fase: vapor e têxtil", body: "Máquina a vapor de Watt, tear mecânico e as primeiras fábricas." },
        { title: "2ª fase: aço, eletricidade e petróleo", body: "Século XIX: ferrovias, telégrafo e produção em massa." },
        { title: "Condições de trabalho", body: "Jornadas de 14h, trabalho infantil — daí nascem ludismo e cartismo." },
        { title: "O que o ENEM cobra", body: "Relação técnica–sociedade e crítica às condições operárias, não decoreba de datas." },
        { title: "Quer o mapa mental completo?", body: "Comenta REVISA que eu mando no direct." },
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
      cover: {
        layout: "poster",
        bg: "oklch(0.2 0.01 285)",
        ink: "oklch(0.98 0 0)",
        accent: "oklch(0.88 0.2 125)",
        kicker: "Sem equipamento",
        title: "20 minutos e acabou a desculpa",
        footer: "@felipetreina",
      },
      cards: [
        { title: "20 minutos e acabou a desculpa", body: "Circuito completo em casa, sem equipamento nenhum." },
        { title: "Aquecimento — 3 min", body: "Polichinelo 40s, agachamento livre 40s, mobilidade de quadril 40s. ×2." },
        { title: "Bloco 1 — pernas e glúteo", body: "Agachamento 45s, afundo alternado 45s, descanso 30s. ×3." },
        { title: "Bloco 2 — peito e core", body: "Flexão (vale joelho) 45s, prancha 45s, descanso 30s. ×3." },
        { title: "Finalizador — 2 min", body: "Burpee no seu ritmo. Anota quantos fez pra bater semana que vem." },
        { title: "Faz 3× por semana", body: "Salva o post e me marca no story treinando!" },
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
      cover: {
        layout: "editorial",
        bg: "oklch(0.93 0.03 85)",
        ink: "oklch(0.3 0.05 55)",
        accent: "oklch(0.55 0.12 45)",
        kicker: "Métodos · nº 3",
        title: "V60 em casa: o passo a passo",
        footer: "Café do Alto",
      },
      cards: [
        { title: "V60 em casa: o passo a passo", body: "O método queridinho dos baristas, sem mistério." },
        { title: "A receita base", body: "15g de café para 250ml de água a 92–94°C. Moagem média." },
        { title: "Escalde o filtro", body: "Tira o gosto de papel e aquece o porta-filtro. Descarte a água." },
        { title: "Pré-infusão — 30s", body: "Despeje 50ml em círculos e espere o café 'florescer'." },
        { title: "Despeje em 3 etapas", body: "Círculos lentos de dentro pra fora. Total: 2min30 a 3min." },
        { title: "Prove antes de adoçar", body: "Nosso grão da semana tem notas de rapadura e laranja. Vem provar." },
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
      cover: {
        layout: "badge",
        bg: "oklch(0.72 0.09 300)",
        ink: "oklch(0.22 0.05 300)",
        accent: "oklch(0.97 0.01 300)",
        kicker: "Saúde mental",
        title: "Ansiedade: 6 sinais que o corpo dá",
        footer: "Dra. Luiza Prado · CRP 06/98432",
      },
      cards: [
        { title: "Ansiedade: 6 sinais que o corpo dá", body: "Nem sempre ela avisa em pensamento. Muitas vezes avisa no corpo." },
        { title: "1. Aperto no peito", body: "Sensação de sufoco sem causa física aparente." },
        { title: "2. Estômago embrulhado", body: "O intestino é muito sensível ao estresse — não é frescura." },
        { title: "3. Mandíbula travada", body: "Bruxismo e dor de cabeça tensional ao acordar." },
        { title: "4. Sono que não descansa", body: "Dormir 8 horas e acordar exausta é um sinal, não preguiça." },
        { title: "5. Irritação com tudo", body: "Pavio curto pode ser o corpo pedindo pausa." },
        { title: "6. Coração acelerado à toa", body: "Taquicardia em repouso merece atenção — médica e psicológica." },
        { title: "Sentiu que era sobre você?", body: "Terapia é cuidado, não luxo. Atendo online — agenda na bio." },
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
      cover: {
        layout: "badge",
        bg: "oklch(0.68 0.16 55)",
        ink: "oklch(0.99 0.01 85)",
        accent: "oklch(0.25 0.05 55)",
        kicker: "Papo de tutor",
        title: "Banho e tosa: mitos e verdades",
        footer: "AuQmia Pet · Vila Mariana",
      },
      cards: [
        { title: "Banho e tosa: mitos e verdades", body: "O que é cuidado de verdade e o que é lenda de grupo de WhatsApp." },
        { title: "\"Tosar no verão refresca\" — MITO", body: "O pelo protege do calor e do sol. Tosa máquina zero pode causar queimadura." },
        { title: "\"Banho toda semana faz mal\" — DEPENDE", body: "Com produto certo e secagem completa, semanal é tranquilo." },
        { title: "\"Tosa higiênica é frescura\" — MITO", body: "Evita infecção e desconforto. É saúde, não estética." },
        { title: "\"Perfume de pet é seguro\" — VERDADE", body: "Desde que específico veterinário. Nunca use o seu." },
        { title: "Agende pelo WhatsApp", body: "Leva e traz grátis na Vila Mariana e região." },
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
      cover: {
        layout: "editorial",
        bg: "oklch(0.27 0.01 285)",
        ink: "oklch(0.96 0.01 85)",
        accent: "oklch(0.8 0.12 85)",
        kicker: "Direito do trabalho",
        title: "Demitido sem justa causa? Seus direitos",
        footer: "Renata Campos Advocacia",
      },
      cards: [
        { title: "Demitido sem justa causa? Seus direitos", body: "O que a empresa é obrigada a pagar — e os erros mais comuns." },
        { title: "Saldo de salário e aviso prévio", body: "Dias trabalhados no mês + 30 dias de aviso (mais 3 por ano de casa)." },
        { title: "Multa de 40% do FGTS", body: "Sobre TODO o saldo depositado, não só o do último emprego." },
        { title: "Férias e 13º proporcionais", body: "Inclusive férias vencidas com 1/3, se houver." },
        { title: "Seguro-desemprego", body: "De 3 a 5 parcelas, conforme o tempo trabalhado." },
        { title: "Prazo para pagar: 10 dias", body: "Passou disso, a empresa deve multa de um salário seu." },
        { title: "Recebeu errado?", body: "Você tem até 2 anos para reclamar. Avaliação gratuita do seu caso." },
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
      cover: {
        layout: "split",
        bg: "oklch(0.87 0.06 10)",
        ink: "oklch(0.32 0.08 30)",
        accent: "oklch(0.5 0.18 15)",
        kicker: "Confeitaria lucrativa",
        title: "Quanto cobrar pelo seu bolo",
        footer: "Doce da Bia · encomendas",
      },
      cards: [
        { title: "Quanto cobrar pelo seu bolo", body: "Pare de cobrar 'no chute' — a conta que salva sua margem." },
        { title: "Custo dos ingredientes", body: "Pese TUDO, até a pitada de sal. Planilha simples resolve." },
        { title: "Seu tempo vale dinheiro", body: "Defina sua hora (ex.: R$ 25) e multiplique pelas horas de produção." },
        { title: "Gás, luz e embalagem", body: "Some 10 a 15% do custo como despesa indireta." },
        { title: "A fórmula", body: "(Ingredientes + tempo + despesas) × 2 = seu preço mínimo." },
        { title: "\"Mas o mercado cobra menos\"", body: "Bolo caseiro de verdade não compete com bolo de esquina. Posicione-se." },
        { title: "Baixe a planilha pronta", body: "Manda PREÇO no direct que eu envio de graça." },
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
      cover: {
        layout: "poster",
        bg: "oklch(0.88 0.2 125)",
        ink: "oklch(0.2 0.02 145)",
        accent: "oklch(0.2 0.02 145)",
        kicker: "Copy pra feed",
        title: "7 ganchos que seguram o dedo",
        footer: "@almeidadoconteudo",
      },
      cards: [
        { title: "7 ganchos que seguram o dedo", body: "O primeiro card decide se o resto vai ser lido. Usa esses." },
        { title: "1. O erro", body: "\"O erro que 9 em cada 10 lojas cometem no Instagram.\"" },
        { title: "2. O contraste", body: "\"Postei todo dia por 30 dias. Vendi menos que no mês anterior.\"" },
        { title: "3. A pergunta proibida", body: "\"Por que ninguém te contou isso sobre tráfego pago?\"" },
        { title: "4. O número específico", body: "\"R$ 4.372 em vendas com um carrossel. A estrutura:\"" },
        { title: "5. A confissão", body: "\"Eu cobrava barato porque tinha medo. Isso mudou quando...\"" },
        { title: "6. O antes e depois", body: "Mostre o resultado no card 1 e o caminho nos seguintes." },
        { title: "7. A lista incompleta", body: "\"5 ferramentas gratuitas — a 4ª quase ninguém conhece.\"" },
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
      cover: {
        layout: "badge",
        bg: "oklch(0.48 0.09 200)",
        ink: "oklch(0.97 0.01 200)",
        accent: "oklch(0.9 0.06 90)",
        kicker: "Fisio no dia a dia",
        title: "Home office sem dor nas costas",
        footer: "Movimente Fisioterapia",
      },
      cards: [
        { title: "Home office sem dor nas costas", body: "Pequenos ajustes no posto de trabalho que o seu corpo agradece." },
        { title: "Tela na altura dos olhos", body: "Suporte ou pilha de livros: o topo do monitor na linha do olhar." },
        { title: "Pés apoiados, sempre", body: "Se não alcançam o chão, use um apoio. Joelho a 90 graus." },
        { title: "O lombar precisa de apoio", body: "Almofada na curvatura da lombar já muda o seu dia." },
        { title: "Levante a cada 50 minutos", body: "Timer no celular. Dois minutos andando valem mais que alongar 20." },
        { title: "Dor que passa de 2 semanas", body: "Não é normal. Avaliação presencial ou por vídeo — link na bio." },
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
      cover: {
        layout: "split",
        bg: "oklch(0.6 0.15 350)",
        ink: "oklch(0.98 0.01 350)",
        accent: "oklch(0.9 0.1 90)",
        kicker: "Rascunho",
        title: "Dia das Mães com 30% off",
        footer: "Doma Store",
      },
      cards: [
        { title: "Dia das Mães com 30% off", body: "Rascunho antigo da campanha de maio." },
        { title: "Presentes até R$ 99", body: "Lenços, nécessaires e canecas personalizadas." },
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
      cover: {
        layout: "editorial",
        bg: "oklch(0.9 0.02 90)",
        ink: "oklch(0.35 0.02 90)",
        accent: "oklch(0.6 0.1 55)",
        kicker: "Notas",
        title: "Ideias soltas de conteúdo",
        footer: "rascunho",
      },
      cards: [
        { title: "Ideias soltas de conteúdo", body: "Bastidores da produção, antes e depois, resposta a comentários." },
      ],
    },
  ]

  return {
    user: {
      name: "Marina Duarte",
      email: "marina.duarte@exemplo.com.br",
      plan: "Plano Grátis",
    },
    credits: { total: 50, used: 14 },
    notifications: [
      {
        id: "not-modelos",
        title: "Modelos novos na área",
        body: "Chegaram 6 modelos de carrossel para lojas e serviços locais.",
        at: now - 5 * HOUR,
        read: false,
      },
      {
        id: "not-pastas",
        title: "Dica: organize com pastas",
        body: "Arraste um carrossel para uma pasta no menu lateral para movê-lo.",
        at: now - 2 * DAY,
        read: false,
      },
      {
        id: "not-boasvindas",
        title: "Boas-vindas ao Vekoo!",
        body: "Seus 50 créditos grátis já estão na conta. Bora criar o primeiro carrossel?",
        at: now - 6 * DAY,
        read: true,
      },
    ],
    folders: [],
    carousels,
  }
}
