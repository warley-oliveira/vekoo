// O motor das fórmulas dos cards: texto, símbolos, árvore e conta. Referências por letra, de A a J, sem diferenciar
// caixa. Aceita + - * /, comparações (> < >= <= == !=) e as funções de `FUNCTIONS`.
//
// Mesmo comportamento da origem, de propósito: divisão por zero dá 0, e comparação dá 1 ou 0. O que muda é o erro:
// este módulo não fala nenhuma língua. Ele leva um código, e quem mostra é a tela (`customDashboards.formula.errors`).
// Testes de mesa em `formula-engine.check.ts`.

export type FormulaErrorCode =
  | "empty"
  | "unknownIdentifier"
  | "unexpectedCharacter"
  | "unexpectedToken"
  | "expectedToken"
  | "expectedExpression"
  | "undefinedStep"
  | "wrongArguments"
  | "unknownFunction"
  | "unknownOperator"

export class FormulaError extends Error {
  readonly code: FormulaErrorCode
  readonly position: number
  /** O que a mensagem precisa dizer: o trecho, a função, as letras que existem. */
  readonly params: Record<string, string | number>

  constructor(code: FormulaErrorCode, position: number, params: Record<string, string | number> = {}) {
    super(code)
    this.name = "FormulaError"
    this.code = code
    this.position = position
    this.params = params
  }
}

type TokenType =
  | "NUMBER"
  | "STEP_REF"
  | "FUNCTION"
  | "OPERATOR"
  | "COMPARISON"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF"

type Token = { type: TokenType; value: string; position: number }

export type ASTNode =
  | { kind: "number"; value: number }
  | { kind: "step_ref"; id: string }
  | { kind: "binary_op"; operator: string; left: ASTNode; right: ASTNode }
  | { kind: "unary_op"; operator: string; operand: ASTNode }
  | { kind: "function_call"; name: string; args: ASTNode[] }

export const FUNCTIONS = ["ABS", "ROUND", "CEIL", "FLOOR", "MIN", "MAX", "POW", "SQRT", "IF", "PERCENT"] as const

const FUNCTION_NAMES = new Set<string>(FUNCTIONS)
const TWO_CHAR_COMPARISONS = new Set([">=", "<=", "==", "!="])

function isDigit(char: string | undefined) {
  return char !== undefined && char >= "0" && char <= "9"
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < input.length) {
    const char = input[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (isDigit(char) || (char === "." && isDigit(input[index + 1]))) {
      const start = index
      while (isDigit(input[index])) index += 1
      if (input[index] === ".") {
        index += 1
        while (isDigit(input[index])) index += 1
      }
      tokens.push({ type: "NUMBER", value: input.slice(start, index), position: start })
      continue
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index
      while (index < input.length && /[A-Za-z0-9_]/.test(input[index])) index += 1
      const word = input.slice(start, index)
      const upper = word.toUpperCase()

      if (FUNCTION_NAMES.has(upper)) {
        tokens.push({ type: "FUNCTION", value: upper, position: start })
      } else if (/^[A-J]$/.test(upper)) {
        tokens.push({ type: "STEP_REF", value: upper, position: start })
      } else {
        throw new FormulaError("unknownIdentifier", start, { word })
      }
      continue
    }

    const pair = input.slice(index, index + 2)
    if (TWO_CHAR_COMPARISONS.has(pair)) {
      tokens.push({ type: "COMPARISON", value: pair, position: index })
      index += 2
      continue
    }

    if (char === ">" || char === "<") {
      tokens.push({ type: "COMPARISON", value: char, position: index })
    } else if ("+-*/".includes(char)) {
      tokens.push({ type: "OPERATOR", value: char, position: index })
    } else if (char === "(") {
      tokens.push({ type: "LPAREN", value: char, position: index })
    } else if (char === ")") {
      tokens.push({ type: "RPAREN", value: char, position: index })
    } else if (char === ",") {
      tokens.push({ type: "COMMA", value: char, position: index })
    } else {
      throw new FormulaError("unexpectedCharacter", index, { char })
    }
    index += 1
  }

  tokens.push({ type: "EOF", value: "", position: index })
  return tokens
}

// Da menor para a maior precedência: comparação, soma, multiplicação, sinal, e o resto (número, referência, função,
// parênteses). Descida recursiva, como na origem.
class Parser {
  private tokens: Token[]
  private cursor = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parse(): ASTNode {
    const node = this.comparison()
    const token = this.current()
    if (token.type !== "EOF") {
      throw new FormulaError("unexpectedToken", token.position, { token: token.value })
    }
    return node
  }

  private current(): Token {
    return this.tokens[this.cursor]
  }

  private advance(): Token {
    const token = this.tokens[this.cursor]
    this.cursor += 1
    return token
  }

  private expect(type: TokenType): Token {
    const token = this.current()
    if (token.type !== type) {
      throw new FormulaError("expectedToken", token.position, { expected: type, token: token.value })
    }
    return this.advance()
  }

  private isOperator(...operators: string[]) {
    const token = this.current()
    return token.type === "OPERATOR" && operators.includes(token.value)
  }

  private comparison(): ASTNode {
    let left = this.addition()
    while (this.current().type === "COMPARISON") {
      const operator = this.advance().value
      left = { kind: "binary_op", operator, left, right: this.addition() }
    }
    return left
  }

  private addition(): ASTNode {
    let left = this.multiplication()
    while (this.isOperator("+", "-")) {
      const operator = this.advance().value
      left = { kind: "binary_op", operator, left, right: this.multiplication() }
    }
    return left
  }

  private multiplication(): ASTNode {
    let left = this.unary()
    while (this.isOperator("*", "/")) {
      const operator = this.advance().value
      left = { kind: "binary_op", operator, left, right: this.unary() }
    }
    return left
  }

  private unary(): ASTNode {
    if (this.isOperator("-", "+")) {
      const operator = this.advance().value
      return { kind: "unary_op", operator, operand: this.unary() }
    }
    return this.primary()
  }

  private primary(): ASTNode {
    const token = this.current()

    if (token.type === "NUMBER") {
      this.advance()
      return { kind: "number", value: Number.parseFloat(token.value) }
    }

    if (token.type === "STEP_REF") {
      this.advance()
      return { kind: "step_ref", id: token.value }
    }

    if (token.type === "FUNCTION") {
      const name = this.advance().value
      this.expect("LPAREN")
      const args: ASTNode[] = []
      if (this.current().type !== "RPAREN") {
        args.push(this.comparison())
        while (this.current().type === "COMMA") {
          this.advance()
          args.push(this.comparison())
        }
      }
      this.expect("RPAREN")
      return { kind: "function_call", name, args }
    }

    if (token.type === "LPAREN") {
      this.advance()
      const expression = this.comparison()
      this.expect("RPAREN")
      return expression
    }

    throw new FormulaError("expectedExpression", token.position, { token: token.value })
  }
}

export function parseFormula(formula: string): ASTNode {
  if (!formula.trim()) throw new FormulaError("empty", 0)
  return new Parser(tokenize(formula)).parse()
}

export function extractStepIds(node: ASTNode): Set<string> {
  const ids = new Set<string>()

  function walk(current: ASTNode) {
    switch (current.kind) {
      case "step_ref":
        ids.add(current.id)
        break
      case "binary_op":
        walk(current.left)
        walk(current.right)
        break
      case "unary_op":
        walk(current.operand)
        break
      case "function_call":
        current.args.forEach(walk)
        break
      case "number":
        break
    }
  }

  walk(node)
  return ids
}

export function evaluateScalar(node: ASTNode, values: Record<string, number>): number {
  switch (node.kind) {
    case "number":
      return node.value

    case "step_ref": {
      const value = values[node.id]
      if (value === undefined) throw new FormulaError("undefinedStep", 0, { step: node.id })
      return value
    }

    case "binary_op":
      return evalBinaryOp(node.operator, evaluateScalar(node.left, values), evaluateScalar(node.right, values))

    case "unary_op": {
      const operand = evaluateScalar(node.operand, values)
      return node.operator === "-" ? -operand : operand
    }

    case "function_call":
      return evalFunction(
        node.name,
        node.args.map((arg) => evaluateScalar(arg, values))
      )
  }
}

/** A conta, ponto a ponto. A referência sem valor naquele ponto vale zero. */
export function evaluateSeries(
  node: ASTNode,
  stepMaps: Record<string, Map<string, number>>,
  dimensionValues: string[]
): Map<string, number> {
  const result = new Map<string, number>()

  for (const dimension of dimensionValues) {
    const values: Record<string, number> = {}
    for (const [stepId, map] of Object.entries(stepMaps)) {
      values[stepId] = map.get(dimension) ?? 0
    }
    result.set(dimension, evaluateScalar(node, values))
  }

  return result
}

function evalBinaryOp(operator: string, left: number, right: number): number {
  switch (operator) {
    case "+":
      return left + right
    case "-":
      return left - right
    case "*":
      return left * right
    case "/":
      return right === 0 ? 0 : left / right
    case ">":
      return left > right ? 1 : 0
    case "<":
      return left < right ? 1 : 0
    case ">=":
      return left >= right ? 1 : 0
    case "<=":
      return left <= right ? 1 : 0
    case "==":
      return left === right ? 1 : 0
    case "!=":
      return left !== right ? 1 : 0
    default:
      throw new FormulaError("unknownOperator", 0, { operator })
  }
}

function evalFunction(name: string, args: number[]): number {
  switch (name) {
    case "ABS":
      expectArgs(name, args, [1])
      return Math.abs(args[0])

    case "ROUND": {
      expectArgs(name, args, [1, 2])
      if (args.length === 1) return Math.round(args[0])
      const factor = 10 ** args[1]
      return Math.round(args[0] * factor) / factor
    }

    case "CEIL":
      expectArgs(name, args, [1])
      return Math.ceil(args[0])

    case "FLOOR":
      expectArgs(name, args, [1])
      return Math.floor(args[0])

    case "MIN":
      expectAtLeastTwo(name, args)
      return Math.min(...args)

    case "MAX":
      expectAtLeastTwo(name, args)
      return Math.max(...args)

    case "POW":
      expectArgs(name, args, [2])
      return args[0] ** args[1]

    case "SQRT":
      expectArgs(name, args, [1])
      return Math.sqrt(args[0])

    case "IF":
      expectArgs(name, args, [3])
      return args[0] !== 0 ? args[1] : args[2]

    case "PERCENT":
      expectArgs(name, args, [2])
      return args[1] === 0 ? 0 : (args[0] / args[1]) * 100

    default:
      throw new FormulaError("unknownFunction", 0, { name })
  }
}

function expectArgs(name: string, args: number[], allowed: number[]) {
  if (!allowed.includes(args.length)) {
    throw new FormulaError("wrongArguments", 0, { name, expected: allowed.join("/"), received: args.length })
  }
}

function expectAtLeastTwo(name: string, args: number[]) {
  if (args.length < 2) {
    throw new FormulaError("wrongArguments", 0, { name, expected: "2+", received: args.length })
  }
}

/**
 * Confere a fórmula sem calcular nada. `null` quando está certa. O número de argumentos também é conferido, com uma
 * conta de ensaio: uma fórmula só falharia com `MIN(A)` na hora de desenhar o card.
 */
export function validateFormula(formula: string, availableStepIds: string[]): FormulaError | null {
  try {
    const ast = parseFormula(formula)
    const available = new Set(availableStepIds.map((id) => id.toUpperCase()))
    for (const id of extractStepIds(ast)) {
      if (!available.has(id)) {
        throw new FormulaError("undefinedStep", 0, { step: id, available: availableStepIds.join(", ") })
      }
    }
    evaluateScalar(ast, Object.fromEntries([...available].map((id) => [id, 1])))
    return null
  } catch (error) {
    if (error instanceof FormulaError) return error
    throw error
  }
}
