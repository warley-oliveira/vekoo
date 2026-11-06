// As cores dos gráficos desta área, sempre pelo tema. O produto é quase sem cor, então a forma é a de
// ênfase da skill de dataviz: um ponto em destaque, o resto em cinza. Conferidos com
// `validate_palette.js` sobre o branco do cartão: `--primary` (#7132e0) passa em todas as checagens, com
// 6,49:1. O cinza de contexto (`--chart-2`, #737373) tem 4,74:1 e reprova só no croma, como todo cinza:
// ele não faz papel de série, e nenhuma informação depende de distinguir a cor dele.
export const CHART_COLORS = {
  /** O ponto que importa: o mês atual, a linha do período. */
  accent: "var(--primary)",
  /** O resto, que só dá contexto. */
  context: "var(--chart-2)",
  /** O risco da meta. */
  target: "var(--foreground)",
  axis: "var(--muted-foreground)",
  grid: "var(--border)",
  surface: "var(--card)",
} as const

/** As mesmas, em classe, para o que é desenhado em HTML. */
export const CHART_CLASSES = {
  accent: "bg-primary",
  context: "bg-chart-2",
  target: "bg-foreground",
} as const
