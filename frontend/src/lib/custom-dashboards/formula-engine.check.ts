// Testes de mesa das fórmulas: o front não tem framework de teste, por decisão do projeto. Nada no app importa este
// arquivo. Para rodar, da pasta `frontend`:
//
//   npx rolldown src/lib/custom-dashboards/formula-engine.check.ts --platform node --file ~/.cache/vekoo-shot/formula-check.mjs
//   node ~/.cache/vekoo-shot/formula-check.mjs
//
// Sai com erro se algum caso falhar. Cada linha é a tabela de mesa: fórmula, valores e o que a origem daria.

import { evaluateScalar, FormulaError, parseFormula, validateFormula, type FormulaErrorCode } from "./formula-engine"
import { evaluateCompound } from "./formula-series"
import type { FormulaStep, QueryResult } from "./types"

let failures = 0
let total = 0

function check(name: string, received: unknown, expected: unknown) {
  total += 1
  const same = JSON.stringify(received) === JSON.stringify(expected)
  if (!same) {
    failures += 1
    console.log(`FALHOU ${name}: esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(received)}`)
  }
}

function calc(formula: string, values: Record<string, number> = {}) {
  return evaluateScalar(parseFormula(formula), values)
}

function errorCode(formula: string, steps = ["A", "B"]): FormulaErrorCode | null {
  return validateFormula(formula, steps)?.code ?? null
}

const VALUES = { A: 80, B: 200, C: 0 }

const CASES: [string, number][] = [
  // Aritmética e precedência
  ["1 + 2 * 3", 7],
  ["(1 + 2) * 3", 9],
  ["10 - 4 - 3", 3],
  ["24 / 4 / 2", 3],
  ["-3 + 5", 2],
  ["- - 3", 3],
  ["+3", 3],
  ["2 * -3", -6],
  [".5 + 1.5", 2],
  // Referências, sem diferenciar caixa
  ["A + B", 280],
  ["a + b", 280],
  ["A / B * 100", 40],
  // Divisão por zero dá zero, como na origem
  ["A / C", 0],
  ["A / 0 + 1", 1],
  // Comparação dá 1 ou 0, e tem a menor precedência
  ["A > B", 0],
  ["A < B", 1],
  ["A >= 80", 1],
  ["A <= 79", 0],
  ["A == 80", 1],
  ["A != 80", 0],
  ["A + 1 > A", 1],
  // Funções
  ["ABS(A - B)", 120],
  ["ROUND(2.567)", 3],
  ["ROUND(2.567, 2)", 2.57],
  ["ROUND(A / B * 100, 1)", 40],
  ["CEIL(1.1)", 2],
  ["FLOOR(1.9)", 1],
  ["MIN(A, B)", 80],
  ["MIN(A, B, C)", 0],
  ["MAX(A, B)", 200],
  ["POW(2, 10)", 1024],
  ["SQRT(81)", 9],
  ["IF(A > B, 1, 2)", 2],
  ["IF(A < B, A, B)", 80],
  ["PERCENT(A, B)", 40],
  ["PERCENT(A, C)", 0],
  ["round(percent(a, b), 1)", 40],
  // Espaços e quebras de linha
  ["  A\n+\tB ", 280],
]

for (const [formula, expected] of CASES) check(formula, calc(formula, VALUES), expected)

const ERRORS: [string, FormulaErrorCode | null][] = [
  ["A + B", null],
  ["", "empty"],
  ["   ", "empty"],
  ["A +", "expectedExpression"],
  ["(A + B", "expectedToken"],
  ["A + B)", "unexpectedToken"],
  ["A B", "unexpectedToken"],
  ["FOO(A)", "unknownIdentifier"],
  ["AB", "unknownIdentifier"],
  ["K", "unknownIdentifier"],
  ["C", "undefinedStep"],
  ["A & B", "unexpectedCharacter"],
  ["0,5", "unexpectedToken"],
  ["MIN(A)", "wrongArguments"],
  ["ROUND()", "wrongArguments"],
  ["ABS(A, B)", "wrongArguments"],
  ["IF(A, B)", "wrongArguments"],
  ["ABS A", "expectedToken"],
]

for (const [formula, expected] of ERRORS) check(`erro de "${formula}"`, errorCode(formula), expected)

// `calc` também avisa da referência que não veio.
try {
  calc("Z1")
  check("identificador desconhecido lança", "nada", "FormulaError")
} catch (error) {
  check("identificador desconhecido lança", error instanceof FormulaError ? error.code : "outro", "unknownIdentifier")
}

// Junção dos passos
const STEPS: FormulaStep[] = [
  { id: "A", label: "Ganhos", dataSource: "conversations", aggregation: "count" },
  { id: "B", label: "Todos", dataSource: "daily_stats", aggregation: "sum", metric: "chats_started" },
]

function result(rows: Record<string, unknown>[], columns: string[]): QueryResult {
  return { rows, columns, labels: {}, meta: { total: rows.length, truncated: false } }
}

check(
  "fórmula sem agrupar",
  evaluateCompound("PERCENT(A, B)", { A: result([{ value: 33 }], ["value"]), B: result([{ value: 132 }], ["value"]) }, STEPS).rows,
  [{ value: 25 }]
)

check(
  "fórmula sem linhas vale zero",
  evaluateCompound("A + B", { A: result([], []), B: result([{ value: 2 }], ["value"]) }, STEPS).rows,
  [{ value: 2 }]
)

check(
  "série alinha fontes com coluna de data diferente, em ordem de data",
  evaluateCompound(
    "PERCENT(A, B)",
    {
      A: result([{ created_at: 2000, value: 1 }, { created_at: 1000, value: 5 }], ["created_at", "value"]),
      B: result([{ day: 1000, value: 10 }, { day: 2000, value: 4 }, { day: 3000, value: 8 }], ["day", "value"]),
    },
    STEPS,
    "created_at"
  ).rows,
  [
    { created_at: 1000, value: 50 },
    { created_at: 2000, value: 25 },
    { created_at: 3000, value: 0 },
  ]
)

check(
  "passo sem a dimensão vale o mesmo em todo ponto",
  evaluateCompound(
    "PERCENT(A, B)",
    {
      A: result([{ status: "open", value: 5 }, { status: "closed", value: 15 }], ["status", "value"]),
      B: result([{ value: 20 }], ["value"]),
    },
    STEPS,
    "status"
  ).rows,
  [
    { status: "closed", value: 75 },
    { status: "open", value: 25 },
  ]
)

check(
  "os nomes dos valores chegam à coluna da fórmula",
  evaluateCompound(
    "A",
    { A: { ...result([{ team_id: "1", value: 5 }], ["team_id", "value"]), labels: { team_id: { "1": "Comercial" } } } },
    [STEPS[0]],
    "team_id"
  ).labels?.team_id,
  { "1": "Comercial" }
)

console.log(`${total - failures} de ${total} casos certos`)
if (failures > 0) throw new Error(`${failures} casos falharam`)
